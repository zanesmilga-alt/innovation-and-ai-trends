// Helpers shared by the stage and the phone. No server yet: codes and IDs are made in the browser.

// Room codes avoid I, L, O, 0 and 1, which are easy to misread from a projector.
export const ROOM_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/;

export function newRoomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => ROOM_ALPHABET[b % ROOM_ALPHABET.length]).join("");
}

export function joinUrl(code) {
  return `${location.origin}/join/${code}`;
}

// Random anonymous ID, kept in localStorage on the phone. No login, no personal data.
const ID_KEY = "sr-participant";

export function getAnonymousId() {
  let id = localStorage.getItem(ID_KEY);
  if (!id) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(ID_KEY, id);
  }
  return id;
}
