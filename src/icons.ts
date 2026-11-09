import { createElement, icons } from 'lucide';

type IconNode = Parameters<typeof createElement>[0];

/** Lucide names are kebab-case ("shield-check"); the package exports PascalCase ("ShieldCheck"). */
export function iconSvg(name: string): SVGElement {
  const pascal = name.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
  const table = icons as unknown as Record<string, IconNode>;
  const node = table[pascal] ?? table['Circle'];
  const el = createElement(node);
  el.setAttribute('aria-hidden', 'true');
  return el;
}
