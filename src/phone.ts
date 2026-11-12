import { connectRoom, participantId, type LinkStatus } from './live/socket';
import { loadSignals } from './data';
import {
  MAX_HEARTS,
  TREND_MAX_LENGTH,
  TREND_MAX_PER_PERSON,
  type ClientMessage,
  type Phase,
  type PublicState,
  type ServerMessage,
  type You,
} from './protocol';
import type { Signal } from './types';

interface Config {
  warmup: { question: string; options: string[] };
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);

const ROOM_CODE = /^[A-Za-z0-9]{3,12}$/;

/** Phone view at /join/<CODE>. One action per screen. */
export async function mountPhone(root: HTMLElement, code: string | null): Promise<void> {
  if (!code || !ROOM_CODE.test(code)) {
    // Came back without the code (for example after a stray click): return to the last room.
    try {
      const last = localStorage.getItem('signalroom.room');
      if (last && ROOM_CODE.test(last)) {
        location.replace(`/join/${last}`);
        return;
      }
    } catch {
      /* no storage */
    }
    root.innerHTML = `
      <main class="phone">
        <p class="eyebrow mono">Join the room</p>
        <h1>Type the room code</h1>
        <form id="codeform" class="stack">
          <input id="code" class="field mono big-code" maxlength="12" autocomplete="off" placeholder="ABCD" />
          <button class="big-btn" type="submit">Join</button>
        </form>
      </main>`;
    root.querySelector<HTMLFormElement>('#codeform')!.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = root.querySelector<HTMLInputElement>('#code')!.value.trim();
      if (ROOM_CODE.test(v)) location.href = `/join/${encodeURIComponent(v.toUpperCase())}`;
    });
    return;
  }

  const roomCode = code.toUpperCase();
  try {
    localStorage.setItem('signalroom.room', roomCode);
  } catch {
    /* ignore */
  }
  const pid = participantId();
  const [cfg, signalFile] = await Promise.all([
    fetch('/config.json').then((r) => r.json() as Promise<Config>),
    loadSignals().catch(() => null),
  ]);
  const signals: Signal[] = signalFile?.signals ?? [];
  const acts = signalFile?.acts ?? [];
  const byId = new Map(signals.map((s) => [s.id, s]));

  let state: PublicState = {
    type: 'state', phase: 'lobby', activeSignalId: null, activeRange: null, revealed: false,
    participantCount: 0, heartsEndsAt: null, covered: [],
  };
  let you: You = { type: 'you', warmup: null, hearts: [], game: null, take: null, trendCount: 0 };
  let joined = false;
  let status: LinkStatus = 'reconnecting';
  let toast = '';
  let toastTimer: number | undefined;
  let nameDraft = '';
  let trendOpen = false;
  let trendDraft = '';
  let guessDraft: number | null = null;
  try {
    nameDraft = localStorage.getItem('signalroom.name') ?? '';
  } catch {
    /* private mode */
  }

  const showToast = (text: string) => {
    toast = text;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast = '';
      render();
    }, 3000);
    render();
  };

  const link = connectRoom({
    code: roomCode,
    pid,
    hello: { type: 'hello', role: 'phone' },
    onOpen: (send) => {
      if (joined) send({ type: 'join', participantId: pid, name: nameDraft || undefined });
    },
    onStatus: (s) => {
      status = s;
      render();
    },
    onMessage: (m: ServerMessage) => {
      if (m.type === 'state') {
        if (m.activeSignalId !== state.activeSignalId || m.phase !== state.phase) guessDraft = null;
        state = m;
      } else if (m.type === 'you') {
        you = m;
      } else if (m.type === 'error') {
        showToast(m.message);
      }
      render();
    },
  });

  const send = (m: ClientMessage) => link.send(m);

  const join = () => {
    joined = true;
    try {
      localStorage.setItem('signalroom.name', nameDraft);
    } catch {
      /* ignore */
    }
    send({ type: 'join', participantId: pid, name: nameDraft || undefined });
    render();
  };

  const panel = (title: string, text: string, extra = '') => `
    <div class="centre">
      <h1 class="huge">${esc(title)}</h1>
      <p class="lede">${esc(text)}</p>
      ${extra ? `<p class="mono small-note">${esc(extra)}</p>` : ''}
    </div>`;

  const active = (): Signal | undefined => (state.activeSignalId ? byId.get(state.activeSignalId) : undefined);

  const screenFor = (phase: Phase): string => {
    if (phase === 'warmup') {
      if (state.revealed) return panel('Look at the big screen', 'The results are up there.');
      if (you.warmup !== null) return panel('Got it', 'Waiting for the reveal.');
      return `
        <p class="eyebrow mono">Warm-up</p>
        <h1>${esc(cfg.warmup.question)}</h1>
        <div class="stack">
          ${cfg.warmup.options.map((o, i) => `<button class="option-btn" data-warm="${i}" type="button">${esc(o)}</button>`).join('')}
        </div>`;
    }

    if (phase === 'hearts') {
      if (state.revealed) return panel('Hearts are in', 'Look at the big screen.');
      const left = MAX_HEARTS - you.hearts.length;
      return `
        <p class="eyebrow mono">Pick up to ${MAX_HEARTS} signals</p>
        <h1 class="small">${left > 0 ? `${left} heart${left === 1 ? '' : 's'} left` : 'All hearts used'}</h1>
        ${acts.filter((a) => signals.some((x) => x.act === a.id)).map((a) => `
          <h2 class="heart-act mono">${esc(a.lens)}</h2>
          <ul class="hearts">
            ${signals.filter((x) => x.act === a.id).map((s) => {
              const on = you.hearts.includes(s.id);
              return `<li><button class="heart-row ${on ? 'on' : ''}" data-heart="${esc(s.id)}" type="button" aria-pressed="${on}">
                <span class="heart" aria-hidden="true">${on ? '♥' : '♡'}</span><span class="ht"><span>${esc(s.title)}</span></span></button></li>`;
            }).join('')}
          </ul>`).join('')}`;
    }

    if (phase === 'guess') {
      const s = active();
      if (!s || !state.activeRange) return panel('Get ready', 'The next question is coming.');
      if (state.revealed) return panel('Look at the big screen', 'The answer is up there.');
      if (you.game !== null) return panel('Locked in', 'Waiting for the reveal.');
      return gameScreen(s);
    }

    if (phase === 'hottake') {
      const s = active();
      if (!s) return panel('Get ready', 'The next question is coming.');
      if (state.revealed) return panel('Look at the big screen', 'The split is up there.');
      if (you.take !== null) return panel('Locked in', `You said ${you.take === 'agree' ? 'agree' : 'disagree'}. Waiting for the reveal.`);
      return `
        <p class="eyebrow mono">Hot take</p>
        <h1 class="small">${esc(s.hotTake)}</h1>
        <div class="stack two">
          <button class="option-btn" data-take="agree" type="button">Agree</button>
          <button class="option-btn" data-take="disagree" type="button">Disagree</button>
        </div>`;
    }

    if (phase === 'askTrends') {
      return `
        <p class="eyebrow mono">Your turn</p>
        <h1 class="small">Which trend should we talk about next?</h1>
        <p class="lede">Write one line. The best ones go up on the big screen.</p>`;
    }
    if (phase === 'trendView') return panel('Look at the big screen', 'Your trends are up there.');
    if (phase === 'lobby') return panel("You're in", 'Waiting for the next prompt.', `${state.participantCount} joined`);
    if (phase === 'close') {
      return `
        <div class="centre">
          <h1 class="huge">Thanks</h1>
          <p class="lede">Keep exploring the 25 signals in your own time.</p>
          <a class="big-btn link-btn" href="/overview">See all the trends</a>
          <a class="ghost-link" href="/explore">Explore the map</a>
        </div>`;
    }
    // story, discuss, flyover
    return panel('Eyes up', 'Look at the big screen.');
  };

  /** One game per trend. Its kind comes from the trend's gameType. */
  const gameScreen = (sig: Signal): string => {
    const range = state.activeRange!;
    if (sig.gameType === 'truefalse' && sig.trueFalse) {
      return `
        <p class="eyebrow mono">True or false</p>
        <h1 class="small">${esc(sig.trueFalse.statement)}</h1>
        <div class="stack two">
          <button class="option-btn" data-game="1" type="button">True</button>
          <button class="option-btn" data-game="0" type="button">False</button>
        </div>`;
    }
    if (sig.gameType === 'choice' && sig.choice) {
      return `
        <p class="eyebrow mono">Pick one</p>
        <h1 class="small">${esc(sig.choice.question)}</h1>
        <div class="stack">
          ${sig.choice.options.map((o, i) => `<button class="option-btn" data-game="${i}" type="button">${esc(o)}</button>`).join('')}
        </div>`;
    }
    // guess the number (default)
    const g = sig.guess;
    const unit = g?.unit ?? '';
    const step = range.max - range.min <= 10 ? 0.05 : 1;
    const value = guessDraft ?? (range.min + range.max) / 2;
    return `
      <p class="eyebrow mono">Guess the number</p>
      <h1 class="small">${esc(g?.question ?? 'Your guess')}</h1>
      <p class="gvalue mono" id="gval">${fmt(value)} ${esc(unit)}</p>
      <input id="grange" class="slider" type="range" min="${range.min}" max="${range.max}" step="${step}" value="${value}" />
      <button class="big-btn" id="glock" type="button">Lock in my guess</button>`;
  };

  const trendForm = () => {
    if (!trendOpen && state.phase !== 'askTrends') return '';
    const full = you.trendCount >= TREND_MAX_PER_PERSON;
    return `
      <section class="trend-box">
        <p class="eyebrow mono">Your trend</p>
        ${full
          ? `<p class="lede">You have added ${TREND_MAX_PER_PERSON} trends. Thank you.</p>`
          : `<textarea id="trend" class="field" maxlength="${TREND_MAX_LENGTH}" placeholder="One line about a trend you'd like to discuss">${esc(trendDraft)}</textarea>
             <p class="mono small-note">${trendDraft.length}/${TREND_MAX_LENGTH} · ${TREND_MAX_PER_PERSON - you.trendCount} left</p>
             <button class="big-btn" id="trend-send" type="button">Send trend</button>`}
      </section>`;
  };

  const render = () => {
    const banner = status === 'live' ? '' : status === 'polling' ? '<p class="banner">Connection is slow. Updating every few seconds.</p>' : '<p class="banner">Reconnecting…</p>';
    const body = !joined
      ? `
        <p class="eyebrow mono">Room ${esc(roomCode)}</p>
        <h1>You're almost in</h1>
        <p class="lede">Add your first name (optional). It's never shown on the big screen.</p>
        <input id="name" class="field" maxlength="24" placeholder="First name" value="${esc(nameDraft)}" />
        <button id="join" class="big-btn" type="button">Join</button>`
      : screenFor(state.phase);
    const addButton = joined && state.phase !== 'close' && state.phase !== 'askTrends' && !trendOpen
      ? `<button class="ghost-btn" id="trend-open" type="button">+ Suggest a trend</button>`
      : '';
    root.innerHTML = `
      <main class="phone">
        ${banner}
        ${toast ? `<p class="toast" role="status">${esc(toast)}</p>` : ''}
        ${trendForm()}
        ${body}
        ${addButton}
        <button class="leave-btn mono" id="leave-phone" type="button">Leave room</button>
      </main>`;
    bind();
    tick();
  };

  const bind = () => {
    root.querySelector<HTMLButtonElement>('#leave-phone')?.addEventListener('click', () => {
      if (!confirm('Leave this room? Your answers stay saved, but you will need the room code to come back.')) return;
      try {
        localStorage.removeItem('signalroom.room');
      } catch {
        /* ignore */
      }
      location.href = '/join';
    });
    root.querySelector<HTMLButtonElement>('#join')?.addEventListener('click', () => {
      nameDraft = root.querySelector<HTMLInputElement>('#name')?.value.trim().slice(0, 24) ?? '';
      join();
    });
    root.querySelectorAll<HTMLButtonElement>('[data-warm]').forEach((b) =>
      b.addEventListener('click', () => {
        const value = Number(b.dataset.warm);
        send({ type: 'answer', participantId: pid, kind: 'warmup', value });
        you = { ...you, warmup: value };
        render();
      }),
    );
    root.querySelectorAll<HTMLButtonElement>('[data-heart]').forEach((b) =>
      b.addEventListener('click', () => {
        send({ type: 'answer', participantId: pid, kind: 'heart', signalId: b.dataset.heart! });
      }),
    );
    const range = root.querySelector<HTMLInputElement>('#grange');
    range?.addEventListener('input', () => {
      guessDraft = Number(range.value);
      root.querySelector('#gval')!.textContent = `${fmt(guessDraft)} ${active()?.guess?.unit ?? ''}`;
    });
    root.querySelector<HTMLButtonElement>('#glock')?.addEventListener('click', () => {
      if (!state.activeSignalId) return;
      const value = guessDraft ?? Number(range?.value ?? 0);
      send({ type: 'answer', participantId: pid, kind: 'game', signalId: state.activeSignalId, value });
    });
    root.querySelectorAll<HTMLButtonElement>('[data-game]').forEach((b) =>
      b.addEventListener('click', () => {
        if (!state.activeSignalId) return;
        send({ type: 'answer', participantId: pid, kind: 'game', signalId: state.activeSignalId, value: Number(b.dataset.game) });
      }),
    );
    root.querySelectorAll<HTMLButtonElement>('[data-take]').forEach((b) =>
      b.addEventListener('click', () => {
        if (!state.activeSignalId) return;
        send({ type: 'answer', participantId: pid, kind: 'take', signalId: state.activeSignalId, value: b.dataset.take as 'agree' | 'disagree' });
      }),
    );
    root.querySelector<HTMLButtonElement>('#trend-open')?.addEventListener('click', () => {
      trendOpen = true;
      render();
    });
    const ta = root.querySelector<HTMLTextAreaElement>('#trend');
    ta?.addEventListener('input', () => {
      trendDraft = ta.value;
      root.querySelector('.trend-box .small-note')!.textContent = `${trendDraft.length}/${TREND_MAX_LENGTH} · ${TREND_MAX_PER_PERSON - you.trendCount} left`;
    });
    root.querySelector<HTMLButtonElement>('#trend-send')?.addEventListener('click', () => {
      const text = trendDraft.trim();
      if (text.length < 3) return showToast('Write a few words first');
      send({ type: 'trend', participantId: pid, text });
      trendDraft = '';
      trendOpen = false;
      showToast('Thanks, your trend is in');
    });
  };

  // Countdown for the heart pick.
  const tick = () => {
    const el = root.querySelector<HTMLElement>('#timer');
    if (!el || !state.heartsEndsAt) return;
    const secs = Math.max(0, Math.ceil((state.heartsEndsAt - Date.now()) / 1000));
    el.textContent = secs > 0 ? `${secs} s left` : 'Time is up';
  };
  window.setInterval(tick, 500);

  root.addEventListener('input', (e) => {
    if ((e.target as HTMLElement).id === 'name') nameDraft = (e.target as HTMLInputElement).value;
  });

  render();
}

const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString('en-GB') : String(Number(n.toFixed(2))));
