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
  | 'askTrends'
  | 'trendView'
  | 'close';

export const PHASES: Phase[] = [
  'lobby', 'warmup', 'hearts', 'guess', 'story', 'hottake', 'discuss', 'flyover', 'askTrends', 'trendView', 'close',
];

/** The steps of one deep dive, in order. Arrow keys move through these. */
export const DEEP_STEPS: Phase[] = ['guess', 'story', 'hottake', 'discuss'];

export type Take = 'agree' | 'disagree';

/** What everyone in the room may see. */
export interface PublicState {
  type: 'state';
  phase: Phase;
  activeSignalId: string | null;
  activeRange: { min: number; max: number } | null; // the guess range for the active signal
  revealed: boolean;
  participantCount: number;
  heartsEndsAt: number | null; // epoch ms, when the heart pick ends
  covered: string[]; // signals already deep-dived
}

/** Stage only: aggregates. Never individual answers. */
export interface Results {
  type: 'results';
  warmup: number[]; // count per option index (zeros until reveal)
  hearts: Record<string, number>; // signalId -> count
  topN: string[]; // the most-hearted signals (TOP_N), highest first
  revealed: boolean;
  gameCount: number; // how many answered the game for the active signal
  gameValues: number[]; // their answers (number, 0/1 for true-false, option index), only after reveal
  takes: { agree: number; disagree: number }; // only after reveal
  heartVoters: number; // how many people have given at least one heart
  trends: string[]; // the audience's own trends, newest first
}

/** One phone only: its own answers, so it can restore its screen. */
export interface You {
  type: 'you';
  warmup: number | null;
  hearts: string[];
  game: number | null;
  take: Take | null;
  trendCount: number;
}

export type ServerMessage = PublicState | Results | You | { type: 'error'; message: string };

export type ClientMessage =
  | { type: 'join'; participantId: string; name?: string }
  | { type: 'answer'; participantId: string; kind: 'warmup'; value: number }
  | { type: 'answer'; participantId: string; kind: 'heart'; signalId: string }
  | { type: 'answer'; participantId: string; kind: 'game'; signalId: string; value: number }
  | { type: 'answer'; participantId: string; kind: 'take'; signalId: string; value: Take }
  | { type: 'trend'; participantId: string; text: string }
  | { type: 'control'; key: string; action: 'setPhase'; value: Phase }
  | { type: 'control'; key: string; action: 'setSignal'; signalId: string; min: number; max: number }
  | { type: 'control'; key: string; action: 'reveal' }
  | { type: 'control'; key: string; action: 'reset' }
  | { type: 'hello'; role: 'stage'; key: string }
  | { type: 'hello'; role: 'phone' };

export const MAX_HEARTS = 3;
export const TOP_N = 5; // how many most-hearted trends stand out on the map
export const HEART_SECONDS = 60;
export const WARMUP_OPTIONS = 3;
export const TREND_MAX_PER_PERSON = 2;
export const TREND_MAX_LENGTH = 140;
export const FLY_SECONDS = 15;

export const SIGNAL_ID = /^[a-z0-9-]{2,40}$/;

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
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const sid = (v: unknown) => (typeof v === 'string' && SIGNAL_ID.test(v) ? v : null);

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
      if (o.kind === 'heart' && sid(o.signalId)) return { type: 'answer', participantId: pid, kind: 'heart', signalId: o.signalId as string };
      if (o.kind === 'game' && sid(o.signalId) && num(o.value) !== null) {
        return { type: 'answer', participantId: pid, kind: 'game', signalId: o.signalId as string, value: o.value as number };
      }
      if (o.kind === 'take' && sid(o.signalId) && (o.value === 'agree' || o.value === 'disagree')) {
        return { type: 'answer', participantId: pid, kind: 'take', signalId: o.signalId as string, value: o.value };
      }
      return null;
    }

    case 'trend': {
      const pid = str(o.participantId);
      const text = typeof o.text === 'string' ? o.text.trim() : '';
      if (!pid || text.length < 3 || text.length > TREND_MAX_LENGTH) return null;
      return { type: 'trend', participantId: pid, text };
    }

    case 'control': {
      const key = str(o.key, 200);
      if (!key) return null;
      if (o.action === 'setPhase' && PHASES.includes(o.value as Phase)) return { type: 'control', key, action: 'setPhase', value: o.value as Phase };
      if (o.action === 'setSignal' && sid(o.signalId) && num(o.min) !== null && num(o.max) !== null && (o.min as number) < (o.max as number)) {
        return { type: 'control', key, action: 'setSignal', signalId: o.signalId as string, min: o.min as number, max: o.max as number };
      }
      if (o.action === 'reveal') return { type: 'control', key, action: 'reveal' };
      if (o.action === 'reset') return { type: 'control', key, action: 'reset' };
      return null;
    }
  }
  return null;
}
