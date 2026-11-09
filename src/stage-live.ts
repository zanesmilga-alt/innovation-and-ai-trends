import QRCode from 'qrcode';
import { connectRoom, type LinkStatus } from './live/socket';
import {
  DEEP_STEPS,
  FLY_SECONDS,
  HEART_SECONDS,
  MAX_HEARTS,
  type ClientMessage,
  type Phase,
  type PublicState,
  type Results,
  type ServerMessage,
} from './protocol';
import type { Signal } from './types';

interface Config {
  warmup: { question: string; options: string[] };
}

export interface StageOptions {
  root: HTMLElement;
  nodeEls: Map<string, HTMLButtonElement>;
  signals: Signal[];
  openStory: (id: string) => void;
  closeStory: () => void;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString('en-GB') : String(Number(n.toFixed(2))));

const PHASE_LABEL: Record<Phase, string> = {
  lobby: 'Join',
  warmup: 'Warm-up',
  hearts: 'Heart pick',
  guess: 'Deep dive · guess',
  story: 'Deep dive · the story',
  hottake: 'Deep dive · hot take',
  discuss: 'Deep dive · discuss',
  flyover: 'Flyover',
  close: 'Close',
};

/** Live layer for /stage: QR, warm-up, heart pick, deep dives, flyover, closing and the trend wall. */
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
    <div class="deep-panel" id="deep" hidden></div>
    <div class="close-panel" id="closep" hidden></div>
    <div class="wall" id="wall" hidden></div>
    <div class="timer-bar" id="timer" hidden><span class="timer-label mono" id="timer-label"></span><span class="timer-track"><span class="timer-fill" id="timer-fill"></span></span></div>
    <div class="suggest" id="suggest" hidden></div>
    <div class="setup" id="setup" hidden>
      <div class="setup-card">
        <p class="eyebrow mono">Presenter</p>
        <h2>Start a room</h2>
        <p class="lede">Type the presenter key set in Cloudflare (the PRESENTER_KEY secret). Your room link will contain it, so keep the link private.</p>
        <form id="setup-form" class="stack">
          <input id="setup-key" class="field" type="password" autocomplete="off" placeholder="Presenter key" />
          <button class="big-btn" type="submit">Create room</button>
        </form>
      </div>
    </div>`;
  o.root.appendChild(layer);

  const $ = <T extends HTMLElement>(id: string) => layer.querySelector<T>(`#${id}`)!;
  const badge = $('badge');
  const phaseEl = $('phase');
  const qr = $('qr');
  const warm = $('warm');
  const deep = $('deep');
  const closep = $('closep');
  const wall = $('wall');
  const timer = $('timer');
  const suggest = $('suggest');

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
  const byId = new Map(o.signals.map((s) => [s.id, s]));
  let state: PublicState = {
    type: 'state', phase: 'lobby', activeSignalId: null, activeRange: null, revealed: false,
    participantCount: 0, heartsEndsAt: null, covered: [],
  };
  let results: Results = {
    type: 'results', warmup: [0, 0, 0], hearts: {}, top3: [], revealed: false,
    guessCount: 0, guessValues: [], takes: { agree: 0, disagree: 0 }, trends: [],
  };
  let qrOpen = false;
  let wallOpen = false;
  let linkStatus: LinkStatus = 'reconnecting';
  let lastHearts: Record<string, number> = {};
  let storyShown: string | null = null;
  let flyTimer: number | undefined;
  let flown: string[] = [];
  let error = '';

  const joinUrl = `${location.origin}/join/${code}`;
  $('qr-code').textContent = code;
  $('qr-url').textContent = joinUrl.replace(/^https?:\/\//, '');
  const qrOptions = { type: 'svg' as const, margin: 1, color: { dark: '#080C1E', light: '#F4E9DC' } };
  QRCode.toString(joinUrl, qrOptions)
    .then((svg) => ($('qr-svg').innerHTML = svg))
    .catch(() => ($('qr-svg').textContent = joinUrl));
  // Closing screen: the explorer address.
  const exploreUrl = `${location.origin}/explore`;
  QRCode.toString(exploreUrl, qrOptions)
    .then((svg) => {
      closep.innerHTML = `
        <div class="close-card">
          <p class="eyebrow mono">Keep exploring</p>
          <h2>Thank you</h2>
          <div class="qr-svg">${svg}</div>
          <p class="mono qr-url">${esc(exploreUrl.replace(/^https?:\/\//, ''))}</p>
          <p class="lede">All 25 signals, at your own pace.</p>
        </div>`;
    })
    .catch(() => undefined);

  const link = connectRoom({
    code,
    key,
    hello: { type: 'hello', role: 'stage', key },
    onStatus: (s) => {
      linkStatus = s;
      render();
    },
    onMessage: (m: ServerMessage) => {
      if (m.type === 'state') {
        state = m;
        syncStory();
      } else if (m.type === 'results') {
        results = m;
      } else if (m.type === 'error') {
        error = m.message;
      }
      render();
    },
  });

  const send = (m: ClientMessage) => link.send(m);
  const rangeOf = (s: Signal) => (s.guess ? { min: s.guess.min, max: s.guess.max } : { min: 0, max: 100 });

  /** Pick a signal for a deep dive (or a flyover stop). */
  const choose = (id: string, phase?: Phase) => {
    const s = byId.get(id);
    if (!s) return;
    const r = rangeOf(s);
    send({ type: 'control', key, action: 'setSignal', signalId: id, min: r.min, max: r.max });
    if (phase) send({ type: 'control', key, action: 'setPhase', value: phase });
  };

  const setPhase = (value: Phase) => send({ type: 'control', key, action: 'setPhase', value });

  /** Show the story for the active signal when the phase calls for it. */
  function syncStory() {
    const wantStory = (state.phase === 'story' || state.phase === 'flyover') && state.activeSignalId;
    if (wantStory && state.activeSignalId !== storyShown) {
      storyShown = state.activeSignalId;
      o.openStory(state.activeSignalId!);
    } else if (!wantStory && storyShown) {
      storyShown = null;
      o.closeStory();
    }
  }

  // ---------- Drawing ----------

  const dots = (n: number) => {
    const shown = Math.min(n, 60);
    const more = n > 60 ? `<span class="mono more">+${n - 60}</span>` : '';
    return `<span class="dots">${Array.from({ length: shown }, () => '<i></i>').join('')}${more}</span>`;
  };

  const renderWarm = () => {
    warm.hidden = state.phase !== 'warmup';
    if (warm.hidden) return;
    const total = results.warmup.reduce((a, b) => a + b, 0);
    const cols = config.warmup.options
      .map((label, i) => `
        <div class="warm-col">
          <div class="warm-count mono">${results.revealed ? results.warmup[i] : ''}</div>
          <div class="warm-bar">${results.revealed && total ? dots(results.warmup[i]) : ''}</div>
          <div class="warm-label">${esc(label)}</div>
        </div>`)
      .join('');
    warm.innerHTML = `
      <p class="eyebrow mono">Warm-up</p>
      <h2>${esc(config.warmup.question)}</h2>
      ${results.revealed ? `<div class="warm-cols">${cols}</div>` : `<p class="lede">Answer on your phone. Press <kbd>R</kbd> to reveal.</p>`}`;
  };

  const split = (agree: number, disagree: number) => {
    const total = agree + disagree;
    const a = total ? Math.round((agree / total) * 100) : 50;
    return `
      <div class="split">
        <div class="split-bar">
          <span class="split-a" style="width:${a}%"></span><span class="split-d" style="width:${100 - a}%"></span>
        </div>
        <div class="split-labels mono">
          <span>Agree ${agree}${total ? ` · ${a}%` : ''}</span><span>${disagree} · ${total ? 100 - a : 0}% Disagree</span>
        </div>
      </div>`;
  };

  const renderDeep = () => {
    const s = state.activeSignalId ? byId.get(state.activeSignalId) : undefined;
    const show = (state.phase === 'guess' || state.phase === 'hottake' || state.phase === 'discuss') && !!s;
    deep.hidden = !show;
    if (!show || !s) return;

    if (state.phase === 'guess' && s.guess) {
      const g = s.guess;
      const span = g.max - g.min || 1;
      const at = (v: number) => `${Math.max(0, Math.min(100, ((v - g.min) / span) * 100))}%`;
      const guessDots = results.revealed
        ? results.guessValues.map((v) => `<i class="gdot" style="left:${at(v)}"></i>`).join('')
        : '';
      const trueMark = results.revealed ? `<i class="gtrue" style="left:${at(g.answer)}"></i>` : '';
      const info = results.revealed
        ? `<p class="reveal-line">${esc(g.answerLabel)} <span class="mono">· ${esc(g.source)}</span></p>`
        : `<p class="lede">${results.guessCount} guessed so far. Press <kbd>R</kbd> to reveal.</p>`;
      deep.innerHTML = `
        <p class="eyebrow mono">${esc(s.short)} · guess the number</p>
        <h2>${esc(g.question)}</h2>
        <div class="gscale">
          <div class="gtrack">${guessDots}${trueMark}</div>
          <div class="gends mono"><span>${fmt(g.min)} ${esc(g.unit)}</span><span>${fmt(g.max)} ${esc(g.unit)}</span></div>
        </div>
        ${info}`;
      return;
    }

    if (state.phase === 'hottake') {
      deep.innerHTML = `
        <p class="eyebrow mono">${esc(s.short)} · hot take</p>
        <h2 class="statement">${esc(s.hotTake)}</h2>
        ${results.revealed ? split(results.takes.agree, results.takes.disagree) : `<p class="lede">Phones: agree or disagree. Press <kbd>R</kbd> to reveal the split.</p>`}`;
      return;
    }

    // discuss: the split stays on screen
    deep.innerHTML = `
      <p class="eyebrow mono">${esc(s.short)} · the conversation</p>
      <h2 class="statement">${esc(s.hotTake)}</h2>
      ${split(results.takes.agree, results.takes.disagree)}
      <p class="lede">Invite one person from each side to speak.</p>`;
  };

  const renderSuggest = () => {
    // Next deep dives: the most-hearted signals not yet covered, numbered 1–9.
    const visible = ['lobby', 'warmup', 'hearts', 'discuss', 'flyover', 'close'].includes(state.phase);
    const ranked = Object.entries(results.hearts)
      .filter(([id, n]) => n > 0 && !state.covered.includes(id))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 9);
    suggest.hidden = !visible || ranked.length === 0 || state.phase === 'close';
    if (suggest.hidden) return;
    suggest.innerHTML = `<span class="mono suggest-label">Next · press 1–9</span>` + ranked
      .map(([id, n], i) => {
        const s = byId.get(id);
        return `<span class="suggest-item"><kbd>${i + 1}</kbd> ${esc(s?.short ?? id)} <span class="mono">♥ ${n}</span></span>`;
      })
      .join('');
  };

  const renderWall = () => {
    wall.hidden = !wallOpen;
    if (!wallOpen) return;
    const items = results.trends.length
      ? results.trends.map((t) => `<li>${esc(t)}</li>`).join('')
      : '<li class="empty">No trends yet. Phones can add them with “Suggest a trend”.</li>';
    wall.innerHTML = `
      <div class="wall-card">
        <p class="eyebrow mono">Your trends · ${results.trends.length}</p>
        <ol>${items}</ol>
        <p class="mono small-note">Press <kbd>U</kbd> to close</p>
      </div>`;
  };

  const renderTimer = () => {
    const show = state.phase === 'hearts' && state.heartsEndsAt !== null;
    timer.hidden = !show;
    if (!show || state.heartsEndsAt === null) return;
    const left = Math.max(0, (state.heartsEndsAt - Date.now()) / 1000);
    $('timer-label').textContent = state.revealed || left <= 0 ? `Heart pick closed · ${MAX_HEARTS} each` : `Heart pick · ${Math.ceil(left)} s`;
    $('timer-fill').style.width = `${Math.max(0, Math.min(100, (left / HEART_SECONDS) * 100))}%`;
  };

  const renderHearts = () => {
    const counts = results.hearts;
    const top = new Set(results.revealed ? results.top3 : []);
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

  const render = () => {
    const status = linkStatus === 'live' ? 'live' : linkStatus === 'polling' ? 'slow' : 'reconnecting';
    badge.hidden = false;
    badge.innerHTML = `<span class="live-dot ${status}"></span> Room ${esc(code)} · ${state.participantCount} joined${status === 'live' ? '' : ` · ${status}`}`;
    phaseEl.hidden = false;
    phaseEl.textContent = error ? `${PHASE_LABEL[state.phase]} · ${error}` : PHASE_LABEL[state.phase];
    qr.hidden = !(state.phase === 'lobby' || qrOpen) || state.phase === 'close';
    $('qr-count').textContent = `${state.participantCount} joined so far`;
    closep.hidden = state.phase !== 'close';
    renderWarm();
    renderDeep();
    renderHearts();
    renderTimer();
    renderSuggest();
    renderWall();
  };

  // ---------- Flyover: 15 seconds per signal, not yet covered ----------

  const stopFly = () => {
    if (flyTimer) clearInterval(flyTimer);
    flyTimer = undefined;
    flown = [];
  };

  const startFly = () => {
    stopFly();
    const step = () => {
      const next = o.signals.find((s) => !state.covered.includes(s.id) && !flown.includes(s.id));
      if (!next) {
        stopFly();
        error = 'All signals shown. Press C to close.';
        render();
        return;
      }
      flown.push(next.id);
      choose(next.id);
    };
    step();
    flyTimer = window.setInterval(step, FLY_SECONDS * 1000);
  };

  // Watch the phase: start or stop the flyover.
  let lastPhase: Phase = 'lobby';
  setInterval(() => {
    if (state.phase === 'hearts') renderTimer();
  }, 250);
  const watchPhase = () => {
    if (state.phase === lastPhase) return;
    if (state.phase === 'flyover') startFly();
    else if (lastPhase === 'flyover') stopFly();
    lastPhase = state.phase;
  };
  setInterval(watchPhase, 200);

  // ---------- Presenter keys ----------
  const DEEP = DEEP_STEPS;
  const stepBy = (delta: number) => {
    const i = DEEP.indexOf(state.phase as Phase);
    if (i < 0) return;
    const next = DEEP[i + delta];
    if (next) setPhase(next);
  };

  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    const k = e.key;
    if (/^[1-9]$/.test(k)) {
      const idx = Number(k) - 1;
      const ranked = Object.entries(results.hearts)
        .filter(([id, n]) => n > 0 && !state.covered.includes(id))
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      const pick = ranked[idx]?.[0];
      if (pick) choose(pick, 'guess');
      return;
    }
    switch (k) {
      case 'j': case 'J': qrOpen = !qrOpen; render(); break;
      case 'u': case 'U': wallOpen = !wallOpen; render(); break;
      case 'w': case 'W': setPhase('warmup'); break;
      case 'h': case 'H': setPhase('hearts'); break;
      case 'g': case 'G': setPhase('guess'); break;
      case 's': case 'S': setPhase('story'); break;
      case 't': case 'T': setPhase('hottake'); break;
      case 'e': case 'E': setPhase('discuss'); break;
      case 'f': case 'F': setPhase('flyover'); break;
      case 'c': case 'C': setPhase('close'); break;
      case 'ArrowRight': e.preventDefault(); stepBy(1); break;
      case 'ArrowLeft': e.preventDefault(); stepBy(-1); break;
      case 'r': case 'R':
        if (e.shiftKey) {
          if (confirm('Clear all answers and trends in this room? This cannot be undone.')) {
            stopFly();
            send({ type: 'control', key, action: 'reset' });
          }
        } else {
          send({ type: 'control', key, action: 'reveal' });
        }
        break;
    }
  });

  document.title = `Stage · Room ${code}`;
  render();
}
