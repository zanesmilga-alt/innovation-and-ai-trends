// Helpers shared by the stage and the phone. No server yet: codes and IDs are made in the browser.

// Room codes skip I, L, O, 0 and 1, which are easy to misread from a projector.
const ROOM_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/;

export function newRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => ROOM_ALPHABET[b % ROOM_ALPHABET.length]).join("");
}

// The code stays the same on reload (sessionStorage), or can be passed as ?room=CODE.
export function stageRoomCode(): string {
  const fromUrl = (new URLSearchParams(location.search).get("room") ?? "").toUpperCase();
  if (ROOM_CODE_RE.test(fromUrl)) {
    sessionStorage.setItem("sr-room", fromUrl);
    return fromUrl;
  }
  const saved = sessionStorage.getItem("sr-room") ?? "";
  if (ROOM_CODE_RE.test(saved)) return saved;
  const fresh = newRoomCode();
  sessionStorage.setItem("sr-room", fresh);
  return fresh;
}

// Phones join at /join?room=CODE. This works on static hosting; /join/CODE needs a Worker route (Phase 2).
export function joinUrl(code: string): string {
  return `${location.origin}/join?room=${code}`;
}

// Random anonymous ID, kept in localStorage on the phone. No login, no personal data.
const ID_KEY = "sr-participant";

export function getAnonymousId(): string {
  let id = localStorage.getItem(ID_KEY);
  if (!id) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(ID_KEY, id);
  }
  return id;
}
