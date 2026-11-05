// Renders build/icon.svg to build/icon.png, build/icon.icns (macOS only) and build/icon.ico.
// Run with: npm run icons
const { app, BrowserWindow } = require('electron');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const buildDir = path.join(__dirname, '..', 'build');

function ico(pngs) {
  // ICO container with embedded PNG images (supported since Windows Vista).
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + i * 16;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.data)]);
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(buildDir, 'icon.svg'), 'utf8');
  const win = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    transparent: true,
    frame: false,
    useContentSize: true,
    webPreferences: { offscreen: true },
  });
  const html = `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', '<svg width="1024" height="1024" ')}</body></html>`;
  await win.loadURL('data:text/html;base64,' + Buffer.from(html).toString('base64'));
  await new Promise((r) => setTimeout(r, 300));
  const image = (await win.capturePage({ x: 0, y: 0, width: 1024, height: 1024 })).resize({
    width: 1024,
    height: 1024,
  });
  const png = (size) => image.resize({ width: size, height: size, quality: 'best' }).toPNG();

  fs.writeFileSync(path.join(buildDir, 'icon.png'), png(1024));
  fs.writeFileSync(
    path.join(buildDir, 'icon.ico'),
    ico([16, 24, 32, 48, 64, 128, 256].map((size) => ({ size, data: png(size) }))),
  );

  if (process.platform === 'darwin') {
    const set = fs.mkdtempSync(path.join(os.tmpdir(), 'icon-')) + '/icon.iconset';
    fs.mkdirSync(set);
    for (const s of [16, 32, 128, 256, 512]) {
      fs.writeFileSync(path.join(set, `icon_${s}x${s}.png`), png(s));
      fs.writeFileSync(path.join(set, `icon_${s}x${s}@2x.png`), png(s * 2));
    }
    execFileSync('iconutil', ['-c', 'icns', set, '-o', path.join(buildDir, 'icon.icns')]);
  }
  app.quit();
});
