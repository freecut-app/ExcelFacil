// Compila o processo principal, o preload e o worker com esbuild.
// O ExcelJS é embutido no bundle (assim o instalador não precisa de node_modules).
import { build, context } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const watch = process.argv.includes('--watch');
const stubUnzipper = {
  name: 'stub-unzipper',
  setup(b) {
    b.onResolve({ filter: /^unzipper$/ }, () => ({ path: path.resolve('electron/stubs/unzipper.js') }));
  },
};
const opts = {
  entryPoints: { main: 'electron/main.ts', preload: 'electron/preload.ts', 'xlsx-worker': 'electron/xlsx-worker.ts' },
  outdir: 'dist-electron',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  plugins: [stubUnzipper],
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  legalComments: 'linked',
  metafile: true,
  logLevel: 'info',
};

if (watch) {
  const ctx = await context(opts);
  await ctx.watch();
} else {
  const r = await build(opts);
  fs.writeFileSync('dist-electron/meta.json', JSON.stringify(r.metafile));
}
