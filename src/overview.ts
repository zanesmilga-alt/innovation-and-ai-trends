import { actLens, actName, loadSignals } from './data';
import { pictureEl } from './picture';
import type { Act, Signal } from './types';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);

/** The shareable overview: every included trend, grouped by act. Works on any phone, no login. */
export async function mountOverview(root: HTMLElement): Promise<void> {
  root.innerHTML = `<main class="ov" id="ov"><p class="mono ov-loading">Loading the trends…</p></main>`;
  const ov = root.querySelector<HTMLElement>('#ov')!;
  let data;
  try {
    data = await loadSignals();
  } catch (err) {
    ov.innerHTML = `<p class="error">Could not load the trends. ${esc(String(err))}</p>`;
    return;
  }
  const { signals, acts, pitch } = data;
  const byAct = new Map<string, Signal[]>();
  for (const s of signals) {
    if (!byAct.has(s.act)) byAct.set(s.act, []);
    byAct.get(s.act)!.push(s);
  }
  const sections = acts
    .filter((a: Act) => byAct.has(a.id))
    .map((a: Act) => {
      const items = byAct.get(a.id)!;
      return `
        <section class="ov-act">
          <p class="eyebrow mono">${esc(actLens(acts, a.id))}</p>
          <h2>${esc(actName(acts, a.id))}</h2>
          <p class="ov-sub">${esc(a.sub)}</p>
          <div class="ov-grid">
            ${items.map((s) => `
              <a class="ov-card" href="/explore#s=${esc(s.id)}">
                <span class="ov-pic" data-id="${esc(s.id)}"></span>
                <span class="ov-body">
                  <span class="ov-title">${esc(s.title)}</span>
                  <span class="ov-tag">${esc(s.hook)}</span>
                  <span class="ov-more mono">Read the trend →</span>
                </span>
              </a>`).join('')}
          </div>
        </section>`;
    })
    .join('');

  ov.innerHTML = `
    <header class="ov-head">
      <p class="eyebrow mono">Innovation In &amp; Out · overview</p>
      <h1>Too Late To Ignore</h1>
      <p class="ov-pitch">${esc(pitch)}</p>
      <p class="mono ov-count">${signals.length} trends</p>
    </header>
    ${sections}
    <footer class="ov-foot">
      <p class="mono">Figures come from the June 2026 deck and the linked sources on each trend page. Not all figures are re-checked.</p>
      <p><a class="btn primary" href="/explore">Explore the trends</a></p>
    </footer>`;

  // Pictures: the uploaded or file photo, or the trend's generated artwork.
  ov.querySelectorAll<HTMLElement>('.ov-pic').forEach((slot) => {
    const s = signals.find((x) => x.id === slot.dataset.id);
    if (s) slot.appendChild(pictureEl(s.id, s.art, 'pic ov-picbox'));
  });
}
