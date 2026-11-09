import { ROOM_CODE_RE, getAnonymousId } from "./room.js";

const $ = (id) => document.getElementById(id);
const NAME_KEY = "sr-name";

// The code comes from the QR link (/join/CODE or ?room=CODE). If there is none, the phone asks for it.
function codeFromLocation() {
  const fromPath = location.pathname.match(/^\/join\/([^/?#]+)/i)?.[1];
  const fromQuery = new URLSearchParams(location.search).get("room");
  const raw = (fromPath || fromQuery || "").toUpperCase();
  return ROOM_CODE_RE.test(raw) ? raw : null;
}

function showView(name) {
  $("view-join").hidden = name !== "join";
  $("view-in").hidden = name !== "in";
}

function showJoined(code, name) {
  $("room-chip").textContent = `Room ${code}`;
  $("in-title").textContent = name ? `You're in, ${name}` : "You're in";
  showView("in");
  $("in-title").focus();
}

let code = codeFromLocation();

if (code) {
  $("room-chip").textContent = `Room ${code}`;
  // Show the code big, so people can check they are joining the right room.
  $("code-big").textContent = code;
  $("code-block").hidden = false;
  if (localStorage.getItem(`sr-joined-${code}`)) {
    showJoined(code, localStorage.getItem(NAME_KEY) || "");
  }
} else {
  $("code-field").hidden = false;
  $("room-chip").textContent = "Room code";
}

$("code").addEventListener("input", (event) => {
  event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
});

$("join-form").addEventListener("submit", (event) => {
  event.preventDefault();
  $("error").textContent = "";

  let roomCode = code;
  if (!roomCode) {
    const typed = $("code").value.trim().toUpperCase();
    if (!ROOM_CODE_RE.test(typed)) {
      $("error").textContent = "Room codes have 4 letters or numbers. Check the code on the big screen.";
      return;
    }
    roomCode = typed;
  }

  const name = $("name").value.trim().slice(0, 20);
  getAnonymousId();
  if (name) localStorage.setItem(NAME_KEY, name);
  localStorage.setItem(`sr-joined-${roomCode}`, "1");
  code = roomCode;
  showJoined(roomCode, name);
});
