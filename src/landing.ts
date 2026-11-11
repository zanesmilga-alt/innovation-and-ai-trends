import { drawArt } from './art';
import { loadSignals } from './data';
import { pictureEl } from './picture';

/** Landing page: the front door. Brand sits top-right via index.html. */
export function mountLanding(root: HTMLElement): void {
  root.innerHTML = `
    <section class="landing">
      <canvas class="landing-art" aria-hidden="true"></canvas>
      <img class="landing-img" src="/images/hero.jpg" alt="" hidden />
      <div class="landing-inner">
        <p class="eyebrow mono">Innovation In &amp; Out · AI trends</p>
        <h1>Too Late To Ignore</h1>
        <p class="lede">AI is moving too fast to ignore, and too fast to catch up on later. Read the trends, play the numbers, then see what they mean for us.</p>
        <nav class="ctas" aria-label="Main">
          <a class="btn primary" href="/explore">Explore the trends</a>
          <a class="btn" href="/overview">Overview</a>
          <a class="btn" href="/stage">Presenter stage</a>
        </nav>
        <div class="strip" id="strip" aria-label="Trend pictures"></div>
      </div>
    </section>`;

  const canvas = root.querySelector<HTMLCanvasElement>('.landing-art')!;
  const img = root.querySelector<HTMLImageElement>('.landing-img')!;
  const paint = () => drawArt(canvas, 'orbit', 'landing');
  paint();
  window.addEventListener('resize', paint);
  img.onload = () => {
    img.hidden = false;
    canvas.style.opacity = '0.25';
  };

  loadSignals()
    .then(({ signals }) => {
      const strip = root.querySelector<HTMLElement>('#strip')!;
      signals.slice(0, 6).forEach((s) => {
        const a = document.createElement('a');
        a.href = `/explore#s=${s.id}`;
        a.setAttribute('aria-label', s.title);
        a.appendChild(pictureEl(s.id, s.art, 'pic'));
        strip.appendChild(a);
      });
    })
    .catch(() => {
      /* the strip is decoration; the page works without it */
    });
}
