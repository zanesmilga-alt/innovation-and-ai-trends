// Copies the start page to the addresses that need their own page. Works on Windows and Mac.
import { copyFileSync, mkdirSync } from 'node:fs';

const dist = 'dist';
copyFileSync(`${dist}/index.html`, `${dist}/404.html`);
for (const dir of ['explore', 'stage']) {
  mkdirSync(`${dist}/${dir}`, { recursive: true });
  copyFileSync(`${dist}/index.html`, `${dist}/${dir}/index.html`);
}
console.log('post-build: pages copied');
