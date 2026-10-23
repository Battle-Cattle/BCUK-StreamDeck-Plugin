// Shared property-inspector plumbing for every BCUK action: the Stream Deck WebSocket, the
// plugin-wide connection settings (Server URL + API key) and the status line. Each page defines
// optional hooks before this file's connect function is called by Stream Deck:
//   onButtonSettings(settings)  – per-button settings arrived
//   onPluginMessage(payload)    – the plugin sent a sendToPropertyInspector message
/* global onButtonSettings, onPluginMessage */

let ws = null;
let context = null;
let globals = { serverUrl: "", apiKey: "" };

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
		if (data.event === "sendToPropertyInspector" && typeof onPluginMessage === "function") {
			onPluginMessage(data.payload);
		}
	};
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
	el.textContent = msg;
	el.className = isOk ? "ok" : "";
	if (isOk) setTimeout(() => { el.textContent = ""; el.className = ""; }, 3000);
}

document.getElementById("serverUrl").addEventListener("change", saveGlobal);
document.getElementById("apiKey").addEventListener("change", saveGlobal);
