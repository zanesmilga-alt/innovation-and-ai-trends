import './styles.css';
import { mountApp } from './app';
import { mountLanding } from './landing';
import { mountPhone } from './phone';
import { mountOverview } from './overview';

const root = document.getElementById('app');
if (!root) throw new Error('#app missing');

// After a new deploy, open pages reload themselves so phones and the stage run the same version.
let build: string | null = null;
const checkBuild = async () => {
  try {
    const stamp = await (await fetch('/version.txt', { cache: 'no-store' })).text();
    const typing = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement;
    if (build && stamp !== build && !typing) location.reload();
    build = stamp;
  } catch {
    /* offline for a moment: try again later */
  }
};
void checkBuild();
window.setInterval(checkBuild, 30_000);

const path = location.pathname.replace(/\/+$/, '') || '/';
const join = path.match(/^\/join(?:\/([^/]+))?$/);

// On the stage and phone pages the brand link would leave the room, so it does nothing there.
if (path === '/stage' || join) {
  document.querySelector<HTMLAnchorElement>('.brand')?.addEventListener('click', (e) => e.preventDefault());
}

if (path === '/overview') {
  void mountOverview(root);
} else if (path === '/explore') {
  void mountApp(root, 'explore');
} else if (path === '/stage') {
  void mountApp(root, 'stage');
} else if (join) {
  void mountPhone(root, join[1] ?? null);
} else {
  mountLanding(root);
}
