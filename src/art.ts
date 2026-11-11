// Generated duotone artwork for signals without a photo.
// Palette: navy -> signal orange -> cream, so art and photos read as one set.
// Motif names match signals.json "art" keys. Each motif is deterministic per seed.

export const PAL = {
  navy: '#080C1E',
  navy2: '#10162F',
  navy3: '#182044',
  orange: '#F07A2E',
  hi: '#FFB37A',
  cream: '#F4E9DC',
  teal: '#5ED3C2',
};

type Rand = () => number;
type Draw = (c: CanvasRenderingContext2D, w: number, h: number, r: Rand) => void;

function rng(seed: string): Rand {
  let s = 0;
  for (const ch of seed) s = (Math.imul(s, 31) + ch.charCodeAt(0)) | 0;
  s = s || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

const alpha = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

const dot = (c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) => {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = color;
  c.fill();
};

const motifs: Record<string, Draw> = {
  network(c, w, h, r) {
    const pts = Array.from({ length: 48 }, () => ({ x: r() * w, y: r() * h }));
    const reach = w * 0.16;
    c.lineWidth = 1;
    pts.forEach((p, i) =>
      pts.forEach((q, j) => {
        if (j <= i) return;
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d > reach) return;
        c.strokeStyle = alpha(PAL.orange, 0.7 * (1 - d / reach));
        c.beginPath();
        c.moveTo(p.x, p.y);
        c.lineTo(q.x, q.y);
        c.stroke();
      }),
    );
    pts.forEach((p) => dot(c, p.x, p.y, 2 + r() * 3, r() > 0.85 ? PAL.hi : PAL.cream));
  },

  molecules(c, w, h, r) {
    c.strokeStyle = alpha(PAL.orange, 0.55);
    c.lineWidth = 2;
    for (let k = 0; k < 7; k++) {
      const cx = r() * w;
      const cy = r() * h;
      const s = 30 + r() * 55;
      const rot = r() * Math.PI;
      const v = Array.from({ length: 6 }, (_, i) => ({
        x: cx + s * Math.cos(rot + (i * Math.PI) / 3),
        y: cy + s * Math.sin(rot + (i * Math.PI) / 3),
      }));
      c.beginPath();
      v.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      c.closePath();
      c.stroke();
      v.forEach((p) => dot(c, p.x, p.y, 4, PAL.cream));
    }
  },

  orbit(c, w, h, r) {
    const cx = w / 2;
    const cy = h / 2;
    for (let i = 1; i <= 6; i++) {
      const rx = i * w * 0.075;
      const ry = rx * 0.42;
      const tilt = i * 0.32;
      c.beginPath();
      c.ellipse(cx, cy, rx, ry, tilt, 0, Math.PI * 2);
      c.strokeStyle = alpha(PAL.orange, 0.2 + i * 0.07);
      c.lineWidth = 1.5;
      c.stroke();
      const a = r() * Math.PI * 2;
      const x = cx + rx * Math.cos(a) * Math.cos(tilt) - ry * Math.sin(a) * Math.sin(tilt);
      const y = cy + rx * Math.cos(a) * Math.sin(tilt) + ry * Math.sin(a) * Math.cos(tilt);
      dot(c, x, y, 5 + i, i % 2 ? PAL.hi : PAL.cream);
    }
    dot(c, cx, cy, 14, PAL.orange);
  },

  ripples(c, w, h, r) {
    const cx = w * 0.7;
    const cy = h * 0.6;
    for (let i = 0; i < 16; i++) {
      c.beginPath();
      c.arc(cx, cy, i * w * 0.035, 0, Math.PI * 2);
      c.strokeStyle = alpha(i % 3 ? PAL.orange : PAL.hi, 0.6 - i * 0.03);
      c.lineWidth = 1.5 + r();
      c.stroke();
    }
  },

  lenses(c, w, h, r) {
    for (let i = 0; i < 7; i++) {
      const rad = 80 + r() * 220;
      const x = r() * w;
      const y = r() * h;
      c.beginPath();
      c.arc(x, y, rad, 0, Math.PI * 2);
      c.fillStyle = alpha(PAL.orange, 0.06);
      c.fill();
      c.strokeStyle = alpha(i % 2 ? PAL.hi : PAL.cream, 0.35);
      c.lineWidth = 1.5;
      c.stroke();
    }
  },

  waves(c, w, h, r) {
    for (let row = 0; row < 34; row++) {
      const y0 = (h * row) / 33;
      const amp = 10 + r() * 22;
      const freq = 0.004 + r() * 0.002;
      const phase = row * 0.35;
      c.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const y = y0 + Math.sin(x * freq + phase) * amp;
        x === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
      }
      c.strokeStyle = alpha(row % 5 === 0 ? PAL.hi : PAL.orange, 0.15 + (row / 34) * 0.5);
      c.lineWidth = 1.4;
      c.stroke();
    }
  },

  hub(c, w, h, r) {
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) * 0.42;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + r() * 0.2;
      const x = cx + Math.cos(a) * R;
      const y = cy + Math.sin(a) * R;
      c.beginPath();
      c.moveTo(cx, cy);
      c.lineTo(x, y);
      c.strokeStyle = alpha(PAL.orange, 0.5);
      c.lineWidth = 1.5;
      c.stroke();
      dot(c, x, y, 10 + r() * 8, i % 3 ? PAL.cream : PAL.hi);
    }
    dot(c, cx, cy, Math.min(w, h) * 0.07, PAL.orange);
  },

  ladder(c, w, h) {
    for (let i = 0; i < 12; i++) {
      const y = h - (i * h) / 12.5 - h * 0.08;
      const x0 = w * (0.18 + i * 0.035);
      c.fillStyle = alpha(i % 4 === 3 ? PAL.hi : PAL.orange, 0.35 + i * 0.04);
      c.fillRect(x0, y, w * 0.8 - (x0 - w * 0.18), h * 0.018);
    }
  },

  tiers(c, w, h) {
    for (let i = 0; i < 5; i++) {
      const bw = w * (0.82 - i * 0.14);
      c.fillStyle = i === 0 ? PAL.navy3 : alpha(i % 2 ? PAL.orange : PAL.hi, 0.25 + i * 0.12);
      c.beginPath();
      c.roundRect((w - bw) / 2, h * 0.22 + i * h * 0.13, bw, h * 0.085, 6);
      c.fill();
    }
  },

  falling(c, w, h, r) {
    for (let i = 0; i < 46; i++) {
      const x = r() * w;
      const y = r() * h * 0.6;
      const len = 30 + r() * h * 0.35;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + 6, y + len);
      c.strokeStyle = alpha(r() > 0.8 ? PAL.hi : PAL.orange, 0.2 + r() * 0.5);
      c.lineWidth = 1 + r() * 2;
      c.stroke();
    }
  },

  rising(c, w, h, r) {
    const n = 30;
    const bw = (w * 0.8) / n;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const bh = h * (0.08 + 0.74 * Math.pow(t, 1.6) * (0.7 + 0.3 * r()));
      c.fillStyle = alpha(t > 0.7 ? PAL.hi : PAL.orange, 0.25 + t * 0.6);
      c.fillRect(w * 0.1 + i * bw, h - bh - h * 0.06, bw * 0.7, bh);
    }
  },

  layers(c, w, h) {
    for (let i = 0; i < 6; i++) {
      c.beginPath();
      c.roundRect(w * 0.18 + i * w * 0.07, h * 0.2 + i * h * 0.1, w * 0.5, h * 0.22, 14);
      c.fillStyle = alpha(i % 2 ? PAL.orange : PAL.navy3, 0.35 + i * 0.09);
      c.fill();
      c.strokeStyle = alpha(PAL.hi, 0.4);
      c.lineWidth = 1;
      c.stroke();
    }
  },

  bolt(c, w, h) {
    const pts = [
      [0.55, 0.02], [0.38, 0.45], [0.56, 0.47], [0.36, 0.98], [0.66, 0.5], [0.48, 0.48], [0.62, 0.02],
    ];
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x * w, y * h) : c.moveTo(x * w, y * h)));
    c.shadowColor = PAL.orange;
    c.shadowBlur = 30;
    c.strokeStyle = PAL.hi;
    c.lineWidth = 4;
    c.stroke();
    c.shadowBlur = 0;
  },

  stars(c, w, h, r) {
    for (let i = 0; i < 180; i++) {
      dot(c, r() * w, r() * h, r() * 1.9 + 0.3, alpha(PAL.cream, 0.2 + r() * 0.7));
    }
    for (let i = 0; i < 6; i++) {
      const x = r() * w;
      const y = r() * h;
      const s = 10 + r() * 16;
      c.strokeStyle = alpha(PAL.hi, 0.7);
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(x - s, y);
      c.lineTo(x + s, y);
      c.moveTo(x, y - s);
      c.lineTo(x, y + s);
      c.stroke();
    }
  },

  ecg(c, w, h) {
    c.beginPath();
    const base = h * 0.5;
    c.moveTo(0, base);
    for (let x = 0; x < w; x += w / 9) {
      c.lineTo(x + w * 0.03, base);
      c.lineTo(x + w * 0.045, base - h * 0.06);
      c.lineTo(x + w * 0.06, base + h * 0.12);
      c.lineTo(x + w * 0.075, base - h * 0.28);
      c.lineTo(x + w * 0.09, base);
    }
    c.lineTo(w, base);
    c.strokeStyle = PAL.orange;
    c.lineWidth = 3;
    c.shadowColor = PAL.orange;
    c.shadowBlur = 16;
    c.stroke();
    c.shadowBlur = 0;
  },
  chips(c, w, h, r) {
    const cols = 6;
    const rows = 4;
    const cw = w * 0.11;
    const ch = h * 0.14;
    const gx = (w - cols * cw) / (cols + 1);
    const gy = (h - rows * ch) / (rows + 1);
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) {
        const x = gx + i * (cw + gx);
        const y = gy + j * (ch + gy);
        const hot = r() < 0.3;
        c.strokeStyle = alpha(PAL.orange, 0.35);
        c.lineWidth = 1;
        for (let k = 1; k < 4; k++) {
          c.beginPath();
          c.moveTo(x + (k * cw) / 4, y - 6);
          c.lineTo(x + (k * cw) / 4, y);
          c.moveTo(x + (k * cw) / 4, y + ch);
          c.lineTo(x + (k * cw) / 4, y + ch + 6);
          c.stroke();
        }
        if (hot) {
          c.shadowColor = PAL.orange;
          c.shadowBlur = 18;
        }
        c.fillStyle = hot ? alpha(PAL.orange, 0.85) : 'rgba(20,15,38,0.95)';
        c.strokeStyle = hot ? PAL.hi : PAL.orange;
        c.lineWidth = 1.5;
        c.beginPath();
        c.roundRect(x, y, cw, ch, 4);
        c.fill();
        c.stroke();
        c.shadowBlur = 0;
      }
  },

  fork(c, w, h) {
    const cx = w * 0.5;
    const y0 = h * 0.9;
    c.shadowColor = PAL.orange;
    c.shadowBlur = 16;
    c.strokeStyle = PAL.hi;
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(cx, y0);
    c.lineTo(cx, h * 0.55);
    c.stroke();
    c.shadowBlur = 0;
    const arms: [number, string][] = [
      [-1, PAL.orange],
      [1, 'rgba(255,210,168,0.9)'],
    ];
    for (const [d, col] of arms) {
      c.strokeStyle = col;
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(cx, h * 0.55);
      c.bezierCurveTo(cx, h * 0.4, cx + d * w * 0.22, h * 0.45, cx + d * w * 0.22, h * 0.3);
      c.stroke();
      for (let k = 0; k < 4; k++) {
        const y = h * (0.24 - k * 0.055);
        const bw = w * 0.2;
        c.fillStyle = k === 0 ? col : alpha(PAL.orange, 0.5 - k * 0.1);
        c.beginPath();
        c.roundRect(cx + d * w * 0.22 - bw / 2, y - h * 0.02, bw, h * 0.04, 4);
        c.fill();
      }
    }
  },
};

export const MOTIF_NAMES = Object.keys(motifs);

function background(c: CanvasRenderingContext2D, w: number, h: number) {
  c.fillStyle = PAL.navy;
  c.fillRect(0, 0, w, h);
  const g = c.createRadialGradient(w * 0.7, h * 0.35, 0, w * 0.7, h * 0.35, Math.max(w, h) * 0.7);
  g.addColorStop(0, alpha(PAL.orange, 0.28));
  g.addColorStop(0.5, alpha(PAL.navy3, 0.5));
  g.addColorStop(1, PAL.navy);
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
}

/** Draws a motif into a canvas that is already sized to its CSS box. */
export function drawArt(canvas: HTMLCanvasElement, motif: string | null, seed: string): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const c = canvas.getContext('2d');
  if (!c) return;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, w, h);
  background(c, w, h);
  const draw = (motif && motifs[motif]) || motifs.network;
  c.save();
  draw(c, w, h, rng(seed + (motif ?? '')));
  c.restore();
}
