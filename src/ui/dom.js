// Small DOM helpers. Text always goes in as text nodes or textContent, never as HTML.
import { copyText } from './copy.js';

export function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

export const table = (headers, rows) => el('table', { className: 'tlrsvp-table' },
  el('thead', {}, el('tr', {}, ...headers.map(h => el('th', { textContent: h })))),
  el('tbody', {}, ...rows.map(r => el('tr', {}, ...r.map(c => el('td', { textContent: c }))))));

// Only ever given SVG built by lineChart, which escapes its labels.
export function chart(svg) {
  const node = el('div', { className: 'tlrsvp-chart' });
  node.innerHTML = svg;
  return node;
}

export function copyButton(getText) {
  const button = el('button', { className: 'tlrsvp-copy', textContent: 'Copy' });
  button.onclick = async () => {
    button.textContent = (await copyText(getText())) ? 'Copied!' : 'Select and copy manually';
    setTimeout(() => { button.textContent = 'Copy'; }, 1500);
  };
  return button;
}
