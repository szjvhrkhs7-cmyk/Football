const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const css = read('sections.css');

test('iPhone input focus does not trigger automatic page zoom in either screen or any sheet', () => {
  const dom = new JSDOM(html);
  const fields = [...dom.window.document.querySelectorAll('input, select, textarea')]
    .filter(field => !['hidden', 'checkbox', 'radio', 'file'].includes(field.type));
  // New fields must be covered by the same guard, regardless of which screen contains them.
  assert.deepEqual(fields.map(field => field.id).sort(), [
    'budgetInput', 'categoryEmoji', 'categoryName', 'categoryPicker',
    'cloudEmail', 'cloudPassword', 'expenseAmount', 'expenseDate', 'expenseTitle'
  ].sort());
  assert.match(css, /@media\s*\(hover:\s*none\)\s*and\s*\(pointer:\s*coarse\)/);
  assert.match(css, /input:not\(\[type="hidden"\]\):not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):not\(\[type="file"\]\),\s*select,\s*textarea\s*\{\s*font-size:\s*17px\s*!important;/);
  // Money and category symbols retain their original larger sizes.
  assert.match(css, /dialog\.designed-sheet \.money-input input\[type="number"\]\s*\{\s*font-size:\s*20px\s*!important;/);
  assert.match(css, /#categoryEmoji\s*\{\s*font-size:\s*22px\s*!important;/);
  dom.window.close();
});

test('double taps on the app and modal surfaces do not zoom, but pinch zoom remains available', () => {
  assert.match(css, /html,\s*body,\s*\.app,\s*dialog,\s*input,\s*select,\s*textarea\s*\{\s*touch-action:\s*manipulation;/);
  const viewport = new JSDOM(html).window.document.querySelector('meta[name="viewport"]').content;
  assert.match(viewport, /width=device-width/);
  assert.match(viewport, /initial-scale=1/);
  assert.doesNotMatch(viewport, /user-scalable=no|maximum-scale=1|minimum-scale=1/);
});

test('updated mobile style is versioned in both the page and offline shell', () => {
  const stylesheet = new JSDOM(html).window.document.querySelector('link[href^="./sections.css"]');
  assert.ok(stylesheet);
  const version = stylesheet.getAttribute('href').match(/\?v=([\d.]+)$/)?.[1];
  assert.ok(version);
  const worker = read('sw.js');
  assert.match(worker, new RegExp('pulse-v' + version.replace(/\./g, '\\.') + "'"));
  assert.ok(worker.includes("'./sections.css?v=" + version + "'"));
});

test('all editable fields have an unconditional Safari-safe text size in installed PWAs', () => {
  // Do not rely on hover/pointer media queries: standalone iOS PWAs can differ from Safari tabs.
  const block = css.split('/* Safari focus baseline: applies in browser and standalone PWA. */')[1];
  assert.ok(block, 'unconditional focus baseline exists at the end of the stylesheet');
  assert.match(block, /input:not\(\[type="hidden"\]\):not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):not\(\[type="file"\]\),\s*select,\s*textarea\s*\{\s*font-size:\s*max\(17px,\s*1rem\)\s*!important;/);
  assert.match(block, /dialog\.designed-sheet \.money-input input\[type="number"\]\s*\{\s*font-size:\s*20px\s*!important;/);
  assert.match(block, /#categoryEmoji\s*\{\s*font-size:\s*22px\s*!important;/);
});

test('sheet opening does not leave a CSS transform on a dialog containing focused text', () => {
  const animations = read('light.css');
  assert.match(animations, /@keyframes sheet-in\s*\{\s*from\s*\{\s*opacity:\s*0\.6\s*\}\s*to\s*\{\s*opacity:\s*1\s*\}\s*\}/);
  assert.match(animations, /@keyframes pulse-sheet-enter\s*\{\s*from\s*\{\s*opacity:\s*0\s*\}\s*to\s*\{\s*opacity:\s*1\s*\}\s*\}/);
});
