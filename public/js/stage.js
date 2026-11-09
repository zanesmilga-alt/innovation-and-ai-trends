import { newRoomCode, joinUrl, ROOM_CODE_RE } from "./room.js";

const DESIGN_W = 1920;
const DESIGN_H = 1080;
const stage = document.getElementById("stage");

// Scale the 1920x1080 design to fit any window, letterboxed.
function fitToScreen() {
  const s = Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H);
  stage.style.setProperty("--s", s.toFixed(4));
}

// The code stays the same on reload (sessionStorage), or can be passed as ?room=CODE.
function roomCode() {
  const params = new URLSearchParams(location.search).get("room");
  const fromUrl = params ? params.toUpperCase() : "";
  if (ROOM_CODE_RE.test(fromUrl)) {
    sessionStorage.setItem("sr-room", fromUrl);
    return fromUrl;
  }
  const saved = sessionStorage.getItem("sr-room");
  if (saved && ROOM_CODE_RE.test(saved)) return saved;
  const fresh = newRoomCode();
  sessionStorage.setItem("sr-room", fresh);
  return fresh;
}

// Draws the QR as plain SVG squares so it stays sharp at any size.
function qrSvg(text) {
  if (typeof qrcode !== "function") return null;
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
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="QR code to join room">
    <rect width="${size}" height="${size}" fill="#F2F1EC"/>
    <path transform="translate(${quiet} ${quiet})" d="${d}" fill="#080C1E" shape-rendering="crispEdges"/>
  </svg>`;
}

// Design preview only: ?joined=18 shows a fake count so the layout can be tested at 3 or 30 people.
// Replaced by the live count in Phase 2.
function renderCount(n) {
  document.getElementById("count-num").textContent = String(n);
  document.getElementById("count-label").textContent =
    n === 0 ? "Waiting for people to scan" : n === 1 ? "person joined" : "people joined";
}

fitToScreen();
window.addEventListener("resize", fitToScreen);

const code = roomCode();
const url = joinUrl(code);
document.getElementById("room-code").textContent = code;
// Below the QR: the plain address, for anyone whose camera can't read the code.
const joinLine = document.getElementById("join-url");
joinLine.textContent = "or go to ";
const host = document.createElement("b");
host.textContent = location.host;
joinLine.append(host);

const qr = qrSvg(url);
document.getElementById("qr").innerHTML =
  qr ?? '<p style="font-size:28px;color:#4B5173">QR code needs the internet in this preview.</p>';

const joined = Number(new URLSearchParams(location.search).get("joined"));
renderCount(Number.isFinite(joined) && joined >= 0 ? joined : 0);
