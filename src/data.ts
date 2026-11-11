import type { Act, Signal, SignalFile } from './types';

/** Loads /signals.json. Only signals with include !== false are shown anywhere in the app. */
export async function loadSignals(): Promise<SignalFile> {
  const res = await fetch('/signals.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`signals.json returned ${res.status}`);
  const raw = (await res.json()) as { signals?: Signal[]; acts?: Act[]; pitch?: string };
  const all = Array.isArray(raw.signals) ? raw.signals : [];
  const signals = all.filter((s) => s.include !== false).sort((a, b) => a.n - b.n);
  if (signals.length === 0) throw new Error('signals.json has no included signals');
  return { signals, acts: raw.acts ?? [], pitch: raw.pitch ?? '', placeholder: false };
}

/** The act's name, e.g. "The machines get capable". Falls back to the id. */
export function actName(acts: Act[], id: string): string {
  return acts.find((a) => a.id === id)?.title ?? id;
}

/** The act's short lens label, e.g. "Capability". */
export function actLens(acts: Act[], id: string): string {
  return acts.find((a) => a.id === id)?.lens ?? id;
}
