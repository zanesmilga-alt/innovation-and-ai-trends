import './styles.css';
import { mountApp } from './app';
import { mountLanding } from './landing';
import { mountPhone } from './phone';

const root = document.getElementById('app');
if (!root) throw new Error('#app missing');

const path = location.pathname.replace(/\/+$/, '') || '/';
const join = path.match(/^\/join(?:\/([^/]+))?$/);

// On the stage and phone pages the brand link would leave the room, so it does nothing there.
if (path === '/stage' || join) {
  document.querySelector<HTMLAnchorElement>('.brand')?.addEventListener('click', (e) => e.preventDefault());
}

if (path === '/explore') {
  void mountApp(root, 'explore');
} else if (path === '/stage') {
  void mountApp(root, 'stage');
} else if (join) {
  void mountPhone(root, join[1] ?? null);
} else {
  mountLanding(root);
}
