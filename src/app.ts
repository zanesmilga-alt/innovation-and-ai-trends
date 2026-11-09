import { actLabel, loadSignals } from './data';
import { drawArt } from './art';
import { iconSvg } from './icons';
import type { Signal, SignalFile } from './types';

export type Mode = 'stage' | 'explore';

// Map is designed on a fixed 1600x900 board and scaled to fit any screen.
const BOARD_W = 1600;
const BOARD_H = 900;
const CLUSTER_X = [300, 800, 1300];
const CLUSTER_Y = [300, 640];

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);

const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString('en-GB') : String(Number(n.toFixed(2))));

/** Trend picture with an upload slot underneath. Both are always in the DOM; CSS shows the slot when the picture is missing. */
function picture(s: Signal, cls: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = `${cls}`;
  const img = document.createElement('img');
  img.className = 'trend-img duo';
  img.alt = '';
  img.loading = 'lazy';
  img.src = s.image ?? `/images/trends/${s.id}.jpg`;
  img.onerror = () => wrap.classList.add('no-img');
  wrap.appendChild(img);
  const slot = document.createElement('span');
  slot.className = 'slot mono';
  slot.textContent = cls.includes('story') ? `+ add public/images/trends/${s.id}.jpg` : `+ ${s.id}.jpg`;
  wrap.appendChild(slot);
  return wrap;
}

export async function mountApp(root: HTMLElement, mode: Mode): Promise<void> {
  root.innerHTML = `
    <div class="viewport">
      <div class="map-layer" id="map-layer">
        <div class="board" id="board" style="width:${BOARD_W}px;height:${BOARD_H}px">
          <svg class="links" viewBox="0 0 ${BOARD_W} ${BOARD_H}" aria-hidden="true"></svg>
        </div>
      </div>
      <section class="story" id="story" aria-live="polite" aria-hidden="true">
        <div class="story-art" id="story-art"><canvas id="story-canvas"></canvas></div>
        <div class="story-body" id="story-body"></div>
        <div class="game" id="game" hidden></div>
      </section>
      <div class="help" id="help" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" hidden></div>
      <p class="note mono" id="note"></p>
    </div>`;

  const mapLayer = root.querySelector<HTMLElement>('#map-layer')!;
  const board = root.querySelector<HTMLElement>('#board')!;
  const story = root.querySelector<HTMLElement>('#story')!;
  const storyArt = root.querySelector<HTMLElement>('#story-art')!;
  const storyBody = root.querySelector<HTMLElement>('#story-body')!;
  const storyCanvas = root.querySelector<HTMLCanvasElement>('#story-canvas')!;
  const game = root.querySelector<HTMLElement>('#game')!;
  const help = root.querySelector<HTMLElement>('#help')!;
  const note = root.querySelector<HTMLElement>('#note')!;
  const links = board.querySelector<SVGSVGElement>('.links')!;

  let data: SignalFile;
  try {
    data = await loadSignals();
  } catch (err) {
    board.innerHTML = `<p class="error">Could not load the signals. ${esc(String(err))}</p>`;
    return;
  }

  const signals = data.signals;
  const byId = new Map(signals.map((s) => [s.id, s]));
  const nodeEls = new Map<string, HTMLButtonElement>();
  let current: string | null = null;
  let gameOpen = false;

  if (data.placeholder) {
    note.textContent = 'Draft · deck figures not re-checked · placeholders still to fill';
  }

  // ---------- Map ----------
  const clusters = groupByAct(signals);
  clusters.forEach((list, idx) => {
    const cx = CLUSTER_X[idx % 3];
    const cy = CLUSTER_Y[Math.floor(idx / 3)];
    const offsets = list.length === 5
      ? [[0, 0], [-125, -78], [125, -78], [-125, 78], [125, 78]]
      : [[-125, -70], [125, -70], [-125, 70], [125, 70]];

    const label = document.createElement('div');
    label.className = 'cluster-label mono';
    label.style.left = `${cx}px`;
    label.style.top = `${cy - 175}px`;
    label.textContent = actLabel(list[0].act);
    board.appendChild(label);

    list.forEach((s, i) => {
      const [dx, dy] = offsets[i] ?? [0, 0];
      const btn = document.createElement('button');
      btn.className = 'node';
      btn.style.left = `${cx + dx}px`;
      btn.style.top = `${cy + dy}px`;
      btn.dataset.id = s.id;
      btn.setAttribute('aria-label', `${s.n}. ${s.title}`);
      btn.innerHTML = `
        <span class="disc"></span>
        <span class="node-title">${esc(s.short)}</span>
        ${s.isNew ? '<span class="new-dot" title="New since June"></span>' : ''}`;
      const disc = btn.querySelector<HTMLElement>('.disc')!;
      disc.appendChild(picture(s, 'pic'));
      disc.appendChild(iconSvg(s.icon));
      btn.addEventListener('click', () => openSignal(s.id));
      board.appendChild(btn);
      nodeEls.set(s.id, btn);
    });

    // Lines from the cluster's first node to the others.
    const first = offsets[0];
    list.slice(1).forEach((_, i) => {
      const [dx, dy] = offsets[i + 1] ?? [0, 0];
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(cx + first[0]));
      line.setAttribute('y1', String(cy + first[1]));
      line.setAttribute('x2', String(cx + dx));
      line.setAttribute('y2', String(cy + dy));
      links.appendChild(line);
    });
  });

  // Fit the 1600x900 board into the window, centred.
  const fit = () => {
    const s = Math.min(window.innerWidth / BOARD_W, window.innerHeight / BOARD_H);
    board.style.transform = `translate(-50%, -50%) scale(${s})`;
  };
  board.style.left = '50%';
  board.style.top = '50%';
  fit();
  window.addEventListener('resize', () => {
    fit();
    if (current) renderArtFor(current);
  });

  // ---------- Story ----------
  function renderStory(s: Signal) {
    const idx = signals.indexOf(s);
    const sourceFor = (i: number, fallback: string) => fallback || s.sources[i] || s.sources[0] || '';
    storyBody.innerHTML = `
      <header class="story-top">
        <span class="mono">${esc(actLabel(s.act))} · ${String(idx + 1).padStart(2, '0')} / ${String(signals.length).padStart(2, '0')}</span>
        ${s.isNew ? '<span class="tag tag-new mono">New since June</span>' : ''}
        ${s.status ? `<span class="tag mono">${esc(s.status)}</span>` : ''}
      </header>
      <div class="story-main">
        <div class="story-icon"></div>
        <h2 class="story-title">${esc(s.title)}</h2>
        <p class="story-hook">${esc(s.hook)}</p>
        <div class="stats">
          ${s.stats.map((st, i) => `
            <div class="stat">
              <div class="stat-value">${esc(st.value)}</div>
              <div class="stat-label">${esc(st.label)}</div>
              <div class="stat-meta mono">
                <span class="fresh fresh-${st.fresh}">${st.fresh === 'checked' ? 'Checked Nov 2026' : 'From June deck · verify'}</span>
                ${sourceFor(i, st.source ?? '') ? `<span class="src">${esc(sourceFor(i, st.source ?? ''))}</span>` : ''}
              </div>
            </div>`).join('')}
        </div>
        <div class="why">
          <h3 class="mono">Why it matters for our customers</h3>
          <p>${esc(s.why)}</p>
        </div>
        <div class="play-row">
          <button class="play-btn" type="button" id="play-btn">
            <span class="play-dot" aria-hidden="true"></span> Play a game on this trend
          </button>
        </div>
      </div>
      <footer class="story-foot">
        <p class="sources mono">Sources: ${s.sources.map(esc).join(' · ')}</p>
        <p class="keys mono">← → next / previous · Esc map · ? keys</p>
      </footer>`;
    storyBody.querySelector('.story-icon')!.appendChild(iconSvg(s.icon));
    storyBody.querySelector('#play-btn')!.addEventListener('click', () => openGame(s));

    // Trend photo, duotone, with an upload slot if the file is missing.
    storyArt.querySelectorAll('.pic').forEach((el) => el.remove());
    const pic = picture(s, 'pic story-pic');
    storyArt.appendChild(pic);
    renderArtFor(s.id);
  }

  function renderArtFor(id: string) {
    const s = byId.get(id);
    if (!s) return;
    drawArt(storyCanvas, s.art, s.id);
  }

  function openSignal(id: string) {
    const s = byId.get(id);
    if (!s) return;
    const wasOpen = current !== null;
    current = id;
    const node = nodeEls.get(id)!;
    const r = node.getBoundingClientRect();
    if (!wasOpen) {
      // Zoom the map toward the node while the story fades in.
      mapLayer.style.transformOrigin = `${r.left + r.width / 2}px ${r.top + r.height / 2}px`;
      mapLayer.classList.add('zoomed');
      story.classList.add('open');
      story.setAttribute('aria-hidden', 'false');
    }
    story.classList.remove('swap');
    renderStory(s);
    if (wasOpen) {
      story.classList.add('swap');
      requestAnimationFrame(() => story.classList.remove('swap'));
    }
    history.replaceState(null, '', `#s=${id}`);
    help.hidden = true;
    if (gameOpen) closeGame();
  }

  function closeStory() {
    if (!current) return;
    closeGame();
    current = null;
    mapLayer.classList.remove('zoomed');
    mapLayer.style.transformOrigin = '';
    story.classList.remove('open');
    story.setAttribute('aria-hidden', 'true');
    history.replaceState(null, '', location.pathname);
  }

  function step(delta: number) {
    if (!current) return;
    const idx = signals.findIndex((s) => s.id === current);
    const next = signals[(idx + delta + signals.length) % signals.length];
    openSignal(next.id);
  }

  // ---------- Games ----------
  function openGame(s: Signal) {
    const tabs: { key: 'guess' | 'trueFalse' | 'chance'; label: string }[] = [];
    if (s.guess) tabs.push({ key: 'guess', label: 'Guess the number' });
    if (s.trueFalse) tabs.push({ key: 'trueFalse', label: 'True or false' });
    if (s.chance) tabs.push({ key: 'chance', label: 'What are the chances?' });
    if (tabs.length === 0) return;
    gameOpen = true;
    game.hidden = false;
    game.innerHTML = `
      <div class="game-card" role="dialog" aria-modal="true" aria-label="Game">
        <div class="game-head">
          <span class="mono">Play · ${esc(s.short)}</span>
          <button class="game-close mono" type="button">Close · Esc</button>
        </div>
        <div class="game-tabs" role="tablist">
          ${tabs.map((t, i) => `<button role="tab" type="button" class="game-tab mono" data-key="${t.key}" aria-selected="${i === 0}">${esc(t.label)}</button>`).join('')}
        </div>
        <div class="game-body" id="game-body"></div>
      </div>`;
    game.querySelector('.game-close')!.addEventListener('click', closeGame);
    game.querySelectorAll<HTMLButtonElement>('.game-tab').forEach((b) =>
      b.addEventListener('click', () => {
        game.querySelectorAll('.game-tab').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
        renderGame(s, b.dataset.key as 'guess' | 'trueFalse' | 'chance');
      }),
    );
    renderGame(s, tabs[0].key);
  }

  function closeGame() {
    gameOpen = false;
    game.hidden = true;
    game.innerHTML = '';
  }

  function renderGame(s: Signal, kind: 'guess' | 'trueFalse' | 'chance') {
    const body = game.querySelector<HTMLElement>('#game-body')!;
    if (kind === 'guess' && s.guess) {
      const g = s.guess;
      const step = g.max - g.min <= 10 ? 0.05 : 1;
      const mid = Math.round(((g.min + g.max) / 2) / step) * step;
      body.innerHTML = `
        <p class="game-q">${esc(g.question)}</p>
        <div class="slider-row">
          <input type="range" id="gval" min="${g.min}" max="${g.max}" step="${step}" value="${mid}" />
          <output class="gout mono" id="gout">${fmt(mid)} ${esc(g.unit)}</output>
        </div>
        <button class="game-go" type="button" id="go">Lock in my guess</button>
        <div class="game-result" id="res"></div>`;
      const input = body.querySelector<HTMLInputElement>('#gval')!;
      const out = body.querySelector<HTMLElement>('#gout')!;
      input.addEventListener('input', () => (out.textContent = `${fmt(Number(input.value))} ${g.unit}`));
      body.querySelector('#go')!.addEventListener('click', () => {
        const guess = Number(input.value);
        const diff = Math.abs(guess - g.answer);
        const range = g.max - g.min;
        const verdict = diff === 0 ? 'Spot on.' : diff / range < 0.05 ? 'Very close.' : guess > g.answer ? 'Too high.' : 'Too low.';
        body.querySelector('#res')!.innerHTML = `
          <div class="reveal">
            <p class="reveal-big">${esc(g.answerLabel)}</p>
            <p>You said <strong>${fmt(guess)} ${esc(g.unit)}</strong>. ${verdict} ${diff ? `Off by ${fmt(Number(diff.toFixed(2)))} ${esc(g.unit)}.` : ''}</p>
            <p class="reveal-src mono">Source: ${esc(g.source)}</p>
          </div>`;
        (body.querySelector('#go') as HTMLButtonElement).disabled = true;
        input.disabled = true;
      });
    } else if (kind === 'trueFalse' && s.trueFalse) {
      const t = s.trueFalse;
      body.innerHTML = `
        <p class="game-q">${esc(t.statement)}</p>
        <div class="tf-row">
          <button class="tf-btn" type="button" data-v="true">True</button>
          <button class="tf-btn" type="button" data-v="false">False</button>
        </div>
        <div class="game-result" id="res"></div>`;
      body.querySelectorAll<HTMLButtonElement>('.tf-btn').forEach((b) =>
        b.addEventListener('click', () => {
          const said = b.dataset.v === 'true';
          const right = said === t.answer;
          body.querySelector('#res')!.innerHTML = `
            <div class="reveal">
              <p class="reveal-big ${right ? 'ok' : 'nope'}">${right ? 'Right.' : 'Not quite.'} It is ${t.answer ? 'true' : 'false'}.</p>
              <p>${esc(t.explanation)}</p>
            </div>`;
          body.querySelectorAll<HTMLButtonElement>('.tf-btn').forEach((x) => (x.disabled = true));
        }),
      );
    } else if (kind === 'chance' && s.chance) {
      const c = s.chance;
      body.innerHTML = `
        <p class="game-q">${esc(c.question)}</p>
        <div class="slider-row">
          <input type="range" id="gval" min="0" max="100" step="1" value="50" />
          <output class="gout mono" id="gout">50%</output>
        </div>
        <button class="game-go" type="button" id="go">Lock in my chance</button>
        <div class="game-result" id="res"></div>`;
      const input = body.querySelector<HTMLInputElement>('#gval')!;
      const out = body.querySelector<HTMLElement>('#gout')!;
      input.addEventListener('input', () => (out.textContent = `${input.value}%`));
      body.querySelector('#go')!.addEventListener('click', () => {
        const guess = Number(input.value);
        const diff = Math.abs(guess - c.answer);
        body.querySelector('#res')!.innerHTML = `
          <div class="reveal">
            <p class="reveal-big">${c.answer}%</p>
            <p>You said <strong>${guess}%</strong>. ${diff === 0 ? 'Spot on.' : `${diff} points ${guess > c.answer ? 'high' : 'low'}.`}</p>
            <p>${esc(c.explanation)}</p>
          </div>`;
        (body.querySelector('#go') as HTMLButtonElement).disabled = true;
        input.disabled = true;
      });
    }
  }

  // ---------- Help ----------
  help.innerHTML = `
    <div class="help-card">
      <h2>Keyboard</h2>
      <dl>
        <dt>→ / ←</dt><dd>Open the first signal, then step through them</dd>
        <dt>Click a node</dt><dd>Zoom into its story</dd>
        <dt>Play a game</dt><dd>Guess, true or false, or chances, on each trend</dd>
        <dt>Esc</dt><dd>Close a game, or go back to the map</dd>
        <dt>M</dt><dd>Show the map</dd>
        <dt>?</dt><dd>Show or hide this panel</dd>
      </dl>
      <p class="mono">Press ? or Esc to close</p>
    </div>`;

  const toggleHelp = (open?: boolean) => {
    help.hidden = open === undefined ? !help.hidden : !open;
  };
  help.addEventListener('click', () => toggleHelp(false));

  // ---------- Keys ----------
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    switch (e.key) {
      case 'Escape':
        if (!help.hidden) toggleHelp(false);
        else if (gameOpen) closeGame();
        else closeStory();
        break;
      case 'ArrowRight':
        if (gameOpen) break;
        e.preventDefault();
        if (current) step(1);
        else openSignal(signals[0].id);
        break;
      case 'ArrowLeft':
        if (gameOpen) break;
        e.preventDefault();
        if (current) step(-1);
        else openSignal(signals[signals.length - 1].id);
        break;
      case 'm':
      case 'M':
        if (!gameOpen) closeStory();
        break;
      case '?':
        toggleHelp();
        break;
    }
  });

  // Deep link: /explore#s=s07
  const fromHash = location.hash.match(/s=([\w-]+)/)?.[1];
  if (fromHash && byId.has(fromHash)) {
    requestAnimationFrame(() => openSignal(fromHash));
  }

  document.body.dataset.mode = mode;
}

function groupByAct(signals: Signal[]): Signal[][] {
  const order: (number | string)[] = [];
  const map = new Map<number | string, Signal[]>();
  for (const s of signals) {
    if (!map.has(s.act)) {
      map.set(s.act, []);
      order.push(s.act);
    }
    map.get(s.act)!.push(s);
  }
  return order.map((a) => map.get(a)!);
}
