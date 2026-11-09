import QRCode from 'qrcode';
import { connectRoom, type LinkStatus } from './live/socket';
import type { ClientMessage, Phase, PublicState, Results, ServerMessage } from './protocol';
import { HEART_SECONDS, MAX_HEARTS } from './protocol';
import type { Signal } from './types';

interface Config {
  warmup: { question: string; options: string[] };
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

const PHASE_LABEL: Record<Phase, string> = {
  lobby: 'Join',
  warmup: 'Warm-up',
  hearts: 'Heart pick',
  guess: 'Guess the number',
  story: 'The story',
  hottake: 'Hot take',
  discuss: 'Discuss',
  flyover: 'Flyover',
  close: 'Close',
};

interface StageOptions {
  root: HTMLElement;
  nodeEls: Map<string, HTMLButtonElement>;
  signals: Signal[];
}

/** Live layer for /stage: QR and join count, warm-up, heart pick, room badge, keys. */
export async function startStage(o: StageOptions): Promise<void> {
  const params = new URLSearchParams(location.search);
  const code = (params.get('room') ?? '').toUpperCase();
  const key = params.get('key') ?? '';

  const layer = document.createElement('div');
  layer.className = 'live-layer';
  layer.innerHTML = `
    <div class="live-badge mono" id="badge" hidden></div>
    <div class="live-phase mono" id="phase" hidden></div>
    <div class="qr-panel" id="qr" hidden>
      <div class="qr-card">
        <p class="eyebrow mono">Join on your phone</p>
        <div class="qr-svg" id="qr-svg"></div>
        <p class="qr-code">Room <strong class="mono" id="qr-code"></strong></p>
        <p class="mono qr-url" id="qr-url"></p>
        <p class="mono" id="qr-count"></p>
      </div>
    </div>
    <div class="warm-panel" id="warm" hidden></div>
    <div class="timer-bar" id="timer" hidden><span class="timer-label mono" id="timer-label"></span><span class="timer-track"><span class="timer-fill" id="timer-fill"></span></span></div>
    <div class="setup" id="setup" hidden>
      <div class="setup-card">
        <p class="eyebrow mono">Presenter</p>
        <h2>Start a room</h2>
        <p class="lede">Type the presenter key set in Cloudflare (the PRESENTER_KEY secret). Your room link will contain it, so keep the link private.</p>
        <form id="setup-form" class="stack">
          <input id="setup-key" class="field" type="password" autocomplete="off" placeholder="Presenter key" />
          <button class="big-btn" type="submit">Create room</button>
        </form>
        <p class="mono small-note" id="setup-msg"></p>
      </div>
    </div>`;
  o.root.appendChild(layer);

  const $ = <T extends HTMLElement>(id: string) => layer.querySelector<T>(`#${id}`)!;
  const badge = $('badge');
  const phaseEl = $('phase');
  const qr = $('qr');
  const warm = $('warm');
  const timer = $('timer');

  // No room yet: offer to make one.
  if (!code || !key) {
    $('setup').hidden = false;
    $('setup-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const k = $<HTMLInputElement>('setup-key').value.trim();
      if (!k) return;
      location.href = `/stage?room=${newCode()}&key=${encodeURIComponent(k)}`;
    });
    return;
  }

  const config = await fetch('/config.json').then((r) => r.json() as Promise<Config>);
  let state: PublicState = { type: 'state', phase: 'lobby', activeSignalId: null, revealed: false, participantCount: 0, heartsEndsAt: null };
  let results: Results = { type: 'results', warmup: [0, 0, 0], hearts: {}, revealed: false };
  let qrOpen = false;
  let linkStatus: LinkStatus = 'reconnecting';
  let lastHearts: Record<string, number> = {};
  let error = '';

  const joinUrl = `${location.origin}/join/${code}`;
  $('qr-code').textContent = code;
  $('qr-url').textContent = joinUrl.replace(/^https?:\/\//, '');
  QRCode.toString(joinUrl, { type: 'svg', margin: 1, color: { dark: '#080C1E', light: '#F4E9DC' } })
    .then((svg) => ($('qr-svg').innerHTML = svg))
    .catch(() => ($('qr-svg').textContent = joinUrl));

  const link = connectRoom({
    code,
    key,
    hello: { type: 'hello', role: 'stage', key },
    onStatus: (s) => {
      linkStatus = s;
      render();
    },
    onMessage: (m: ServerMessage) => {
      if (m.type === 'state') state = m;
      else if (m.type === 'results') results = m;
      else if (m.type === 'error') error = m.message;
      render();
    },
  });

  const send = (m: ClientMessage) => link.send(m);

  // ---------- Drawing ----------

  const dots = (n: number, max: number) => {
    const shown = Math.min(n, 60);
    const more = n > 60 ? `<span class="mono more">+${n - 60}</span>` : '';
    return `<span class="dots">${Array.from({ length: shown }, () => '<i></i>').join('')}${more}</span>${max ? '' : ''}`;
  };

  const renderWarm = () => {
    warm.hidden = state.phase !== 'warmup';
    if (warm.hidden) return;
    const total = results.warmup.reduce((a, b) => a + b, 0);
    const cols = config.warmup.options
      .map((label, i) => `
        <div class="warm-col">
          <div class="warm-count mono">${results.revealed ? results.warmup[i] : ''}</div>
          <div class="warm-bar">${results.revealed ? dots(results.warmup[i], total) : ''}</div>
          <div class="warm-label">${esc(label)}</div>
        </div>`)
      .join('');
    warm.innerHTML = `
      <p class="eyebrow mono">Warm-up</p>
      <h2>${esc(config.warmup.question)}</h2>
      ${results.revealed ? `<div class="warm-cols">${cols}</div>` : `<p class="lede">Answer on your phone. Press <kbd>R</kbd> to reveal.</p>`}`;
  };

  const renderHearts = () => {
    // Map glow: each heart makes the node a little brighter; a new heart pops.
    const counts = results.hearts;
    const top = new Set(
      results.revealed
        ? Object.entries(counts)
            .filter(([, n]) => n > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([id]) => id)
        : [],
    );
    for (const s of o.signals) {
      const el = o.nodeEls.get(s.id);
      if (!el) continue;
      const n = counts[s.id] ?? 0;
      el.style.setProperty('--h', String(n));
      el.classList.toggle('hot', n > 0);
      el.classList.toggle('top', top.has(s.id));
      if (n > (lastHearts[s.id] ?? 0) && state.phase === 'hearts') {
        const pop = document.createElement('span');
        pop.className = 'heart-pop';
        pop.textContent = '♥';
        el.appendChild(pop);
        setTimeout(() => pop.remove(), 1100);
      }
    }
    lastHearts = { ...counts };
  };

  const renderTimer = () => {
    const show = state.phase === 'hearts' && state.heartsEndsAt !== null;
    timer.hidden = !show;
    if (!show || state.heartsEndsAt === null) return;
    const left = Math.max(0, (state.heartsEndsAt - Date.now()) / 1000);
    $('timer-label').textContent = results.revealed || left <= 0 ? `Heart pick closed · ${MAX_HEARTS} each` : `Heart pick · ${Math.ceil(left)} s`;
    $('timer-fill').style.width = `${Math.max(0, Math.min(100, (left / HEART_SECONDS) * 100))}%`;
  };

  const render = () => {
    const status = linkStatus === 'live' ? 'live' : linkStatus === 'polling' ? 'slow' : 'reconnecting';
    badge.hidden = false;
    badge.innerHTML = `<span class="live-dot ${status}"></span> Room ${esc(code)} · ${state.participantCount} joined${status === 'live' ? '' : ` · ${status}`}`;
    phaseEl.hidden = false;
    phaseEl.textContent = PHASE_LABEL[state.phase];
    qr.hidden = !(state.phase === 'lobby' || qrOpen);
    $('qr-count').textContent = `${state.participantCount} joined so far`;
    renderWarm();
    renderHearts();
    renderTimer();
    if (error) {
      phaseEl.textContent = `${PHASE_LABEL[state.phase]} · ${error}`;
    }
  };

  // Timer and heart pops need a steady refresh while the heart pick runs.
  setInterval(() => {
    if (state.phase === 'hearts') renderTimer();
  }, 250);

  // ---------- Presenter keys ----------
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    switch (e.key) {
      case 'j':
      case 'J':
        qrOpen = !qrOpen;
        render();
        break;
      case 'w':
      case 'W':
        send({ type: 'control', key, action: 'setPhase', value: 'warmup' });
        break;
      case 'h':
      case 'H':
        send({ type: 'control', key, action: 'setPhase', value: 'hearts' });
        break;
      case 'r':
      case 'R':
        if (e.shiftKey) {
          if (confirm('Clear all answers in this room? This cannot be undone.')) send({ type: 'control', key, action: 'reset' });
        } else {
          send({ type: 'control', key, action: 'reveal' });
        }
        break;
    }
  });

  // The stage is not a phone, so the room never needs its own tab title change.
  document.title = `Stage · Room ${code}`;
  render();
}
