import type { Signal, SignalFile } from './types';

/** Loads /signals.json. Accepts either a bare array or { signals: [...] }. */
export async function loadSignals(): Promise<SignalFile> {
  const res = await fetch('/signals.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`signals.json returned ${res.status}`);
  const raw: unknown = await res.json();
  const list = (Array.isArray(raw) ? raw : (raw as { signals?: unknown }).signals) as Signal[] | undefined;
  if (!Array.isArray(list) || list.length === 0) throw new Error('signals.json has no signals');
  const placeholder = !Array.isArray(raw) && Boolean((raw as { placeholder?: boolean }).placeholder);
  const signals = [...list].sort((a, b) => a.n - b.n);
  return { signals, placeholder };
}

export function actLabel(act: Signal['act']): string {
  return typeof act === 'number' ? `Act ${act}` : String(act);
}
