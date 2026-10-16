// Executado pelo Electron: desenha o SVG em vários tamanhos.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const root = path.resolve(__dirname, '..');
  const svg = fs.readFileSync(path.join(root, 'build', 'icon.svg'), 'utf8');
  const win = new BrowserWindow({ show: false, width: 600, height: 600, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html,<html><body style="margin:0;background:transparent"></body></html>');
  const sizes = [16, 24, 32, 48, 64, 128, 256, 512];
  for (const s of sizes) {
    const dataUrl = await win.webContents.executeJavaScript(`new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = ${s}; c.height = ${s};
        const ctx = c.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, ${s}, ${s});
        res(c.toDataURL('image/png'));
      };
      img.src = 'data:image/svg+xml;base64,' + ${JSON.stringify(Buffer.from(svg).toString('base64'))};
    })`);
    const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
    fs.writeFileSync(path.join(root, 'build', s === 512 ? 'icon.png' : `icon-${s}.png`), buf);
  }
  app.quit();
});
