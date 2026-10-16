// Modo desenvolvimento: Vite (interface com recarga automática) + esbuild em modo observação + Electron.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { context } from 'esbuild';
import { createServer } from 'vite';

const server = await createServer({ configFile: 'vite.config.mts' });
await server.listen();
const url = server.resolvedUrls.local[0];
console.log('Interface em', url);

const ctx = await context({
  entryPoints: { main: 'electron/main.ts', preload: 'electron/preload.ts', 'xlsx-worker': 'electron/xlsx-worker.ts' },
  outdir: 'dist-electron',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  plugins: [
    {
      name: 'stub-unzipper',
      setup(b) {
        b.onResolve({ filter: /^unzipper$/ }, () => ({ path: path.resolve('electron/stubs/unzipper.js') }));
      },
    },
  ],
  sourcemap: 'inline',
  logLevel: 'info',
});
await ctx.rebuild();
await ctx.watch();

const electron = (await import('electron')).default;
const child = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, VITE_DEV_SERVER_URL: url.replace(/\/$/, '') } });
child.on('exit', async (code) => {
  await ctx.dispose();
  await server.close();
  process.exit(code ?? 0);
});
