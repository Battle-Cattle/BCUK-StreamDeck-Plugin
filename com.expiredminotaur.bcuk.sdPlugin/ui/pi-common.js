// Shared property-inspector plumbing for every BCUK action: the Stream Deck WebSocket, the
// plugin-wide connection settings (Server URL + API key) and the status line. Each page defines
// optional hooks before this file's connect function is called by Stream Deck:
//   onButtonSettings(settings)  – per-button settings arrived
//   onPluginMessage(payload)    – the plugin sent a sendToPropertyInspector message

let ws = null;
let context = null;
let globals = { serverUrl: "", apiKey: "" };

// Called by Stream Deck once the page has loaded.
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

// Reads stored global settings, turning the pre-1.2 host/port pair into a Server URL so the
// field shows what the plugin is actually using.
function applyGlobalSettings(s) {
	let serverUrl = typeof s.serverUrl === "string" ? s.serverUrl : "";
	if (!serverUrl && typeof s.host === "string" && s.host) {
		serverUrl = `http://${s.host}:${s.port || 3000}`;
	}
	globals = { serverUrl, apiKey: typeof s.apiKey === "string" ? s.apiKey : "" };
	document.getElementById("serverUrl").value = globals.serverUrl;
	document.getElementById("apiKey").value = globals.apiKey;
	updateUrlWarning();
}

// Saves the form's connection fields as the plugin-wide settings (setGlobalSettings replaces the
// whole object, so both fields are always sent).
function saveGlobal() {
	globals = {
		serverUrl: document.getElementById("serverUrl").value.trim(),
		apiKey: document.getElementById("apiKey").value.trim(),
	};
	send("setGlobalSettings", globals);
	updateUrlWarning();
	return globals;
}

// Warns when the Server URL would send the API key over plain HTTP to a non-local host.
function updateUrlWarning() {
	const el = document.getElementById("urlWarning");
	if (!el) return;
	const url = globals.serverUrl;
	const insecure = /^http:\/\//i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(url);
	el.textContent = insecure ? "Plain HTTP sends your API key unencrypted. Use https:// if the bot has it." : "";
}

function send(event, payload) {
	if (!ws || ws.readyState !== WebSocket.OPEN) return;
	ws.send(JSON.stringify({ event, context, payload }));
}

function setButtonSettings(settings) {
	send("setSettings", settings);
}

function sendToPlugin(payload) {
	send("sendToPlugin", payload);
}

function setStatus(msg, isOk = false) {
	const el = document.getElementById("status");
	el.textContent = msg;
	el.className = isOk ? "ok" : "";
	if (isOk) setTimeout(() => { el.textContent = ""; el.className = ""; }, 3000);
}

document.getElementById("serverUrl").addEventListener("change", saveGlobal);
document.getElementById("apiKey").addEventListener("change", saveGlobal);
