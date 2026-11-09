import { DurableObject } from 'cloudflare:workers';
import {
  HEART_SECONDS,
  MAX_HEARTS,
  PHASES,
  WARMUP_OPTIONS,
  parseClientMessage,
  type ClientMessage,
  type Phase,
  type PublicState,
  type Results,
  type ServerMessage,
  type You,
} from './protocol';

export interface Env {
  ROOM: DurableObjectNamespace<Room>;
  ASSETS: Fetcher;
  PRESENTER_KEY: string;
}

/** Everything the room remembers. Saved to storage after every change. */
interface Stored {
  phase: Phase;
  activeSignalId: string | null;
  revealed: boolean;
  heartsEndsAt: number | null;
  participants: Record<string, { name?: string }>;
  warmup: Record<string, number>;
  hearts: Record<string, string[]>;
}

type Attachment = { role: 'stage' | 'phone' | null; pid: string | null };

const freshState = (): Stored => ({
  phase: 'lobby',
  activeSignalId: null,
  revealed: false,
  heartsEndsAt: null,
  participants: {},
  warmup: {},
  hearts: {},
});

/**
 * One Room per room code. Holds the live state for the stage and all phones.
 * Uses WebSocket hibernation, so idle rooms cost nothing.
 */
export class Room extends DurableObject<Env> {
  private s: Stored | null = null;

  private async load(): Promise<Stored> {
    if (!this.s) this.s = (await this.ctx.storage.get<Stored>('state')) ?? freshState();
    return this.s;
  }

  private async save(): Promise<void> {
    await this.ctx.storage.put('state', this.s);
  }

  // ---------- HTTP entry points (called by the Worker) ----------

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === '/ws') {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected websocket', { status: 426 });
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ role: null, pid: null } satisfies Attachment);
      return new Response(null, { status: 101, webSocket: client });
    }

    // Fallback for networks that block WebSockets: phones and the stage poll this.
    if (url.pathname === '/poll') {
      const s = await this.load();
      const pid = url.searchParams.get('pid');
      const key = url.searchParams.get('key');
      const isStage = key !== null && key === this.env.PRESENTER_KEY;
      const body: { state: PublicState; you?: You; results?: Results } = { state: this.publicState(s) };
      if (pid) body.you = this.yourAnswers(s, pid);
      if (isStage) body.results = this.results(s);
      return Response.json(body);
    }

    if (url.pathname === '/message' && req.method === 'POST') {
      const msg = parseClientMessage(await req.text());
      if (!msg) return Response.json({ type: 'error', message: 'Not understood' } satisfies ServerMessage, { status: 400 });
      const reply = await this.handle(msg);
      await this.broadcast();
      return Response.json(reply ?? { ok: true });
    }

    return new Response('Not found', { status: 404 });
  }

  // ---------- WebSocket handlers (hibernation API) ----------

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const msg = parseClientMessage(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    if (!msg) {
      ws.send(JSON.stringify({ type: 'error', message: 'Not understood' } satisfies ServerMessage));
      return;
    }
    const att = ws.deserializeAttachment() as Attachment;
    const reply = await this.handle(msg);
    if (msg.type === 'hello' && att) {
      const next: Attachment = { role: msg.role, pid: att.pid };
      ws.serializeAttachment(next);
    }
    if (msg.type === 'join') ws.serializeAttachment({ role: 'phone', pid: msg.participantId } satisfies Attachment);
    if (reply) ws.send(JSON.stringify(reply));
    await this.broadcast();
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    ws.close(code, 'closed');
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    ws.close(1011, 'error');
  }

  // ---------- Timer: the heart pick ends by itself ----------

  async alarm(): Promise<void> {
    const s = await this.load();
    if (s.phase === 'hearts' && s.heartsEndsAt && Date.now() >= s.heartsEndsAt - 500 && !s.revealed) {
      s.revealed = true;
      await this.save();
      await this.broadcast();
    }
  }

  // ---------- Rules ----------

  /** Returns a direct reply for the sender, or null. Changes are saved and broadcast by the caller. */
  private async handle(msg: ClientMessage): Promise<ServerMessage | null> {
    const s = await this.load();

    switch (msg.type) {
      case 'hello': {
        if (msg.role === 'stage') {
          if (msg.key !== this.env.PRESENTER_KEY) return { type: 'error', message: 'Presenter key is wrong' };
          return this.results(s);
        }
        return null;
      }

      case 'join': {
        s.participants[msg.participantId] = { name: msg.name };
        await this.save();
        return this.yourAnswers(s, msg.participantId);
      }

      case 'answer': {
        if (msg.kind === 'warmup') {
          if (s.phase !== 'warmup' || s.revealed) return { type: 'error', message: 'Warm-up is closed' };
          if (msg.value < 0 || msg.value >= WARMUP_OPTIONS) return { type: 'error', message: 'Option out of range' };
          s.warmup[msg.participantId] = msg.value;
          await this.save();
          return this.yourAnswers(s, msg.participantId);
        }
        // heart
        if (s.phase !== 'hearts' || s.revealed) return { type: 'error', message: 'Hearts are closed' };
        if (!/^s\d{2}$/.test(msg.signalId)) return { type: 'error', message: 'Unknown signal' };
        const mine = s.hearts[msg.participantId] ?? [];
        if (mine.includes(msg.signalId)) {
          s.hearts[msg.participantId] = mine.filter((x) => x !== msg.signalId);
        } else if (mine.length >= MAX_HEARTS) {
          return { type: 'error', message: `You can give up to ${MAX_HEARTS} hearts` };
        } else {
          s.hearts[msg.participantId] = [...mine, msg.signalId];
        }
        await this.save();
        return this.yourAnswers(s, msg.participantId);
      }

      case 'control': {
        // Every control message carries the presenter key, so only the stage can send one.
        if (msg.key !== this.env.PRESENTER_KEY) return { type: 'error', message: 'Presenter key is wrong' };
        if (msg.action === 'setPhase') {
          if (!PHASES.includes(msg.value)) return { type: 'error', message: 'Unknown phase' };
          s.phase = msg.value;
          s.revealed = false;
          if (msg.value === 'hearts') {
            s.heartsEndsAt = Date.now() + HEART_SECONDS * 1000;
            await this.ctx.storage.setAlarm(s.heartsEndsAt);
          } else {
            s.heartsEndsAt = null;
          }
        } else if (msg.action === 'reveal') {
          s.revealed = true;
        } else if (msg.action === 'reset') {
          s.warmup = {};
          s.hearts = {};
          s.revealed = false;
          s.heartsEndsAt = null;
          s.activeSignalId = null;
          await this.ctx.storage.deleteAlarm();
        }
        await this.save();
        return null;
      }
    }
    return null;
  }

  // ---------- Views ----------

  private publicState(s: Stored): PublicState {
    return {
      type: 'state',
      phase: s.phase,
      activeSignalId: s.activeSignalId,
      revealed: s.revealed,
      participantCount: Object.keys(s.participants).length,
      heartsEndsAt: s.heartsEndsAt,
    };
  }

  private results(s: Stored): Results {
    const warmup = Array.from({ length: WARMUP_OPTIONS }, () => 0);
    for (const v of Object.values(s.warmup)) warmup[v] += 1;
    const hearts: Record<string, number> = {};
    for (const list of Object.values(s.hearts)) for (const id of list) hearts[id] = (hearts[id] ?? 0) + 1;
    // Warm-up and hearts are only shown on stage after the reveal, except the live heart count.
    return { type: 'results', warmup: s.revealed ? warmup : warmup.map(() => 0), hearts, revealed: s.revealed };
  }

  private yourAnswers(s: Stored, pid: string): You {
    return {
      type: 'you',
      warmup: pid in s.warmup ? s.warmup[pid] : null,
      hearts: s.hearts[pid] ?? [],
    };
  }

  /** Sends the public state to everyone, and results to the stage only. */
  private async broadcast(): Promise<void> {
    const s = await this.load();
    const pub = JSON.stringify(this.publicState(s));
    const res = JSON.stringify(this.results(s));
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      try {
        ws.send(pub);
        if (att?.role === 'stage') ws.send(res);
        if (att?.role === 'phone' && att.pid) ws.send(JSON.stringify(this.yourAnswers(s, att.pid)));
      } catch {
        // socket already closed; hibernation cleans it up
      }
    }
  }
}
