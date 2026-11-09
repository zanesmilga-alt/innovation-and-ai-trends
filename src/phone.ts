import { connectRoom, participantId, type LinkStatus } from './live/socket';
import { loadSignals } from './data';
import { MAX_HEARTS, type Phase, type PublicState, type You, type ServerMessage } from './protocol';
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
  const pid = participantId();
  const [cfg, signalFile] = await Promise.all([
    fetch('/config.json').then((r) => r.json() as Promise<Config>),
    loadSignals().catch(() => null),
  ]);
  const signals: Signal[] = signalFile?.signals ?? [];

  let state: PublicState = { type: 'state', phase: 'lobby', activeSignalId: null, revealed: false, participantCount: 0, heartsEndsAt: null };
  let you: You = { type: 'you', warmup: null, hearts: [] };
  let joined = false;
  let link: { send: (m: import('./protocol').ClientMessage) => void } | null = null;
  let status: LinkStatus = 'reconnecting';
  let toast = '';
  let toastTimer: number | undefined;
  let nameDraft = '';
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

  link = connectRoom({
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
      if (m.type === 'state') state = m;
      else if (m.type === 'you') you = m;
      else if (m.type === 'error') showToast(m.message);
      render();
    },
  });

  const join = () => {
    joined = true;
    try {
      localStorage.setItem('signalroom.name', nameDraft);
    } catch {
      /* ignore */
    }
    link?.send({ type: 'join', participantId: pid, name: nameDraft || undefined });
    render();
  };

  const body = () => {
    if (!joined) {
      return `
        <p class="eyebrow mono">Room ${esc(roomCode)}</p>
        <h1>You're almost in</h1>
        <p class="lede">Add your first name (optional). It's never shown on the big screen.</p>
        <input id="name" class="field" maxlength="24" placeholder="First name" value="${esc(nameDraft)}" />
        <button id="join" class="big-btn" type="button">Join</button>`;
    }
    return screenFor(state.phase);
  };

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
      const left = MAX_HEARTS - you.hearts.length;
      if (state.revealed) return panel('Hearts are in', 'Look at the big screen.');
      return `
        <p class="eyebrow mono">Pick up to ${MAX_HEARTS} signals</p>
        <h1 class="small">${left > 0 ? `${left} heart${left === 1 ? '' : 's'} left` : 'All hearts used'}</h1>
        <p class="mono timer" id="timer"></p>
        <ul class="hearts">
          ${signals.map((s) => {
            const on = you.hearts.includes(s.id);
            return `<li><button class="heart-row ${on ? 'on' : ''}" data-heart="${esc(s.id)}" type="button" aria-pressed="${on}">
              <span class="heart" aria-hidden="true">${on ? '♥' : '♡'}</span><span>${esc(s.short)}</span></button></li>`;
          }).join('')}
        </ul>`;
    }
    if (phase === 'lobby') {
      return panel("You're in", 'Waiting for the next prompt.', `${state.participantCount} joined`);
    }
    return panel('Eyes up', 'Look at the big screen.');
  };

  const panel = (title: string, text: string, extra = '') => `
    <div class="centre">
      <h1 class="huge">${esc(title)}</h1>
      <p class="lede">${esc(text)}</p>
      ${extra ? `<p class="mono small-note">${esc(extra)}</p>` : ''}
    </div>`;

  const render = () => {
    const banner = status === 'live' ? '' : status === 'polling' ? '<p class="banner">Connection is slow. Updating every few seconds.</p>' : '<p class="banner">Reconnecting…</p>';
    root.innerHTML = `
      <main class="phone">
        ${banner}
        ${toast ? `<p class="toast" role="status">${esc(toast)}</p>` : ''}
        ${body()}
      </main>`;
    bind();
    tick();
  };

  const bind = () => {
    root.querySelector<HTMLButtonElement>('#join')?.addEventListener('click', () => {
      nameDraft = root.querySelector<HTMLInputElement>('#name')?.value.trim().slice(0, 24) ?? '';
      join();
    });
    root.querySelectorAll<HTMLButtonElement>('[data-warm]').forEach((b) =>
      b.addEventListener('click', () => {
        const value = Number(b.dataset.warm);
        link?.send({ type: 'answer', participantId: pid, kind: 'warmup', value });
        you = { ...you, warmup: value };
        render();
      }),
    );
    root.querySelectorAll<HTMLButtonElement>('[data-heart]').forEach((b) =>
      b.addEventListener('click', () => {
        const signalId = b.dataset.heart!;
        link?.send({ type: 'answer', participantId: pid, kind: 'heart', signalId });
      }),
    );
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

export type { PublicState };
