import "../styles/tokens.css";
import "../styles/base.css";
import "../styles/app.css";
import { startApp } from "../app";
import { previewJoinedCount, renderLobby } from "../lobby/lobby";
import { stageRoomCode } from "../../shared/room";

startApp("stage");

// The first view is the join screen (QR code, room code, live count).
// M opens the map, J returns to the join screen.
const lobby = renderLobby(stageRoomCode());
lobby.setCount(previewJoinedCount());
document.getElementById("canvas")?.append(lobby.el);

document.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === "m" || event.key === "M") lobby.el.hidden = true;
  if (event.key === "j" || event.key === "J") lobby.el.hidden = false;
});
