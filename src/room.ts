import { DurableObject } from 'cloudflare:workers';
import {
  DEEP_STEPS,
  HEART_SECONDS,
  MAX_HEARTS,
  PHASES,
  TREND_MAX_PER_PERSON,
  WARMUP_OPTIONS,
  parseClientMessage,
  type ClientMessage,
  type Phase,
  type PublicState,
  type Results,
  type ServerMessage,
  type Take,
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
  activeRange: { min: number; max: number } | null;
  revealed: boolean;
  heartsEndsAt: number | null;
  covered: string[];
  participants: Record<string, { name?: string }>;
  warmup: Record<string, number>;
  hearts: Record<string, string[]>;
  guesses: Record<string, Record<string, number>>; // signalId -> pid -> value
  takes: Record<string, Record<string, Take>>; // signalId -> pid -> vote
  trends: { id: string; text: string }[];
  trendsBy: Record<string, number>;
}

type Attachment = { role: 'stage' | 'phone' | null; pid: string | null };

const freshState = (): Stored => ({
  phase: 'lobby',
  activeSignalId: null,
  activeRange: null,
  revealed: false,
  heartsEndsAt: null,
  covered: [],
  participants: {},
  warmup: {},
  hearts: {},
  guesses: {},
  takes: {},
  trends: [],
  trendsBy: {},
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
    if (msg.type === 'hello') ws.serializeAttachment({ role: msg.role, pid: att?.pid ?? null } satisfies Attachment);
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

  /** Returns a direct reply for the sender, or null. The caller broadcasts the change. */
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

      case 'trend': {
        const used = s.trendsBy[msg.participantId] ?? 0;
        if (used >= TREND_MAX_PER_PERSON) return { type: 'error', message: `You can add up to ${TREND_MAX_PER_PERSON} trends` };
        s.trends.push({ id: crypto.randomUUID().slice(0, 8), text: msg.text });
        if (s.trends.length > 300) s.trends.splice(0, s.trends.length - 300);
        s.trendsBy[msg.participantId] = used + 1;
        await this.save();
        return this.yourAnswers(s, msg.participantId);
      }

      case 'answer': {
        const pid = msg.participantId;
        if (msg.kind === 'warmup') {
          if (s.phase !== 'warmup' || s.revealed) return { type: 'error', message: 'Warm-up is closed' };
          if (msg.value < 0 || msg.value >= WARMUP_OPTIONS) return { type: 'error', message: 'Option out of range' };
          s.warmup[pid] = msg.value;
        } else if (msg.kind === 'heart') {
          if (s.phase !== 'hearts' || s.revealed) return { type: 'error', message: 'Hearts are closed' };
          const mine = s.hearts[pid] ?? [];
          if (mine.includes(msg.signalId)) {
            s.hearts[pid] = mine.filter((x) => x !== msg.signalId);
          } else if (mine.length >= MAX_HEARTS) {
            return { type: 'error', message: `You can give up to ${MAX_HEARTS} hearts` };
          } else {
            s.hearts[pid] = [...mine, msg.signalId];
          }
        } else if (msg.kind === 'guess') {
          const range = s.activeRange;
          if (s.phase !== 'guess' || s.revealed || s.activeSignalId !== msg.signalId || !range) {
            return { type: 'error', message: 'Guessing is closed' };
          }
          if (msg.value < range.min || msg.value > range.max) return { type: 'error', message: 'Your guess is outside the scale' };
          s.guesses[msg.signalId] = { ...(s.guesses[msg.signalId] ?? {}), [pid]: msg.value };
        } else if (msg.kind === 'take') {
          if (s.phase !== 'hottake' || s.revealed || s.activeSignalId !== msg.signalId) {
            return { type: 'error', message: 'Voting is closed' };
          }
          s.takes[msg.signalId] = { ...(s.takes[msg.signalId] ?? {}), [pid]: msg.value };
        }
        await this.save();
        return this.yourAnswers(s, pid);
      }

      case 'control': {
        // Every control message carries the presenter key, so only the stage can send one.
        if (msg.key !== this.env.PRESENTER_KEY) return { type: 'error', message: 'Presenter key is wrong' };

        if (msg.action === 'setSignal') {
          s.activeSignalId = msg.signalId;
          s.activeRange = { min: msg.min, max: msg.max };
          s.revealed = false;
        } else if (msg.action === 'setPhase') {
          if (!PHASES.includes(msg.value)) return { type: 'error', message: 'Unknown phase' };
          s.phase = msg.value;
          s.revealed = false;
          if (msg.value === 'guess' && s.activeSignalId && !s.covered.includes(s.activeSignalId)) {
            s.covered.push(s.activeSignalId);
          }
          // The split stays on screen during the conversation, so reveal it straight away.
          if (msg.value === 'discuss') s.revealed = true;
          if (msg.value === 'hearts') {
            s.heartsEndsAt = Date.now() + HEART_SECONDS * 1000;
            await this.ctx.storage.setAlarm(s.heartsEndsAt);
          } else {
            s.heartsEndsAt = null;
          }
        } else if (msg.action === 'reveal') {
          s.revealed = true;
        } else if (msg.action === 'reset') {
          Object.assign(s, freshState(), { participants: s.participants });
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
      activeRange: s.activeRange,
      revealed: s.revealed,
      participantCount: Object.keys(s.participants).length,
      heartsEndsAt: s.heartsEndsAt,
      covered: s.covered,
    };
  }

  private results(s: Stored): Results {
    const warmup = Array.from({ length: WARMUP_OPTIONS }, () => 0);
    for (const v of Object.values(s.warmup)) warmup[v] += 1;
    const hearts: Record<string, number> = {};
    for (const list of Object.values(s.hearts)) for (const id of list) hearts[id] = (hearts[id] ?? 0) + 1;
    const top3 = Object.entries(hearts)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3)
      .map(([id]) => id);

    const active = s.activeSignalId;
    const guessMap = active ? s.guesses[active] ?? {} : {};
    const takeMap = active ? s.takes[active] ?? {} : {};
    const agree = Object.values(takeMap).filter((t) => t === 'agree').length;
    const disagree = Object.values(takeMap).filter((t) => t === 'disagree').length;

    return {
      type: 'results',
      warmup: s.revealed ? warmup : warmup.map(() => 0),
      hearts,
      top3,
      revealed: s.revealed,
      guessCount: Object.keys(guessMap).length,
      guessValues: s.revealed ? Object.values(guessMap) : [],
      takes: s.revealed ? { agree, disagree } : { agree: 0, disagree: 0 },
      trends: s.trends.slice().reverse().map((t) => t.text),
    };
  }

  private yourAnswers(s: Stored, pid: string): You {
    const active = s.activeSignalId;
    return {
      type: 'you',
      warmup: pid in s.warmup ? s.warmup[pid] : null,
      hearts: s.hearts[pid] ?? [],
      guess: active && s.guesses[active] ? (s.guesses[active][pid] ?? null) : null,
      take: active && s.takes[active] ? (s.takes[active][pid] ?? null) : null,
      trendCount: s.trendsBy[pid] ?? 0,
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

export { DEEP_STEPS };
