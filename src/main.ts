import './styles.css';
import { mountApp } from './app';
import { mountLanding } from './landing';
import { mountPhone } from './phone';

const root = document.getElementById('app');
if (!root) throw new Error('#app missing');

const path = location.pathname.replace(/\/+$/, '') || '/';
const join = path.match(/^\/join(?:\/([^/]+))?$/);

if (path === '/explore') {
  void mountApp(root, 'explore');
} else if (path === '/stage') {
  void mountApp(root, 'stage');
} else if (join) {
  void mountPhone(root, join[1] ?? null);
} else {
  mountLanding(root);
}
