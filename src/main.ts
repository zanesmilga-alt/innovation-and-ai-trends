import './styles.css';
import { mountApp } from './app';
import { mountLanding } from './landing';

const root = document.getElementById('app');
if (!root) throw new Error('#app missing');

const path = location.pathname.replace(/\/+$/, '') || '/';

if (path === '/explore') {
  void mountApp(root, 'explore');
} else if (path === '/stage') {
  void mountApp(root, 'stage');
} else {
  mountLanding(root);
}
