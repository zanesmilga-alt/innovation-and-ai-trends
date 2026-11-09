import type { ClientMessage, ServerMessage } from '../protocol';

export type LinkStatus = 'live' | 'reconnecting' | 'polling';

export interface Link {
  send(msg: ClientMessage): void;
  close(): void;
}

interface Options {
  code: string;
  hello: ClientMessage;
  /** Sent again after every (re)connect, e.g. the phone's join. */
  onOpen?: (send: (m: ClientMessage) => void) => void;
  onMessage: (m: ServerMessage) => void;
  onStatus: (s: LinkStatus) => void;
  /** Stage only: the presenter key, used by the polling fallback. */
  key?: string;
  /** Phone only: the participant id, used by the polling fallback. */
  pid?: string;
}

const MAX_FAILURES_BEFORE_POLLING = 3;

/**
 * Keeps one live connection to a room. If WebSockets keep failing (for example on an
 * office network that blocks them), it switches to polling the room every 2 seconds.
 */
export function connectRoom(o: Options): Link {
  let ws: WebSocket | null = null;
  let failures = 0;
  let closed = false;
  let pollTimer: number | undefined;
  let retryTimer: number | undefined;
  let polling = false;

  const url = () => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}/api/room/${encodeURIComponent(o.code)}/ws`;
  };

  const sendWs = (m: ClientMessage) => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
  };

  const sendPoll = async (m: ClientMessage) => {
    try {
      const res = await fetch(`/api/room/${encodeURIComponent(o.code)}/message`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(m),
      });
      const reply = (await res.json()) as ServerMessage;
      if (reply && (reply as { type?: string }).type === 'error') o.onMessage(reply);
    } catch {
      // network blip: the next poll will catch up
    }
  };

  const send = (m: ClientMessage) => (polling ? void sendPoll(m) : sendWs(m));

  const startPolling = () => {
    polling = true;
    o.onStatus('polling');
    const tick = async () => {
      if (closed) return;
      try {
        const qs = new URLSearchParams();
        if (o.pid) qs.set('pid', o.pid);
        if (o.key) qs.set('key', o.key);
        const res = await fetch(`/api/room/${encodeURIComponent(o.code)}/poll?${qs.toString()}`);
        const body = (await res.json()) as { state: ServerMessage; you?: ServerMessage; results?: ServerMessage };
        o.onMessage(body.state);
        if (body.you) o.onMessage(body.you);
        if (body.results) o.onMessage(body.results);
      } catch {
        // try again on the next tick
      }
    };
    void tick();
    pollTimer = window.setInterval(tick, 2000);
    if (o.onOpen) o.onOpen(send);
  };

  const connect = () => {
    if (closed) return;
    o.onStatus('reconnecting');
    let socket: WebSocket;
    try {
      socket = new WebSocket(url());
    } catch {
      return failed();
    }
    ws = socket;
    socket.onopen = () => {
      failures = 0;
      o.onStatus('live');
      socket.send(JSON.stringify(o.hello));
      if (o.onOpen) o.onOpen(sendWs);
    };
    socket.onmessage = (ev) => {
      try {
        o.onMessage(JSON.parse(String(ev.data)) as ServerMessage);
      } catch {
        // ignore a malformed message
      }
    };
    socket.onclose = () => {
      ws = null;
      if (!closed) failed();
    };
    socket.onerror = () => socket.close();
  };

  const failed = () => {
    failures += 1;
    if (failures >= MAX_FAILURES_BEFORE_POLLING && !polling) {
      startPolling();
      return;
    }
    if (polling) return;
    const wait = Math.min(8000, 1000 * 2 ** (failures - 1));
    o.onStatus('reconnecting');
    retryTimer = window.setTimeout(connect, wait);
  };

  // Start after the caller has finished setting up, so status callbacks can use its screens.
  window.setTimeout(connect, 0);

  return {
    send,
    close() {
      closed = true;
      if (pollTimer) clearInterval(pollTimer);
      if (retryTimer) clearTimeout(retryTimer);
      ws?.close();
    },
  };
}

/** A random id the phone keeps in localStorage, so a refresh keeps its answers. */
export function participantId(): string {
  const key = 'signalroom.pid';
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const id = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/-/g, '').slice(0, 32);
    localStorage.setItem(key, id);
    return id;
  } catch {
    return `tmp-${Math.random().toString(36).slice(2)}`;
  }
}
