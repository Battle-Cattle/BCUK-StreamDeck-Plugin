// Shared property-inspector plumbing for every BCUK action: the Stream Deck WebSocket, the
// plugin-wide connection settings (Server URL + API key) and the status line. Each page defines
// optional hooks before this file's connect function is called by Stream Deck:
//   onButtonSettings(settings)  – per-button settings arrived
//   onPluginMessage(payload)    – the plugin sent a sendToPropertyInspector message
// A page with a dropdown filled from the plugin calls setupCatalogPage instead of handling the
// list's messages itself.
/* global onButtonSettings, onPluginMessage */

let ws = null;
let context = null;
let globals = { serverUrl: "", apiKey: "" };
// The handler setupCatalogPage registered for the plugin's list messages, if the page has one.
let catalogMessageHandler = null;
// The pending timer that clears a success status, so a newer status can cancel it.
let statusTimer = null;

/**
 * Called by Stream Deck once the page has loaded.
 * Opens the WebSocket, registers the page and asks for its settings; incoming settings and plugin messages go to the page's hooks.
 * @param {number} port The port Stream Deck's WebSocket listens on.
 * @param {string} uuid This property inspector's context.
 * @param {string} registerEvent The event to register the page with.
 */
function connectElgatoStreamDeckSocket(port, uuid, registerEvent) {
	ws = new WebSocket(`ws://127.0.0.1:${port}`);

	ws.onopen = () => {
		context = uuid;
		ws.send(JSON.stringify({ event: registerEvent, uuid }));
		ws.send(JSON.stringify({ event: "getSettings", context: uuid }));
		ws.send(JSON.stringify({ event: "getGlobalSettings", context: uuid }));
	};

	ws.onmessage = (e) => {
		const data = JSON.parse(e.data);
		if (data.event === "didReceiveSettings" && typeof onButtonSettings === "function") {
			onButtonSettings(data.payload.settings || {});
		}
		if (data.event === "didReceiveGlobalSettings") {
			applyGlobalSettings(data.payload.settings || {});
		}
		if (data.event === "sendToPropertyInspector") {
			handlePluginMessage(data.payload);
		}
	};
}

/**
 * Passes a plugin message to the catalog set up by {@link setupCatalogPage} and to the page's own
 * onPluginMessage hook, whichever the page has.
 * @param {object} payload The plugin's message.
 */
function handlePluginMessage(payload) {
	if (catalogMessageHandler) catalogMessageHandler(payload);
	if (typeof onPluginMessage === "function") onPluginMessage(payload);
}

/**
 * Wires a page's dropdown to a list the plugin sends: fills it on the loaded message, shows the
 * error message, re-enables the refresh button after either, and makes the refresh button save
 * the connection fields and ask the plugin to refetch with them.
 * @param {object} options How the page's list is named, delivered and drawn.
 * @param {string} options.selectId The dropdown's element id.
 * @param {string} options.placeholder The empty first option's text, e.g. "— select a command —".
 * @param {string} options.loadedEvent The plugin's "list loaded" message name.
 * @param {string} options.errorEvent The plugin's "list failed" message name.
 * @param {string} options.listKey The key holding the list in the loaded message.
 * @param {string} options.refreshEvent The message the refresh button sends.
 * @param {string} options.noun The list's name in status text, lower case, e.g. "commands".
 * @param {(select: HTMLSelectElement, items: Array<object>) => void} options.render Appends the
 *   items' options to the emptied dropdown.
 * @param {() => void} options.onLoaded Runs after each render, e.g. to reselect the saved value.
 * @returns {{isLoaded: () => boolean, redraw: () => void}} `isLoaded` says whether the plugin's
 *   list has been loaded into the dropdown yet; `redraw` renders the last loaded list again (e.g.
 *   after the page's filter changes), and does nothing before a list has loaded.
 */
function setupCatalogPage(options) {
	const select = document.getElementById(options.selectId);
	const refreshButton = document.getElementById("refreshBtn");
	const capitalised = options.noun.charAt(0).toUpperCase() + options.noun.slice(1);
	let loaded = false;
	let items = [];

	/** Empties the dropdown and renders the last loaded list after the placeholder. */
	const draw = () => {
		select.innerHTML = "";
		const placeholder = document.createElement("option");
		placeholder.value = "";
		placeholder.textContent = options.placeholder;
		select.appendChild(placeholder);
		options.render(select, items);
		options.onLoaded();
	};

	catalogMessageHandler = (payload) => {
		if (payload.event === options.loadedEvent) {
			items = payload[options.listKey] || [];
			loaded = true;
			draw();
			setStatus(`${capitalised} loaded.`, true);
		} else if (payload.event === options.errorEvent) {
			setStatus(`Error: ${payload.error}`);
		} else {
			return;
		}
		refreshButton.disabled = false;
	};

	refreshButton.addEventListener("click", () => {
		setStatus(`Fetching ${options.noun}…`);
		refreshButton.disabled = true;
		// Save first, and pass the fields along, so the plugin uses exactly what's in the form.
		const { serverUrl, apiKey } = saveGlobal();
		sendToPlugin({ event: options.refreshEvent, serverUrl, apiKey });
	});

	return {
		isLoaded: () => loaded,
		/** Renders the last loaded list again; does nothing before one has loaded. */
		redraw: () => {
			if (loaded) draw();
		},
	};
}

/**
 * Whether any of an item's fields contains the filter text, ignoring case and a leading "!" on the
 * filter (so "clap" and "!clap" both find "!clap").
 * @param {string} filter What the user typed; blank matches everything.
 * @param {...(string|null|undefined)} fields The item's searchable text, e.g. its command and category.
 * @returns {boolean} True when the filter is blank or found in at least one field.
 */
function matchesFilter(filter, ...fields) {
	const needle = filter.trim().toLowerCase().replace(/^!/, "");
	if (!needle) return true;
	return fields.some((field) => typeof field === "string" && field.toLowerCase().includes(needle));
}

/**
 * Groups a list by one of its fields, keeping the list's order within each group and the order in
 * which groups first appear, with items that have no value for the field in a last group.
 * @param {Array<object>} items The list, e.g. the bot's SFX triggers.
 * @param {string} key The field to group by, e.g. "categoryName".
 * @returns {Array<{label: string|null, items: Array<object>}>} One entry per distinct value, the
 *   ungrouped items last under a null label.
 */
function groupByField(items, key) {
	const groups = new Map();
	for (const item of items) {
		const label = typeof item[key] === "string" && item[key] ? item[key] : null;
		if (!groups.has(label)) groups.set(label, []);
		groups.get(label).push(item);
	}
	const ungrouped = groups.get(null);
	groups.delete(null);
	const result = [...groups].map(([label, grouped]) => ({ label, items: grouped }));
	if (ungrouped) result.push({ label: null, items: ungrouped });
	return result;
}

/**
 * Reads stored global settings, turning the pre-1.2 host/port pair into a Server URL so the
 * field shows what the plugin is actually using.
 * @param {object} s The stored global settings.
 */
function applyGlobalSettings(s) {
	globals = migrateGlobalSettings(s);
	document.getElementById("serverUrl").value = globals.serverUrl;
	document.getElementById("apiKey").value = globals.apiKey;
	updateUrlWarning();
}

/**
 * Reads raw global settings, falling back to the legacy host/port pair (always plain HTTP) when no
 * Server URL has been saved yet. Must match the plugin's migrateGlobalSettings (src/api.ts):
 * src/piCommon.test.ts runs the same cases against both.
 * @param {object} raw Settings as stored by Stream Deck.
 * @returns {{serverUrl: string, apiKey: string}} The trimmed Server URL (or one built from
 *   host/port, or empty) and the API key (empty if unset).
 */
function migrateGlobalSettings(raw) {
	const apiKey = typeof raw.apiKey === "string" ? raw.apiKey : "";
	if (typeof raw.serverUrl === "string" && raw.serverUrl.trim()) {
		return { serverUrl: raw.serverUrl.trim(), apiKey };
	}
	if (typeof raw.host === "string" && raw.host.trim()) {
		const port = typeof raw.port === "number" ? raw.port : 3000;
		return { serverUrl: `http://${raw.host.trim()}:${port}`, apiKey };
	}
	return { serverUrl: "", apiKey };
}

/**
 * Saves the form's connection fields as the plugin-wide settings (setGlobalSettings replaces the
 * whole object, so both fields are always sent).
 * @returns {{serverUrl: string, apiKey: string}} The saved fields.
 */
function saveGlobal() {
	globals = {
		serverUrl: document.getElementById("serverUrl").value.trim(),
		apiKey: document.getElementById("apiKey").value.trim(),
	};
	send("setGlobalSettings", globals);
	updateUrlWarning();
	return globals;
}

/** Warns when the Server URL would send the API key over plain HTTP to a non-local host. */
function updateUrlWarning() {
	const el = document.getElementById("urlWarning");
	if (!el) return;
	const url = globals.serverUrl;
	const insecure = /^http:\/\//i.test(url) && !isLoopbackUrl(url);
	el.textContent = insecure ? "Plain HTTP sends your API key unencrypted. Use https:// if the bot has it." : "";
}

/**
 * Whether a URL's host is this machine. Matches the plugin's isLoopbackHost (src/api.ts), which
 * src/piCommon.test.ts checks with a shared case table:
 * localhost, [::1] and all of 127.x.x.x. The host is parsed, so user-info such as
 * http://127.0.0.1:x@remote.example can't pass for loopback; an unparseable URL isn't loopback.
 * @param {string} url The Server URL.
 * @returns {boolean} True for a URL whose host is this machine.
 */
function isLoopbackUrl(url) {
	let host;
	try {
		host = new URL(url).hostname;
	} catch {
		return false;
	}
	return host === "localhost" || host === "[::1]" || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

/**
 * Sends an event for this property inspector to Stream Deck; does nothing until the socket is open.
 * @param {string} event The Stream Deck event name.
 * @param {object} payload The event's payload.
 */
function send(event, payload) {
	if (!ws || ws.readyState !== WebSocket.OPEN) return;
	ws.send(JSON.stringify({ event, context, payload }));
}

/**
 * Saves this button's own settings.
 * @param {object} settings The button's complete settings (they replace what's stored).
 */
function setButtonSettings(settings) {
	send("setSettings", settings);
}

/**
 * Sends a message to the plugin (it arrives as the action's onSendToPlugin).
 * @param {object} payload The message.
 */
function sendToPlugin(payload) {
	send("sendToPlugin", payload);
}

/**
 * Selects a button's saved value in a dropdown. If the list has loaded but no longer has it
 * (e.g. a command renamed or deleted on the bot), adds it as "<label> (not found)" instead of
 * silently showing the placeholder, so it's clear why the key now shows an alert.
 * @param {HTMLSelectElement} select The dropdown.
 * @param {string} value The saved value; nothing happens when it's empty.
 * @param {string} label Text for the "(not found)" option.
 * @param {boolean} listLoaded Whether the plugin's list has been loaded into the dropdown yet.
 */
function selectSaved(select, value, label, listLoaded) {
	if (!value) return;
	const present = [...select.options].some((opt) => opt.value === value);
	if (!present && listLoaded) {
		const opt = document.createElement("option");
		opt.value = value;
		opt.textContent = `${label} (not found)`;
		select.appendChild(opt);
	}
	select.value = value;
}

/**
 * Shows a status line under the form; a success message clears itself after 3 seconds.
 * @param {string} msg The text to show.
 * @param {boolean} isOk Whether it's a success message (styled green) rather than an error or progress.
 */
function setStatus(msg, isOk = false) {
	const el = document.getElementById("status");
	// Leave Voice's page has no list, so no status line.
	if (!el) return;
	// A newer message replaces the old one, so the old one's timer mustn't clear it early.
	if (statusTimer !== null) clearTimeout(statusTimer);
	statusTimer = null;
	el.textContent = msg;
	el.className = isOk ? "ok" : "";
	if (isOk) {
		statusTimer = setTimeout(() => {
			el.textContent = "";
			el.className = "";
			statusTimer = null;
		}, 3000);
	}
}

document.getElementById("serverUrl").addEventListener("change", saveGlobal);
document.getElementById("apiKey").addEventListener("change", saveGlobal);
