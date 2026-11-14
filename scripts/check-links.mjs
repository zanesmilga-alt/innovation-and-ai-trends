// Opens every source link in public/signals.json and lists the ones that do not answer.
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('../public/signals.json', import.meta.url), 'utf8'));
const jobs = [];
for (const t of data.signals) for (const l of t.links ?? []) jobs.push({ n: t.n, trend: t.short, url: l.url });

const agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36';
const test = async (url) => {
  try {
    const r = await fetch(url, { redirect: 'follow', headers: { 'user-agent': agent }, signal: AbortSignal.timeout(20000) });
    return r.status;
  } catch {
    return 0;
  }
};

const bad = [];
let done = 0;
const worker = async () => {
  while (jobs.length) {
    const j = jobs.shift();
    const status = await test(j.url);
    done += 1;
    process.stdout.write(`\rChecked ${done}`);
    if (status !== 200) bad.push({ ...j, status });
  }
};
await Promise.all(Array.from({ length: 8 }, worker));

console.log(`\n\n${done - bad.length} links answered. ${bad.length} need a look:\n`);
bad.sort((a, b) => a.n - b.n);
for (const x of bad) {
  const why = x.status === 0 ? 'no answer' : x.status === 404 ? 'page not found' : x.status === 403 ? 'blocks robots (probably fine, open it by hand)' : `code ${x.status}`;
  console.log(`Trend ${x.n} (${x.trend}) - ${why}\n  ${x.url}\n`);
}
