// Utilitário para abrir o aplicativo nos testes ponta a ponta.
import { _electron as electron } from 'playwright-core';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export async function launch({ userData, exe } = {}) {
  const env = { ...process.env, EXCELFACIL_TEST: '1', EXCELFACIL_SHOW: process.env.EXCELFACIL_HIDE ? '0' : '1', EXCELFACIL_USERDATA: userData ?? tempDir('ef-user-') };
  delete env.ELECTRON_RUN_AS_NODE;
  const opts = exe ? { executablePath: exe, args: [], env } : { args: [root], env };
  const app = await electron.launch({ ...opts, timeout: 60000 });
  // Garante que o aplicativo não fique aberto se o teste falhar no meio.
  const proc = app.process();
  const kill = () => {
    try {
      // No Windows, encerra a árvore inteira (janela, GPU, utilitários).
      if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
      else proc.kill();
    } catch {}
  };
  process.once('exit', kill);
  process.once('uncaughtException', (e) => {
    kill();
    console.error(e);
    process.exit(1);
  });
  process.once('unhandledRejection', (e) => {
    kill();
    console.error(e);
    process.exit(1);
  });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1366, height: 820 }).catch(() => {});
  await page.waitForSelector('[data-testid="home"]', { timeout: 30000 });
  return { app, page, userData: env.EXCELFACIL_USERDATA };
}

/** Substitui os diálogos nativos de abrir/salvar por respostas automáticas. */
export async function stubDialogs(app, { open, save } = {}) {
  await app.evaluate(({ dialog }, { open, save }) => {
    if (open !== undefined) dialog.showOpenDialog = async () => (open ? { canceled: false, filePaths: [open] } : { canceled: true, filePaths: [] });
    if (save !== undefined) dialog.showSaveDialog = async () => (save ? { canceled: false, filePath: save } : { canceled: true });
  }, { open, save });
}
