import { API_BASE, getToken } from "./api";

/**
 * Минимальный STOMP-клиент поверх нативного WebSocket (без внешних зависимостей).
 * Реализует ровно то, что нужно чату: CONNECT, SUBSCRIBE, SEND, приём MESSAGE.
 */

function wsUrl() {
  if (API_BASE) return API_BASE.replace(/^http/i, "ws") + "/ws";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}

const NULL = String.fromCharCode(0); // STOMP-фреймы завершаются NUL-байтом

function buildFrame(command, headers = {}, body = "") {
  let frame = command + "\n";
  for (const k in headers) frame += `${k}:${headers[k]}\n`;
  frame += "\n" + body + NULL;
  return frame;
}

function parseFrame(data) {
  const nul = data.indexOf(NULL);
  const raw = nul >= 0 ? data.slice(0, nul) : data;
  const sep = raw.indexOf("\n\n");
  const head = sep >= 0 ? raw.slice(0, sep) : raw;
  const body = sep >= 0 ? raw.slice(sep + 2) : "";
  const lines = head.split("\n");
  const command = lines[0];
  const headers = {};
  for (let i = 1; i < lines.length; i++) {
    const idx = lines[i].indexOf(":");
    if (idx > 0) headers[lines[i].slice(0, idx)] = lines[i].slice(idx + 1);
  }
  return { command, headers, body };
}

export function createChatSocket(onEvent, onStatus) {
  let ws = null;
  let active = false;
  let reconnectTimer = null;

  const open = () => {
    const token = getToken();
    if (!token || ws) return;
    try {
      ws = new WebSocket(wsUrl(), ["v12.stomp", "v11.stomp", "v10.stomp"]);
    } catch {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      ws.send(buildFrame("CONNECT", {
        "accept-version": "1.2",
        "heart-beat": "0,0",
        Authorization: `Bearer ${token}`,
      }));
    };

    ws.onmessage = (evt) => {
      if (typeof evt.data !== "string" || evt.data === "\n") return; // heartbeat
      const { command, body } = parseFrame(evt.data);
      if (command === "CONNECTED") {
        onStatus?.(true);
        ws.send(buildFrame("SUBSCRIBE", { id: "sub-chat", destination: "/user/queue/chat" }));
      } else if (command === "MESSAGE") {
        try { onEvent(JSON.parse(body)); } catch { /* ignore */ }
      } else if (command === "ERROR") {
        try { ws.close(); } catch { /* ignore */ }
      }
    };

    ws.onclose = () => {
      ws = null;
      onStatus?.(false);
      scheduleReconnect();
    };
    ws.onerror = () => { try { if (ws) ws.close(); } catch { /* ignore */ } };
  };

  const scheduleReconnect = () => {
    if (!active || reconnectTimer) return;
    reconnectTimer = setTimeout(() => { reconnectTimer = null; if (active) open(); }, 4000);
  };

  return {
    connect() {
      active = true;
      open();
    },
    disconnect() {
      active = false;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (ws) { try { ws.close(); } catch { /* ignore */ } ws = null; }
      onStatus?.(false);
    },
    sendTyping(conversationId) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(buildFrame("SEND", { destination: "/app/chat.typing", "content-type": "application/json" },
          JSON.stringify({ conversationId })));
      }
    },
  };
}
