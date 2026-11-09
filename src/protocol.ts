// Messages shared by the room (server), the stage and the phones.
// Everything a phone or stage sends is checked on the server before it counts.

export type Phase =
  | 'lobby'
  | 'warmup'
  | 'hearts'
  | 'guess'
  | 'story'
  | 'hottake'
  | 'discuss'
  | 'flyover'
  | 'close';

export const PHASES: Phase[] = ['lobby', 'warmup', 'hearts', 'guess', 'story', 'hottake', 'discuss', 'flyover', 'close'];

/** What everyone in the room may see. */
export interface PublicState {
  type: 'state';
  phase: Phase;
  activeSignalId: string | null;
  revealed: boolean;
  participantCount: number;
  heartsEndsAt: number | null; // epoch ms, when the heart pick ends
}

/** Stage only: aggregates. Never individual answers. */
export interface Results {
  type: 'results';
  warmup: number[]; // count per option index
  hearts: Record<string, number>; // signalId -> count
  revealed: boolean;
}

/** One phone only: its own answers, so it can restore its screen. */
export interface You {
  type: 'you';
  warmup: number | null;
  hearts: string[];
}

export type ServerMessage = PublicState | Results | You | { type: 'error'; message: string };

export type ClientMessage =
  | { type: 'join'; participantId: string; name?: string }
  | { type: 'answer'; participantId: string; kind: 'warmup'; value: number }
  | { type: 'answer'; participantId: string; kind: 'heart'; signalId: string }
  | { type: 'control'; key: string; action: 'setPhase'; value: Phase }
  | { type: 'control'; key: string; action: 'reveal' }
  | { type: 'control'; key: string; action: 'reset' }
  | { type: 'hello'; role: 'stage'; key: string }
  | { type: 'hello'; role: 'phone' };

export const MAX_HEARTS = 3;
export const HEART_SECONDS = 60;
export const WARMUP_OPTIONS = 3;

export function parseClientMessage(raw: string): ClientMessage | null {
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!m || typeof m !== 'object') return null;
  const o = m as Record<string, unknown>;
  const str = (v: unknown, max = 64) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);
  switch (o.type) {
    case 'hello':
      if (o.role === 'stage' && str(o.key, 200)) return { type: 'hello', role: 'stage', key: o.key as string };
      if (o.role === 'phone') return { type: 'hello', role: 'phone' };
      return null;
    case 'join': {
      const pid = str(o.participantId);
      if (!pid) return null;
      const name = typeof o.name === 'string' ? o.name.trim().slice(0, 24) : undefined;
      return { type: 'join', participantId: pid, name: name || undefined };
    }
    case 'answer': {
      const pid = str(o.participantId);
      if (!pid) return null;
      if (o.kind === 'warmup' && Number.isInteger(o.value)) return { type: 'answer', participantId: pid, kind: 'warmup', value: o.value as number };
      if (o.kind === 'heart') {
        const sid = str(o.signalId, 16);
        if (sid) return { type: 'answer', participantId: pid, kind: 'heart', signalId: sid };
      }
      return null;
    }
    case 'control': {
      const key = str(o.key, 200);
      if (!key) return null;
      if (o.action === 'setPhase' && PHASES.includes(o.value as Phase)) return { type: 'control', key, action: 'setPhase', value: o.value as Phase };
      if (o.action === 'reveal') return { type: 'control', key, action: 'reveal' };
      if (o.action === 'reset') return { type: 'control', key, action: 'reset' };
      return null;
    }
  }
  return null;
}
