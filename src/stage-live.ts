import QRCode from 'qrcode';
import { connectRoom, type LinkStatus } from './live/socket';
import { uploadPicture } from './picture';
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
  openDetail: (id: string) => void;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);
const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString('en-GB') : String(Number(n.toFixed(2))));
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

const store = {
  get: (k: string) => {
    try {
      return sessionStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      sessionStorage.setItem(k, v);
    } catch {
      /* no storage */
    }
  },
  del: (k: string) => {
    try {
      sessionStorage.removeItem(k);
    } catch {
      /* no storage */
    }
  },
};

const PHASE_LABEL: Record<Phase, string> = {
  lobby: 'Join',
  warmup: 'Warm-up',
  hearts: 'Heart pick',
  guess: 'Deep dive · game',
  story: 'Deep dive · the story',
  hottake: 'Deep dive · hot take',
  discuss: 'Deep dive · discuss',
  flyover: 'Flyover',
  askTrends: 'Your trends · add',
  trendView: 'Your trends',
  close: 'Close',
};

/** Which button lights up for each phase. */
const BUTTON_FOR_PHASE: Partial<Record<Phase, string>> = {
  warmup: 'warm',
  hearts: 'hearts',
  guess: 'game',
  story: 'story',
  hottake: 'hot',
  discuss: 'discuss',
  flyover: 'fly',
  askTrends: 'ask',
  trendView: 'view',
  close: 'close',
};

/** The presenter screen for /stage: buttons, QR, warm-up, heart pick, deep dives, trends, closing. */
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
    <nav class="ctrl" id="ctrl" aria-label="Presenter controls">
      <button class="ctrl-toggle mono" id="ctrl-toggle" type="button">Hide controls</button>
      <div class="ctrl-body" id="ctrl-body">
        <div class="ctrl-row">
          <span class="ctrl-label mono">Session</span>
          <button type="button" data-act="qr">Join QR</button>
          <button type="button" data-act="warm">Warm-up</button>
          <button type="button" data-act="hearts">Heart pick</button>
          <button type="button" data-act="reveal">Reveal</button>
          <button type="button" data-act="fly">Flyover</button>
          <button type="button" data-act="close">Closing screen</button>
        </div>
        <div class="ctrl-row">
          <span class="ctrl-label mono">Next trend</span>
          <span class="picks" id="picks"></span>
        </div>
        <div class="ctrl-row">
          <span class="ctrl-label mono">This trend</span>
          <button type="button" data-act="back">◀ Back</button>
          <button type="button" data-act="next">Next ▶</button>
          <button type="button" data-act="game">Game</button>
          <button type="button" data-act="story">Story</button>
          <button type="button" data-act="hot">Hot take</button>
          <button type="button" data-act="discuss">Discuss</button>
          <button type="button" data-act="details">Details</button>
          <button type="button" data-act="picture">Change picture</button>
        </div>
        <div class="ctrl-row">
          <span class="ctrl-label mono">Trends</span>
          <button type="button" data-act="ask">Ask audience for trends</button>
          <button type="button" data-act="view">Show trends</button>
        </div>
        <div class="ctrl-row">
          <span class="ctrl-label mono">Room</span>
          <button type="button" data-act="reset">Clear answers</button>
          <button type="button" data-act="newroom">New room</button>
          <button type="button" data-act="leave">Leave room</button>
        </div>
      </div>
    </nav>
    <p class="flash mono" id="flash" hidden></p>
    <div class="setup" id="setup" hidden>
      <div class="setup-card">
        <p class="eyebrow mono">Presenter</p>
        <h2 id="setup-title">Start a room</h2>
        <p class="lede">Type your presenter key. It's the password you set in Cloudflare (PRESENTER_KEY). The room link will contain it, so keep the link private.</p>
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
  const ctrl = $('ctrl');
  const flash = $('flash');

  // ---------- No room yet: start one, or go back to the last room ----------
  if (!code || !key) {
    const savedKey = store.get('signalroom.key') ?? '';
    const saved = store.get('signalroom.stage');
    if (saved) {
      location.replace(`/stage${saved}`);
      return;
    }
    $('setup').hidden = false;
    const input = $<HTMLInputElement>('setup-key');
    input.value = savedKey;
    $('setup-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const k = input.value.trim();
      if (!k) return;
      store.set('signalroom.key', k);
      location.href = `/stage?room=${newCode()}&key=${encodeURIComponent(k)}`;
    });
    return;
  }

  // Remember this room, so a stray click or reload brings the presenter back here.
  store.set('signalroom.stage', location.search);
  store.set('signalroom.key', key);

  const config = await fetch('/config.json').then((r) => r.json() as Promise<Config>);
  const byId = new Map(o.signals.map((s) => [s.id, s]));
  let state: PublicState = {
    type: 'state', phase: 'lobby', activeSignalId: null, activeRange: null, revealed: false,
    participantCount: 0, heartsEndsAt: null, covered: [],
  };
  let results: Results = {
    type: 'results', warmup: [0, 0, 0], hearts: {}, topN: [], revealed: false,
    gameCount: 0, gameValues: [], takes: { agree: 0, disagree: 0 }, trends: [],
  };
  let qrOpen = true; // the join code shows by default; the Join QR button hides and shows it
  let linkStatus: LinkStatus = 'reconnecting';
  let lastHearts: Record<string, number> = {};
  let storyShown: string | null = null;
  let flyTimer: number | undefined;
  let flown: string[] = [];
  let pickHtml = '';
  let flashTimer: number | undefined;

  const joinUrl = `${location.origin}/join/${code}`;
  $('qr-code').textContent = code;
  $('qr-url').textContent = joinUrl.replace(/^https?:\/\//, '');
  const qrOptions = { type: 'svg' as const, margin: 1, color: { dark: '#080C1E', light: '#F4E9DC' } };
  QRCode.toString(joinUrl, qrOptions)
    .then((svg) => ($('qr-svg').innerHTML = svg))
    .catch(() => ($('qr-svg').textContent = joinUrl));
  QRCode.toString(`${location.origin}/explore`, qrOptions)
    .then((svg) => {
      closep.innerHTML = `
        <div class="close-card">
          <p class="eyebrow mono">Keep exploring</p>
          <h2>Thank you</h2>
          <div class="qr-svg">${svg}</div>
          <p class="mono qr-url">${esc(location.host)}/explore</p>
          <p class="lede">All 25 trends, at your own pace.</p>
        </div>`;
    })
    .catch(() => undefined);

  const showFlash = (text: string) => {
    flash.hidden = false;
    flash.textContent = text;
    clearTimeout(flashTimer);
    flashTimer = window.setTimeout(() => (flash.hidden = true), 3500);
  };

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
        showFlash(m.message);
      }
      render();
    },
  });

  const send = (m: ClientMessage) => link.send(m);
  const setPhase = (value: Phase) => send({ type: 'control', key, action: 'setPhase', value });
  const reveal = () => send({ type: 'control', key, action: 'reveal' });

  /** The answer range the phones may send, by game type. */
  const rangeOf = (s: Signal) => {
    if (s.gameType === 'truefalse' && s.trueFalse) return { min: 0, max: 1 };
    if (s.gameType === 'choice' && s.choice) return { min: 0, max: s.choice.options.length - 1 };
    return s.guess ? { min: s.guess.min, max: s.guess.max } : { min: 0, max: 100 };
  };

  /** Pick a trend, and optionally move to a step of its deep dive. */
  const choose = (id: string, phase?: Phase) => {
    const s = byId.get(id);
    if (!s) return;
    const r = rangeOf(s);
    send({ type: 'control', key, action: 'setSignal', signalId: id, min: r.min, max: r.max });
    if (phase) setPhase(phase);
  };

  /** Show the story for the active trend when the phase calls for it. */
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

  const stepBy = (delta: number) => {
    const i = DEEP_STEPS.indexOf(state.phase as Phase);
    if (i < 0) return;
    const next = DEEP_STEPS[i + delta];
    if (next) setPhase(next);
  };

  // ---------- Flyover: 15 seconds per trend that has not had a deep dive ----------
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
        showFlash('All trends shown. Press Closing screen to finish.');
        return;
      }
      flown.push(next.id);
      choose(next.id);
    };
    step();
    flyTimer = window.setInterval(step, FLY_SECONDS * 1000);
  };

  let lastPhase: Phase = 'lobby';
  setInterval(() => {
    if (state.phase === lastPhase) return;
    if (state.phase === 'flyover') startFly();
    else if (lastPhase === 'flyover') stopFly();
    lastPhase = state.phase;
  }, 200);
  setInterval(() => {
    if (state.phase === 'hearts') renderTimer();
  }, 250);

  // ---------- Buttons: every action the presenter needs ----------
  const picture = () => {
    const id = state.activeSignalId;
    if (!id) return showFlash('Pick a trend first (the buttons under “Next trend”).');
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      showFlash('Uploading the picture…');
      try {
        await uploadPicture(id, file, key);
        showFlash('Picture saved. Phones and screens will show it.');
      } catch (err) {
        showFlash(err instanceof Error ? err.message : 'Upload failed');
      }
    };
    input.click();
  };

  const actions: Record<string, () => void> = {
    qr: () => {
      qrOpen = !qrOpen;
      render();
    },
    warm: () => setPhase('warmup'),
    hearts: () => setPhase('hearts'),
    reveal: () => reveal(),
    fly: () => setPhase('flyover'),
    close: () => setPhase('close'),
    back: () => stepBy(-1),
    next: () => stepBy(1),
    game: () => setPhase('guess'),
    story: () => setPhase('story'),
    hot: () => setPhase('hottake'),
    discuss: () => setPhase('discuss'),
    details: () => {
      if (!state.activeSignalId) return showFlash('Pick a trend first.');
      o.openDetail(state.activeSignalId);
    },
    picture,
    ask: () => setPhase('askTrends'),
    view: () => setPhase('trendView'),
    reset: () => {
      if (!confirm('Clear all answers, hearts and trends in this room? This cannot be undone.')) return;
      stopFly();
      send({ type: 'control', key, action: 'reset' });
    },
    newroom: () => {
      if (!confirm('Start a new room? This room keeps its answers, but you will leave it and the phones will need the new code.')) return;
      stopFly();
      location.href = `/stage?room=${newCode()}&key=${encodeURIComponent(key)}`;
    },
    leave: () => {
      if (!confirm('Leave this room and go back to the start? You can open it again with its link.')) return;
      stopFly();
      store.del('signalroom.stage');
      location.href = '/stage';
    },
  };

  ctrl.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const pick = t.closest<HTMLElement>('[data-pick]');
    if (pick) return choose(pick.dataset.pick!, 'guess');
    const btn = t.closest<HTMLElement>('[data-act]');
    if (btn) actions[btn.dataset.act!]?.();
  });
  $('ctrl-toggle').addEventListener('click', () => {
    const hidden = $('ctrl-body').hidden;
    $('ctrl-body').hidden = !hidden;
    $('ctrl-toggle').textContent = hidden ? 'Hide controls' : 'Show controls';
  });

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
      ${results.revealed ? `<div class="warm-cols">${cols}</div>` : `<p class="lede">Answer on your phone. Press Reveal.</p>`}`;
  };

  const split = (a: number, d: number, la = 'Agree', ld = 'Disagree') => {
    const total = a + d;
    const pa = total ? Math.round((a / total) * 100) : 50;
    return `
      <div class="split">
        <div class="split-bar"><span class="split-a" style="width:${pa}%"></span><span class="split-d" style="width:${100 - pa}%"></span></div>
        <div class="split-labels mono">
          <span>${la} ${a}${total ? ` · ${pa}%` : ''}</span><span>${ld} ${d}${total ? ` · ${100 - pa}%` : ''}</span>
        </div>
      </div>`;
  };

  /** The one game for a trend: guess the number, true or false, or multiple choice. */
  const gameHtml = (s: Signal): string => {
    const label = `<p class="eyebrow mono">${esc(s.short)} · ${s.gameType === 'truefalse' ? 'true or false' : s.gameType === 'choice' ? 'pick one' : 'guess the number'}</p>`;
    const waiting = results.revealed ? '' : `<p class="lede">${results.gameCount} answered so far. Press Reveal when ready.</p>`;

    if (s.gameType === 'truefalse' && s.trueFalse) {
      const t = s.trueFalse;
      const trueCount = results.gameValues.filter((v) => v === 1).length;
      const falseCount = results.gameValues.length - trueCount;
      const reveal = results.revealed
        ? `${split(trueCount, falseCount, 'True', 'False')}<p class="reveal-line">It is ${t.answer ? 'true' : 'false'}. <span class="mono">${esc(t.explanation)}</span></p>`
        : waiting;
      return `${label}<h2 class="statement">${esc(t.statement)}</h2>${reveal}`;
    }

    if (s.gameType === 'choice' && s.choice) {
      const c = s.choice;
      const counts = c.options.map((_, i) => results.gameValues.filter((v) => v === i).length);
      const total = results.gameValues.length || 1;
      const bars = c.options.map((o2, i) => `
        <div class="choice-row ${results.revealed && i === c.answer ? 'right' : ''}">
          <span class="choice-label">${esc(o2)}</span>
          <span class="choice-track"><span class="choice-fill" style="width:${results.revealed ? Math.round((counts[i] / total) * 100) : 0}%"></span></span>
          <span class="mono choice-count">${results.revealed ? counts[i] : ''}</span>
        </div>`).join('');
      const reveal = results.revealed
        ? `<p class="reveal-line">${esc(c.options[c.answer])} <span class="mono">· ${esc(c.explanation)}</span></p>`
        : waiting;
      return `${label}<h2>${esc(c.question)}</h2><div class="choices">${bars}</div>${reveal}`;
    }

    const g = s.guess;
    if (!g) return `${label}<p class="lede">Guess the number</p>`;
    const span = g.max - g.min || 1;
    const at = (v: number) => `${Math.max(0, Math.min(100, ((v - g.min) / span) * 100))}%`;
    const guessDots = results.revealed ? results.gameValues.map((v) => `<i class="gdot" style="left:${at(v)}"></i>`).join('') : '';
    const trueMark = results.revealed ? `<i class="gtrue" style="left:${at(g.answer)}"></i>` : '';
    const info = results.revealed ? `<p class="reveal-line">${esc(g.answerLabel)} <span class="mono">· ${esc(g.source)}</span></p>` : waiting;
    return `${label}<h2>${esc(g.question)}</h2>
      <div class="gscale"><div class="gtrack">${guessDots}${trueMark}</div>
      <div class="gends mono"><span>${fmt(g.min)} ${esc(g.unit)}</span><span>${fmt(g.max)} ${esc(g.unit)}</span></div></div>${info}`;
  };

  const renderDeep = () => {
    const s = state.activeSignalId ? byId.get(state.activeSignalId) : undefined;
    const show = (state.phase === 'guess' || state.phase === 'hottake' || state.phase === 'discuss') && !!s;
    deep.hidden = !show;
    if (!show || !s) return;
    if (state.phase === 'guess') {
      deep.innerHTML = gameHtml(s);
      return;
    }
    if (state.phase === 'hottake') {
      deep.innerHTML = `
        <p class="eyebrow mono">${esc(s.short)} · hot take</p>
        <h2 class="statement">${esc(s.hotTake)}</h2>
        ${results.revealed ? split(results.takes.agree, results.takes.disagree) : `<p class="lede">Phones: agree or disagree. Press Reveal to show the split.</p>`}`;
      return;
    }
    deep.innerHTML = `
      <p class="eyebrow mono">${esc(s.short)} · the conversation</p>
      <h2 class="statement">${esc(s.hotTake)}</h2>
      ${split(results.takes.agree, results.takes.disagree)}
      <p class="lede">Invite one person from each side to speak.</p>`;
  };

  /** Trend phases: the waiting card while people add trends, and the trend view. */
  const renderWall = () => {
    const collecting = state.phase === 'askTrends';
    const viewing = state.phase === 'trendView';
    wall.hidden = !(collecting || viewing);
    if (wall.hidden) return;
    if (collecting) {
      wall.innerHTML = `
        <div class="wall-card ask-card">
          <p class="eyebrow mono">Add your trend</p>
          <h2>Phones can add a trend now</h2>
          <p class="lede">Up to 2 lines each. Trends so far: <strong>${results.trends.length}</strong></p>
          <p class="mono small-note">Press “Show trends” when you're ready.</p>
        </div>`;
      return;
    }
    const items = results.trends.length ? results.trends.map((t) => `<li>${esc(t)}</li>`).join('') : '<li class="empty">No trends were added.</li>';
    wall.innerHTML = `<div class="wall-card view-card"><p class="eyebrow mono">Your trends · ${results.trends.length}</p><ol>${items}</ol></div>`;
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
    const top = new Set(results.revealed ? results.topN : []);
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

  /** The next trends by hearts, as buttons (not yet covered). */
  const renderPicks = () => {
    const ranked = Object.entries(results.hearts)
      .filter(([id, n]) => n > 0 && !state.covered.includes(id))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 9);
    const html = ranked.length
      ? ranked.map(([id, n], i) => `<button type="button" data-pick="${id}">${i + 1} · ${esc(byId.get(id)?.short ?? id)} ♥${n}</button>`).join('')
      : '<span class="mono small-note">Trends appear here after the heart pick.</span>';
    if (html !== pickHtml) {
      $('picks').innerHTML = html;
      pickHtml = html;
    }
  };

  const renderButtons = () => {
    const active = BUTTON_FOR_PHASE[state.phase];
    ctrl.querySelectorAll<HTMLElement>('[data-act]').forEach((b) => {
      const act = b.dataset.act!;
      b.classList.toggle('on', act === active || (act === 'qr' && qrOpen));
    });
  };

  const render = () => {
    const status = linkStatus === 'live' ? 'live' : linkStatus === 'polling' ? 'slow' : 'reconnecting';
    badge.hidden = false;
    badge.innerHTML = `<span class="live-dot ${status}"></span> Room ${esc(code)} · ${state.participantCount} joined${status === 'live' ? '' : ` · ${status}`}`;
    phaseEl.hidden = false;
    phaseEl.textContent = PHASE_LABEL[state.phase];
    qr.hidden = !qrOpen || state.phase === 'close';
    $('qr-count').textContent = `${state.participantCount} joined so far`;
    closep.hidden = state.phase !== 'close';
    renderWarm();
    renderDeep();
    renderHearts();
    renderTimer();
    renderWall();
    renderPicks();
    renderButtons();
  };

  // ---------- Keys: the same actions, for speed ----------
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    const k = e.key;
    if (/^[1-9]$/.test(k)) {
      const ranked = Object.entries(results.hearts)
        .filter(([id, n]) => n > 0 && !state.covered.includes(id))
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      if (ranked[Number(k) - 1]) choose(ranked[Number(k) - 1][0], 'guess');
      return;
    }
    const keyMap: Record<string, string> = {
      j: 'qr', J: 'qr', w: 'warm', W: 'warm', h: 'hearts', H: 'hearts', g: 'game', G: 'game',
      s: 'story', S: 'story', t: 'hot', T: 'hot', e: 'discuss', E: 'discuss', f: 'fly', F: 'fly',
      c: 'close', C: 'close', a: 'ask', A: 'ask', v: 'view', V: 'view',
    };
    if (keyMap[k]) return actions[keyMap[k]]();
    if (k === 'ArrowRight') return (e.preventDefault(), stepBy(1));
    if (k === 'ArrowLeft') return (e.preventDefault(), stepBy(-1));
    if (k === 'r' || k === 'R') return e.shiftKey ? actions.reset() : reveal();
  });

  document.title = `Stage · Room ${code}`;
  render();
}
