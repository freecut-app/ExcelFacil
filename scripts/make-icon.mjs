// Gera build/icon.png (512) e build/icon.ico (16–256) a partir de build/icon.svg usando o Electron.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const electron = (await import('electron')).default;
const r = spawnSync(electron, [path.join(root, 'scripts', 'render-icon.cjs')], { stdio: 'inherit', cwd: root });
if (r.status !== 0) process.exit(r.status ?? 1);

// Monta o .ico com imagens PNG embutidas.
const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = sizes.map((s) => fs.readFileSync(path.join(root, 'build', `icon-${s}.png`)));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
const dir = Buffer.alloc(16 * sizes.length);
let offset = 6 + dir.length;
sizes.forEach((s, i) => {
  const b = i * 16;
  dir.writeUInt8(s >= 256 ? 0 : s, b);
  dir.writeUInt8(s >= 256 ? 0 : s, b + 1);
  dir.writeUInt8(0, b + 2);
  dir.writeUInt8(0, b + 3);
  dir.writeUInt16LE(1, b + 4);
  dir.writeUInt16LE(32, b + 6);
  dir.writeUInt32LE(pngs[i].length, b + 8);
  dir.writeUInt32LE(offset, b + 12);
  offset += pngs[i].length;
});
fs.writeFileSync(path.join(root, 'build', 'icon.ico'), Buffer.concat([header, dir, ...pngs]));
for (const s of sizes) fs.rmSync(path.join(root, 'build', `icon-${s}.png`));
console.log('Ícones gerados em build/');
