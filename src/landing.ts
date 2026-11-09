import { drawArt } from './art';
import { loadSignals } from './data';
import type { Signal } from './types';

/** Landing page: the front door. Brand sits top-right via index.html. */
export function mountLanding(root: HTMLElement): void {
  root.innerHTML = `
    <section class="landing">
      <canvas class="landing-art" aria-hidden="true"></canvas>
      <img class="landing-img" src="/images/hero.jpg" alt="" hidden />
      <div class="landing-inner">
        <p class="eyebrow mono">Innovation In &amp; Out · AI trends</p>
        <h1>Signal Room</h1>
        <p class="lede">Twenty-five external AI signals, one map. Read the stories, play the numbers, then see what they mean for our customers.</p>
        <nav class="ctas" aria-label="Main">
          <a class="btn primary" href="/explore">Explore the 25 signals</a>
          <a class="btn" href="/stage">Open the presenter stage</a>
        </nav>
        <div class="strip" id="strip" aria-label="Trend pictures"></div>
      </div>
    </section>`;

  const canvas = root.querySelector<HTMLCanvasElement>('.landing-art')!;
  const img = root.querySelector<HTMLImageElement>('.landing-img')!;
  const paint = () => drawArt(canvas, 'orbit', 'landing');
  paint();
  window.addEventListener('resize', paint);
  img.onload = () => { img.hidden = false; canvas.style.opacity = '0.25'; };

  // A few trend pictures, each linking into the explorer.
  loadSignals()
    .then(({ signals }) => {
      const strip = root.querySelector<HTMLElement>('#strip')!;
      signals.slice(0, 6).forEach((s: Signal) => {
        const a = document.createElement('a');
        a.href = `/explore#s=${s.id}`;
        a.setAttribute('aria-label', s.title);
        const pic = document.createElement('div');
        pic.className = 'pic';
        const i = document.createElement('img');
        i.className = 'duo';
        i.alt = '';
        i.loading = 'lazy';
        i.src = `/images/trends/${s.id}.jpg`;
        i.onerror = () => pic.classList.add('no-img');
        pic.appendChild(i);
        const slot = document.createElement('span');
        slot.className = 'slot mono';
        slot.textContent = `+ ${s.id}.jpg`;
        pic.appendChild(slot);
        a.appendChild(pic);
        strip.appendChild(a);
      });
    })
    .catch(() => { /* strip is decoration; the page works without it */ });
}
