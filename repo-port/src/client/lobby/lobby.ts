import "./lobby.css";
import { joinUrl } from "../../shared/room";

// The QR generator is a global, loaded by a script tag in stage.html.
interface QrCode {
  addData(data: string): void;
  make(): void;
  getModuleCount(): number;
  isDark(row: number, col: number): boolean;
}
declare function qrcode(typeNumber: number, errorCorrectionLevel: string): QrCode;

export interface LobbyHandle {
  el: HTMLElement;
  setCount(n: number): void;
}

// Draws the QR as plain SVG squares, so it stays sharp at any size.
function qrSvg(text: string): string {
  if (typeof qrcode !== "function") {
    return '<p class="lobby-fallback">The QR code needs the internet in this preview.</p>';
  }
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 2;
  const size = n + quiet * 2;
  let d = "";
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (qr.isDark(row, col)) d += `M${col} ${row}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="QR code to join the room">
    <rect width="${size}" height="${size}" fill="#F2F1EC"/>
    <path transform="translate(${quiet} ${quiet})" d="${d}" fill="#080C1E" shape-rendering="crispEdges"/>
  </svg>`;
}

// Design preview only: ?joined=18 shows a fake count, so the layout can be tested at 3 or 30 people.
// Replaced by the live count once the room server exists (Phase 2).
export function previewJoinedCount(): number {
  const n = Number(new URLSearchParams(location.search).get("joined"));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function renderLobby(code: string): LobbyHandle {
  const el = document.createElement("section");
  el.className = "lobby-screen";
  el.innerHTML = `
    <div class="lobby-bg" aria-hidden="true"></div>
    <div class="lobby-main">
      <div class="lobby-copy">
        <p class="lobby-kicker">Innovation In &amp; Out · 25 signals</p>
        <h1 class="lobby-title">Too Late<em>To Ignore</em></h1>
        <p class="lobby-pitch">AI is moving too fast to ignore, and too fast to catch up on later. <b>Staying current is part of the job.</b></p>
      </div>
      <aside class="lobby-card" aria-label="How to join">
        <div class="lobby-qr"></div>
        <p class="lobby-room-label">Room code</p>
        <p class="lobby-code"></p>
        <p class="lobby-url"></p>
      </aside>
    </div>
    <footer class="lobby-band">
      <div class="lobby-count" aria-live="polite">
        <span class="lobby-live" aria-hidden="true"></span>
        <span class="lobby-count-num">0</span>
        <span class="lobby-count-label">Waiting for people to scan</span>
      </div>
      <ol class="lobby-steps">
        <li><span>1</span>Scan the code</li>
        <li><span>2</span>Join with your name</li>
        <li><span>3</span>Vote for 3</li>
      </ol>
    </footer>`;

  const q = <T extends Element>(selector: string): T => {
    const node = el.querySelector<T>(selector);
    if (!node) throw new Error(`Missing ${selector}`);
    return node;
  };

  q<HTMLElement>(".lobby-qr").innerHTML = qrSvg(joinUrl(code));
  q<HTMLElement>(".lobby-code").textContent = code;
  q<HTMLElement>(".lobby-url").textContent = `or go to ${location.host}`;

  const count = q<HTMLElement>(".lobby-count-num");
  const label = q<HTMLElement>(".lobby-count-label");
  const setCount = (n: number): void => {
    count.textContent = String(n);
    label.textContent = n === 0 ? "Waiting for people to scan" : n === 1 ? "person joined" : "people joined";
  };
  setCount(0);

  return { el, setCount };
}
