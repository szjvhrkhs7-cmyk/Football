const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
const worker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

test('iPhone and PWA icons are opaque PNGs at their declared sizes', () => {
  assert.match(html, /rel="apple-touch-icon"\s+sizes="180x180"\s+href="\.\/apple-touch-icon-v3\.png"/);
  const icons = [{ src: './apple-touch-icon-v3.png', sizes: '180x180' }, ...manifest.icons.filter(icon => icon.type === 'image/png')];
  assert.equal(icons.length, 3);
  for (const icon of icons) {
    const png = fs.readFileSync(path.join(root, icon.src));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
    assert.equal(png[25], 2, 'RGB PNG without an alpha channel');
    assert.ok(worker.includes(`'${icon.src}'`), `${icon.src} is cached offline`);
  }
});

test('header and installed icons use the approved light Impulse identity', () => {
  assert.match(html, /class="brandmark"/);
  const markup = new JSDOM(html).window.document;
  const mark = markup.querySelector('.brandmark > svg');
  assert.ok(mark, 'the header mark is inline so network/cache failures cannot hide it');
  assert.equal(markup.querySelector('.brandmark img'), null);
  const logo = fs.readFileSync(path.join(root, 'logo-mark.svg'), 'utf8');
  const original = new JSDOM(logo, { contentType: 'image/svg+xml' }).window.document;
  assert.equal(mark.getAttribute('viewBox'), original.querySelector('svg').getAttribute('viewBox'));
  assert.equal(mark.querySelector('g')?.getAttribute('fill'), original.querySelector('g')?.getAttribute('fill'));
  assert.equal(mark.querySelector('path')?.getAttribute('d'), original.querySelector('path')?.getAttribute('d'));
  assert.equal(mark.querySelectorAll('rect').length, original.querySelectorAll('rect').length);
  const sections = fs.readFileSync(path.join(root, 'sections.css'), 'utf8');
  assert.match(sections, /\.brandmark\s*>\s*svg\s*\{[^}]*stroke:\s*none;[^}]*\}/s);
  const icon = fs.readFileSync(path.join(root, 'icon.svg'), 'utf8');
  assert.match(logo, /fill="#eba47f"/);
  assert.match(icon, /fill="#faf8f4"/);
  const release = require('../package.json').version;
  assert.ok(worker.includes(`'./logo-mark.svg?v=${release}'`));
  for (const icon of manifest.icons) {
    assert.ok(fs.existsSync(path.join(root, icon.src.split('?')[0])));
    assert.ok(worker.includes(`'${icon.src}'`));
  }
  assert.match(html, /href="\.\/icon\.svg\?v=[0-9.]+"/);
});
