import "../styles/tokens.css";
import "../styles/base.css";
import "./join.css";
import { ROOM_CODE_RE, getAnonymousId } from "../../shared/room";

const NAME_KEY = "sr-name";

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
}

// The code comes from the QR link (/join?room=CODE, or /join/CODE). If there is none, the phone asks for it.
function codeFromLocation(): string | null {
  const fromPath = location.pathname.match(/^\/join\/([^/?#]+)/i)?.[1];
  const fromQuery = new URLSearchParams(location.search).get("room");
  const raw = (fromPath ?? fromQuery ?? "").toUpperCase();
  return ROOM_CODE_RE.test(raw) ? raw : null;
}

function showView(name: "join" | "in"): void {
  byId("view-join").hidden = name !== "join";
  byId("view-in").hidden = name !== "in";
}

function showJoined(code: string, name: string): void {
  byId("room-chip").textContent = `Room ${code}`;
  byId("in-title").textContent = name ? `You're in, ${name}` : "You're in";
  showView("in");
  byId("in-title").focus();
}

let code = codeFromLocation();

if (code) {
  byId("room-chip").textContent = `Room ${code}`;
  // Show the code big, so people can check they are joining the right room.
  byId("code-big").textContent = code;
  byId("code-block").hidden = false;
  if (localStorage.getItem(`sr-joined-${code}`)) {
    showJoined(code, localStorage.getItem(NAME_KEY) ?? "");
  }
} else {
  byId("code-field").hidden = false;
  byId("room-chip").textContent = "Room code";
}

const codeInput = byId<HTMLInputElement>("code");
codeInput.addEventListener("input", () => {
  codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
});

byId<HTMLFormElement>("join-form").addEventListener("submit", (event) => {
  event.preventDefault();
  byId("error").textContent = "";

  let roomCode = code;
  if (!roomCode) {
    const typed = codeInput.value.trim().toUpperCase();
    if (!ROOM_CODE_RE.test(typed)) {
      byId("error").textContent = "Room codes have 4 letters or numbers. Check the code on the big screen.";
      return;
    }
    roomCode = typed;
  }

  const name = byId<HTMLInputElement>("name").value.trim().slice(0, 20);
  getAnonymousId();
  if (name) localStorage.setItem(NAME_KEY, name);
  localStorage.setItem(`sr-joined-${roomCode}`, "1");
  code = roomCode;
  showJoined(roomCode, name);
});
