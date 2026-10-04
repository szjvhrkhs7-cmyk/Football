const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
const worker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

test('iPhone and PWA icons are opaque PNGs at their declared sizes', () => {
  assert.match(html, /rel="apple-touch-icon"\s+sizes="180x180"\s+href="\.\/apple-touch-icon-v2\.png"/);
  const icons = [{ src: './apple-touch-icon-v2.png', sizes: '180x180' }, ...manifest.icons.filter(icon => icon.type === 'image/png')];
  assert.equal(icons.length, 3);
  for (const icon of icons) {
    const png = fs.readFileSync(path.join(root, icon.src));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
    assert.equal(png[25], 2, 'RGB PNG without an alpha channel');
    assert.ok(worker.includes(`'${icon.src}'`), `${icon.src} is cached offline`);
  }
});

test('header uses the prototype waveform while installed app icons stay cached', () => {
  assert.match(html, /class="brandmark"/);
  assert.match(html, /M2 12h5l3-7 4 14 3-7h5/);
  for (const icon of manifest.icons) {
    assert.ok(fs.existsSync(path.join(root, icon.src.split('?')[0])));
    assert.ok(worker.includes(`'${icon.src}'`));
  }
  assert.match(html, /href="\.\/icon\.svg\?v=[0-9.]+"/);
});
