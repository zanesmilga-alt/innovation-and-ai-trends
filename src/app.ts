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

export async function mountApp(root: HTMLElement, mode: Mode): Promise<void> {
  root.innerHTML = `
    <div class="viewport">
      <div class="map-layer" id="map-layer">
        <div class="board" id="board" style="width:${BOARD_W}px;height:${BOARD_H}px">
          <svg class="links" viewBox="0 0 ${BOARD_W} ${BOARD_H}" aria-hidden="true"></svg>
        </div>
      </div>
      <section class="story" id="story" aria-live="polite" aria-hidden="true">
        <div class="story-art"><canvas id="story-canvas"></canvas><img id="story-img" alt="" hidden /></div>
        <div class="story-body" id="story-body"></div>
      </section>
      <div class="help" id="help" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" hidden></div>
      <p class="note mono" id="note"></p>
    </div>`;

  const mapLayer = root.querySelector<HTMLElement>('#map-layer')!;
  const board = root.querySelector<HTMLElement>('#board')!;
  const story = root.querySelector<HTMLElement>('#story')!;
  const storyBody = root.querySelector<HTMLElement>('#story-body')!;
  const storyCanvas = root.querySelector<HTMLCanvasElement>('#story-canvas')!;
  const storyImg = root.querySelector<HTMLImageElement>('#story-img')!;
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

  if (data.placeholder) {
    note.textContent = 'Placeholder content · replace public/signals.json';
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
      const x = cx + dx;
      const y = cy + dy;
      const btn = document.createElement('button');
      btn.className = 'node';
      btn.style.left = `${x}px`;
      btn.style.top = `${y}px`;
      btn.dataset.id = s.id;
      btn.setAttribute('aria-label', `${s.n}. ${s.title}`);
      btn.innerHTML = `
        <span class="disc"></span>
        <span class="node-title">${esc(s.short)}</span>
        ${s.isNew ? '<span class="new-dot" title="New since June"></span>' : ''}`;
      btn.querySelector('.disc')!.appendChild(iconSvg(s.icon));
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
    const sourceFor = (i: number) => s.sources[i] ?? s.sources[0] ?? '';
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
                ${sourceFor(i) ? `<span class="src">${esc(sourceFor(i))}</span>` : ''}
              </div>
            </div>`).join('')}
        </div>
        <div class="why">
          <h3 class="mono">Why it matters for our customers</h3>
          <p>${esc(s.why)}</p>
        </div>
      </div>
      <footer class="story-foot">
        <p class="sources mono">Sources: ${s.sources.map(esc).join(' · ')}</p>
        <p class="keys mono">← → next / previous · Esc map · ? keys</p>
      </footer>`;
    storyBody.querySelector('.story-icon')!.appendChild(iconSvg(s.icon));
    renderArtFor(s.id);
    if (s.image) {
      storyImg.onerror = () => { storyImg.hidden = true; };
      storyImg.onload = () => { storyImg.hidden = false; };
      storyImg.src = s.image;
    } else {
      storyImg.hidden = true;
      storyImg.removeAttribute('src');
    }
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
  }

  function closeStory() {
    if (!current) return;
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

  // ---------- Help ----------
  help.innerHTML = `
    <div class="help-card">
      <h2>Keyboard</h2>
      <dl>
        <dt>→ / ←</dt><dd>Open the first signal, then step through them</dd>
        <dt>Click a node</dt><dd>Zoom into its story</dd>
        <dt>Esc</dt><dd>Back to the map</dd>
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
        else closeStory();
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (current) step(1);
        else openSignal(signals[0].id);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (current) step(-1);
        else openSignal(signals[signals.length - 1].id);
        break;
      case 'm':
      case 'M':
        closeStory();
        break;
      case '?':
        toggleHelp();
        break;
    }
  });

  // Deep link: /explore#s=07
  const fromHash = location.hash.match(/s=([\w-]+)/)?.[1];
  if (fromHash && byId.has(fromHash)) {
    // Opening without animation on first load: set transition off for the first frame.
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
