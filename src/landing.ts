import { drawArt } from './art';

/** Landing page: the front door. Brand sits top-right via index.html. */
export function mountLanding(root: HTMLElement): void {
  root.innerHTML = `
    <section class="landing">
      <canvas class="landing-art" aria-hidden="true"></canvas>
      <img class="landing-img" src="/images/hero.jpg" alt="" hidden />
      <div class="landing-inner">
        <p class="eyebrow mono">Innovation In &amp; Out · AI trends</p>
        <h1>Signal Room</h1>
        <p class="lede">Twenty-five external AI signals, one map. Read the stories, then see what they mean for our customers.</p>
        <nav class="ctas" aria-label="Main">
          <a class="btn primary" href="/explore">Explore the 25 signals</a>
          <a class="btn" href="/stage">Open the presenter stage</a>
        </nav>
      </div>
    </section>`;

  const canvas = root.querySelector<HTMLCanvasElement>('.landing-art')!;
  const img = root.querySelector<HTMLImageElement>('.landing-img')!;
  const paint = () => drawArt(canvas, 'orbit', 'landing');
  paint();
  window.addEventListener('resize', paint);
  img.onload = () => { img.hidden = false; canvas.style.opacity = '0.35'; };
}
