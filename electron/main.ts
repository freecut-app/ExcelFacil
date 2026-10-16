// Processo principal do Excel Fácil.
// Segurança: contextIsolation + sandbox, sem nodeIntegration, sem páginas remotas,
// IPC validado (remetente, tipos e caminhos), nenhuma telemetria.

import { app, BrowserWindow, clipboard, ClipboardItem, dialog, ipcMain, IpcMainInvokeEvent, Menu, session, shell, WebContents } from 'electron';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { RecoveryData } from '../src/core/persist';
import { DEFAULT_SETTINGS, RecentFile, RecoveryInfo, Settings } from '../src/shared/api';

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const IS_TEST = process.env.EXCELFACIL_TEST === '1';
const MAX_FILE_BYTES = 150 * 1024 * 1024;
const MAX_TEXT_BYTES = 200 * 1024 * 1024;

if (process.env.EXCELFACIL_USERDATA) app.setPath('userData', process.env.EXCELFACIL_USERDATA);

// Uma única instância: abrir de novo traz a janela para frente.
if (!IS_TEST && !app.requestSingleInstanceLock()) {
  app.quit();
}

const dataDir = () => app.getPath('userData');
const recoveryDir = () => path.join(dataDir(), 'recuperacao');
const backupDir = () => path.join(dataDir(), 'backups');
const tmpDir = () => path.join(dataDir(), 'tmp');
const recentFile = () => path.join(dataDir(), 'recentes.json');
const settingsFile = () => path.join(dataDir(), 'configuracoes.json');

let win: BrowserWindow | null = null;
let dirty = false;
let allowClose = false;
const granted = new Set<string>(); // caminhos que a pessoa escolheu (diálogo, recentes, linha de comando)

// ---------------- utilidades de arquivo ----------------

function normPath(p: unknown): string | null {
  if (typeof p !== 'string' || p.length === 0 || p.length > 1024 || p.includes('\0')) return null;
  if (!path.isAbsolute(p)) return null;
  return path.normalize(p);
}

function keyOf(p: string): string {
  return process.platform === 'win32' ? p.toLowerCase() : p;
}

function grant(p: string): void {
  granted.add(keyOf(p));
}

function isGranted(p: string): boolean {
  return granted.has(keyOf(p));
}

function extOk(p: string, exts: string[]): boolean {
  return exts.includes(path.extname(p).toLowerCase());
}

/** Escrita atômica: grava num temporário na mesma pasta e troca de nome. */
async function atomicWrite(target: string, data: Uint8Array | string): Promise<void> {
  const dir = path.dirname(target);
  const tmp = path.join(dir, `.${path.basename(target)}.${randomBytes(4).toString('hex')}.tmp`);
  const fh = await fsp.open(tmp, 'w');
  try {
    await fh.writeFile(data);
    await fh.sync();
  } finally {
    await fh.close();
  }
  try {
    await fsp.rename(tmp, target);
  } catch (e) {
    await fsp.rm(tmp, { force: true });
    throw e;
  }
}

function friendlyFsError(e: unknown): string {
  const code = (e as NodeJS.ErrnoException)?.code;
  switch (code) {
    case 'EBUSY':
    case 'EPERM':
      return 'O arquivo está aberto em outro programa (por exemplo, o Excel) ou é somente leitura. Feche-o e tente de novo, ou use "Salvar como".';
    case 'EACCES':
      return 'Sem permissão para gravar nessa pasta. Escolha outra pasta com "Salvar como".';
    case 'ENOSPC':
      return 'Não há espaço livre no disco.';
    case 'ENOENT':
      return 'O arquivo ou a pasta não foi encontrado. Ele pode ter sido movido ou apagado.';
    default:
      return 'Não foi possível concluir a operação com o arquivo.';
  }
}

async function backupExisting(target: string): Promise<void> {
  try {
    const st = await fsp.stat(target);
    if (!st.isFile()) return;
    await fsp.mkdir(backupDir(), { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const name = `${path.basename(target, path.extname(target))}__${stamp}${path.extname(target)}`;
    await fsp.copyFile(target, path.join(backupDir(), name));
    // Mantém só os 30 backups mais recentes.
    const files = (await fsp.readdir(backupDir())).map((f) => path.join(backupDir(), f));
    const stats = await Promise.all(files.map(async (f) => ({ f, t: (await fsp.stat(f)).mtimeMs })));
    stats.sort((a, b) => b.t - a.t);
    for (const old of stats.slice(30)) await fsp.rm(old.f, { force: true });
  } catch {
    // backup é melhor esforço
  }
}

function runWorker<T>(msg: unknown, transfer: ArrayBuffer[] = []): Promise<T> {
  return new Promise((resolve, reject) => {
    const w = new Worker(path.join(__dirname, 'xlsx-worker.js'), { resourceLimits: { maxOldGenerationSizeMb: 3072 } });
    let done = false;
    w.once('message', (m: { ok: boolean; result?: T; message?: string }) => {
      done = true;
      void w.terminate();
      if (m.ok) resolve(m.result as T);
      else reject(new Error(m.message || 'Erro ao processar o arquivo.'));
    });
    w.once('error', (e) => {
      done = true;
      reject(new Error(/memory|heap/i.test(String(e)) ? 'O arquivo é grande demais para a memória disponível.' : String(e.message || e)));
    });
    w.once('exit', (code) => {
      if (!done && code !== 0) reject(new Error('O processamento do arquivo foi interrompido.'));
    });
    w.postMessage(msg, transfer);
  });
}

// ---------------- JSON de dados do app ----------------

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await atomicWrite(file, JSON.stringify(data, null, 1));
}

async function getSettings(): Promise<Settings> {
  const s = await readJson<Partial<Settings>>(settingsFile(), {});
  return { ...DEFAULT_SETTINGS, ...s };
}

function sanitizeSettings(s: unknown): Partial<Settings> {
  const out: Partial<Settings> = {};
  if (!s || typeof s !== 'object') return out;
  const o = s as Record<string, unknown>;
  if (typeof o.autosaveSeconds === 'number' && o.autosaveSeconds >= 10 && o.autosaveSeconds <= 600) out.autosaveSeconds = Math.round(o.autosaveSeconds);
  if (o.uiScale === 'normal' || o.uiScale === 'grande') out.uiScale = o.uiScale;
  if (typeof o.defaultZoom === 'number' && o.defaultZoom >= 50 && o.defaultZoom <= 200) out.defaultZoom = Math.round(o.defaultZoom);
  if (typeof o.showWelcomeTips === 'boolean') out.showWelcomeTips = o.showWelcomeTips;
  return out;
}

interface RecentEntry {
  path: string;
  name: string;
  openedAt: string;
}

async function getRecent(): Promise<RecentEntry[]> {
  const list = await readJson<RecentEntry[]>(recentFile(), []);
  return Array.isArray(list) ? list.filter((e) => e && typeof e.path === 'string' && normPath(e.path)) : [];
}

async function addRecent(p: string): Promise<void> {
  const list = (await getRecent()).filter((e) => keyOf(e.path) !== keyOf(p));
  list.unshift({ path: p, name: path.basename(p), openedAt: new Date().toISOString() });
  await writeJson(recentFile(), list.slice(0, 15));
}

// ---------------- IPC ----------------

function trustedSender(e: IpcMainInvokeEvent | Electron.IpcMainEvent): boolean {
  const url = e.senderFrame?.url ?? '';
  if (!win || e.sender !== win.webContents) return false;
  if (DEV_URL) return url.startsWith(DEV_URL);
  return url.startsWith('file://');
}

function handle(channel: string, fn: (e: IpcMainInvokeEvent, ...args: unknown[]) => unknown): void {
  ipcMain.handle(channel, async (e, ...args) => {
    if (!trustedSender(e)) throw new Error('Remetente não autorizado');
    return fn(e, ...args);
  });
}

const DOC_ID_RE = /^[a-z0-9-]{8,64}$/;

function registerIpc(): void {
  handle('file:open', async (_e, maybePath) => {
    let p: string | null = null;
    if (maybePath !== undefined) {
      p = normPath(maybePath);
      if (!p) return { ok: false, message: 'Caminho inválido.' };
      const recent = await getRecent();
      if (!isGranted(p) && !recent.some((r) => keyOf(r.path) === keyOf(p!))) return { ok: false, message: 'Este arquivo precisa ser escolhido pela janela "Abrir".' };
    } else {
      const r = await dialog.showOpenDialog(win!, {
        title: 'Abrir planilha',
        properties: ['openFile'],
        filters: [
          { name: 'Planilhas (*.xlsx, *.xlsm, *.csv)', extensions: ['xlsx', 'xlsm', 'csv', 'txt'] },
          { name: 'Todos os arquivos', extensions: ['*'] },
        ],
      });
      if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };
      p = path.normalize(r.filePaths[0]);
    }
    grant(p);
    try {
      const st = await fsp.stat(p);
      if (!st.isFile()) return { ok: false, message: 'Isto não é um arquivo.' };
      if (st.size > MAX_FILE_BYTES) return { ok: false, message: 'O arquivo é grande demais (mais de 150 MB).' };
      const ext = path.extname(p).toLowerCase();
      if (ext === '.xls') return { ok: false, message: 'Arquivos .xls (Excel 97-2003) não são suportados. Abra no Excel e salve como .xlsx.' };
      const buf = await fsp.readFile(p);
      const isZip = buf[0] === 0x50 && buf[1] === 0x4b;
      if (ext === '.csv' || ext === '.txt' || (!isZip && ext !== '.xlsx' && ext !== '.xlsm')) {
        const text = decodeText(buf);
        const result = await runWorker<{ workbook: unknown; report: unknown }>({ op: 'csv', text, name: path.basename(p, ext).slice(0, 31) || 'Planilha1' });
        await addRecent(p);
        return { ok: true, path: p, name: path.basename(p), kind: 'csv', ...result };
      }
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      const result = await runWorker<{ workbook: unknown; report: { warnings: string[]; unsupported: boolean } }>({ op: 'read', data: ab }, [ab]);
      if (ext === '.xlsm') {
        result.report.unsupported = true;
        if (!result.report.warnings.some((w) => w.includes('macro'))) result.report.warnings.unshift('Este é um arquivo com macros (.xlsm). As macros NÃO são executadas.');
      }
      await addRecent(p);
      return { ok: true, path: p, name: path.basename(p), kind: 'xlsx', ...result };
    } catch (err) {
      const m = (err as Error).message;
      return { ok: false, message: (err as NodeJS.ErrnoException).code ? friendlyFsError(err) : m };
    }
  });

  handle('file:saveDialog', async (_e, suggested, kind) => {
    const k = String(kind);
    const filters: Record<string, Electron.FileFilter> = {
      xlsx: { name: 'Pasta de trabalho do Excel (*.xlsx)', extensions: ['xlsx'] },
      csv: { name: 'CSV separado por ponto e vírgula (*.csv)', extensions: ['csv'] },
      pdf: { name: 'Documento PDF (*.pdf)', extensions: ['pdf'] },
      png: { name: 'Imagem PNG (*.png)', extensions: ['png'] },
    };
    if (!filters[k]) return { ok: false, message: 'Tipo inválido.' };
    const base = String(suggested ?? 'Planilha').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120) || 'Planilha';
    const r = await dialog.showSaveDialog(win!, {
      title: 'Salvar',
      defaultPath: path.join(app.getPath('documents'), base.endsWith('.' + k) ? base : `${base}.${k}`),
      filters: [filters[k]],
    });
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    let p = path.normalize(r.filePath);
    if (path.extname(p).toLowerCase() !== '.' + k) p += '.' + k;
    grant(p);
    return { ok: true, path: p };
  });

  handle('file:saveXlsx', async (_e, p0, workbook) => {
    const p = normPath(p0);
    if (!p || !isGranted(p) || !extOk(p, ['.xlsx'])) return { ok: false, message: 'Local de gravação não autorizado. Use "Salvar como".' };
    if (!workbook || typeof workbook !== 'object' || (workbook as { format?: string }).format !== 'excel-facil') return { ok: false, message: 'Dados inválidos.' };
    try {
      const bytes = await runWorker<Uint8Array>({ op: 'write', workbook });
      await backupExisting(p);
      await atomicWrite(p, bytes);
      await addRecent(p);
      return { ok: true, path: p, name: path.basename(p) };
    } catch (err) {
      return { ok: false, message: (err as NodeJS.ErrnoException).code ? friendlyFsError(err) : (err as Error).message };
    }
  });

  handle('file:saveText', async (_e, p0, text) => {
    const p = normPath(p0);
    if (!p || !isGranted(p) || !extOk(p, ['.csv', '.txt'])) return { ok: false, message: 'Local de gravação não autorizado.' };
    if (typeof text !== 'string' || text.length > MAX_TEXT_BYTES) return { ok: false, message: 'Dados inválidos.' };
    try {
      await atomicWrite(p, text);
      return { ok: true };
    } catch (err) {
      return { ok: false, message: friendlyFsError(err) };
    }
  });

  handle('file:savePng', async (_e, p0, dataUrl) => {
    const p = normPath(p0);
    if (!p || !isGranted(p) || !extOk(p, ['.png'])) return { ok: false, message: 'Local de gravação não autorizado.' };
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,') || dataUrl.length > 50_000_000) return { ok: false, message: 'Imagem inválida.' };
    try {
      await atomicWrite(p, Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64'));
      return { ok: true };
    } catch (err) {
      return { ok: false, message: friendlyFsError(err) };
    }
  });

  handle('file:exportPdf', async (_e, p0, html, opts) => {
    const p = normPath(p0);
    if (!p || !isGranted(p) || !extOk(p, ['.pdf'])) return { ok: false, message: 'Local de gravação não autorizado.' };
    if (typeof html !== 'string' || html.length > MAX_TEXT_BYTES) return { ok: false, message: 'Dados inválidos.' };
    const landscape = !!(opts as { landscape?: boolean })?.landscape;
    try {
      const pw = await loadPrintWindow(html);
      try {
        const pdf = await pw.webContents.printToPDF({ landscape, pageSize: 'A4', printBackground: true, preferCSSPageSize: true });
        await atomicWrite(p, pdf);
      } finally {
        pw.destroy();
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, message: (err as NodeJS.ErrnoException).code ? friendlyFsError(err) : 'Não foi possível gerar o PDF.' };
    }
  });

  handle('print:run', async (_e, html, opts) => {
    if (typeof html !== 'string' || html.length > MAX_TEXT_BYTES) return { ok: false, message: 'Dados inválidos.' };
    const landscape = !!(opts as { landscape?: boolean })?.landscape;
    const pw = await loadPrintWindow(html);
    return new Promise((resolve) => {
      pw.webContents.print({ silent: false, printBackground: true, landscape }, (success, reason) => {
        pw.destroy();
        if (success) resolve({ ok: true });
        else if (reason === 'cancelled' || reason === 'Print job canceled') resolve({ ok: false, canceled: true });
        else resolve({ ok: false, message: 'A impressão não foi concluída. Verifique se há uma impressora instalada.' });
      });
    });
  });

  handle('file:showInFolder', async (_e, p0) => {
    const p = normPath(p0);
    if (p && fs.existsSync(p)) shell.showItemInFolder(p);
  });

  handle('recent:list', async (): Promise<RecentFile[]> => {
    const list = await getRecent();
    return list.map((r) => ({ ...r, exists: fs.existsSync(r.path) }));
  });
  handle('recent:remove', async (_e, p0) => {
    const p = normPath(p0);
    if (!p) return;
    await writeJson(recentFile(), (await getRecent()).filter((r) => keyOf(r.path) !== keyOf(p)));
  });
  handle('recent:clear', async () => writeJson(recentFile(), []));

  handle('recovery:save', async (_e, data) => {
    const d = data as RecoveryData;
    if (!d || d.format !== 'excel-facil-recovery' || typeof d.docId !== 'string' || !DOC_ID_RE.test(d.docId)) return { ok: false, message: 'Dados inválidos.' };
    try {
      await fsp.mkdir(recoveryDir(), { recursive: true });
      await atomicWrite(path.join(recoveryDir(), d.docId + '.json'), JSON.stringify(d));
      return { ok: true };
    } catch (err) {
      return { ok: false, message: friendlyFsError(err) };
    }
  });
  handle('recovery:list', async (): Promise<RecoveryInfo[]> => {
    try {
      const files = (await fsp.readdir(recoveryDir())).filter((f) => f.endsWith('.json'));
      const out: RecoveryInfo[] = [];
      for (const f of files) {
        const d = await readJson<RecoveryData | null>(path.join(recoveryDir(), f), null);
        if (d && d.format === 'excel-facil-recovery') out.push({ docId: d.docId, title: d.title, filePath: d.filePath, savedAt: d.savedAt });
      }
      return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    } catch {
      return [];
    }
  });
  handle('recovery:load', async (_e, id) => {
    if (typeof id !== 'string' || !DOC_ID_RE.test(id)) return null;
    const d = await readJson<RecoveryData | null>(path.join(recoveryDir(), id + '.json'), null);
    if (d?.filePath) {
      const p = normPath(d.filePath);
      if (p) grant(p);
    }
    return d;
  });
  handle('recovery:delete', async (_e, id) => {
    if (typeof id !== 'string' || !DOC_ID_RE.test(id)) return;
    await fsp.rm(path.join(recoveryDir(), id + '.json'), { force: true });
  });

  handle('settings:get', async () => getSettings());
  handle('settings:set', async (_e, s) => {
    const next = { ...(await getSettings()), ...sanitizeSettings(s) };
    await writeJson(settingsFile(), next);
    return next;
  });

  handle('clipboard:write', async (_e, text, html) => {
    if (typeof text !== 'string' || text.length > MAX_TEXT_BYTES) return;
    if (typeof html === 'string' && html.length < MAX_TEXT_BYTES) {
      await clipboard.write([new ClipboardItem({ 'text/plain': text, 'text/html': html })]);
    } else await clipboard.writeText(text);
  });
  handle('clipboard:read', async () => clipboard.readText());

  ipcMain.on('app:setDirty', (e, d, title) => {
    if (!trustedSender(e)) return;
    dirty = !!d;
    if (win && typeof title === 'string') win.setTitle(title.slice(0, 200));
    if (win) win.setDocumentEdited(dirty);
  });
  ipcMain.on('app:confirmClose', (e) => {
    if (!trustedSender(e)) return;
    allowClose = true;
    win?.close();
  });
}

function decodeText(buf: Buffer): string {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString('utf8');
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

async function loadPrintWindow(html: string): Promise<BrowserWindow> {
  await fsp.mkdir(tmpDir(), { recursive: true });
  const file = path.join(tmpDir(), `impressao-${randomBytes(6).toString('hex')}.html`);
  await fsp.writeFile(file, html, 'utf8');
  const pw = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false, webSecurity: true },
  });
  pw.on('closed', () => void fsp.rm(file, { force: true }));
  await pw.loadURL(pathToFileURL(file).toString());
  return pw;
}

// ---------------- janela ----------------

function hardenContents(contents: WebContents): void {
  contents.on('will-navigate', (e, url) => {
    const ok = DEV_URL ? url.startsWith(DEV_URL) : false;
    if (!ok) e.preventDefault();
  });
  contents.on('will-redirect', (e) => e.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-attach-webview', (e) => e.preventDefault());
}

async function createWindow(): Promise<void> {
  const state = await readJson<{ width?: number; height?: number; maximized?: boolean }>(path.join(dataDir(), 'janela.json'), {});
  win = new BrowserWindow({
    width: state.width ?? 1280,
    height: state.height ?? 800,
    minWidth: 760,
    minHeight: 520,
    show: false,
    title: 'Excel Fácil',
    backgroundColor: '#f8faf9',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      devTools: !app.isPackaged,
      backgroundThrottling: !IS_TEST,
    },
  });
  if (state.maximized && !IS_TEST) win.maximize();
  win.once('ready-to-show', () => {
    if (!IS_TEST || process.env.EXCELFACIL_SHOW === '1') win?.show();
  });

  win.on('close', (e) => {
    if (win && !win.isDestroyed()) {
      const b = win.getNormalBounds();
      try {
        fs.mkdirSync(dataDir(), { recursive: true });
        fs.writeFileSync(path.join(dataDir(), 'janela.json'), JSON.stringify({ width: b.width, height: b.height, maximized: win.isMaximized() }));
      } catch {
        /* ignorar */
      }
    }
    if (dirty && !allowClose) {
      e.preventDefault();
      win?.webContents.send('app:closeRequested');
    }
  });
  win.on('closed', () => {
    win = null;
  });

  if (DEV_URL) await win.loadURL(DEV_URL);
  else await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  const fileArg = process.argv.slice(1).find((a) => /\.(xlsx|xlsm|csv)$/i.test(a) && fs.existsSync(a));
  if (fileArg) {
    const p = path.normalize(path.resolve(fileArg));
    grant(p);
    win.webContents.once('did-finish-load', () => win?.webContents.send('app:openPath', p));
    if (!win.webContents.isLoading()) win.webContents.send('app:openPath', p);
  }
}

app.on('second-instance', (_e, argv) => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
  const fileArg = argv.slice(1).find((a) => /\.(xlsx|xlsm|csv)$/i.test(a) && fs.existsSync(a));
  if (fileArg) {
    const p = path.normalize(path.resolve(fileArg));
    grant(p);
    win.webContents.send('app:openPath', p);
  }
});

app.on('web-contents-created', (_e, contents) => hardenContents(contents));

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  // Bloqueia qualquer acesso à rede (o aplicativo é 100% offline).
  session.defaultSession.webRequest.onBeforeRequest((details, cb) => {
    const u = details.url;
    const local = u.startsWith('file://') || u.startsWith('devtools://') || u.startsWith('data:') || u.startsWith('blob:') || (DEV_URL && (u.startsWith(DEV_URL) || u.startsWith(DEV_URL.replace('http', 'ws'))));
    cb({ cancel: !local });
  });
  registerIpc();
  // Limpa arquivos temporários antigos de impressão.
  await fsp.rm(tmpDir(), { recursive: true, force: true }).catch(() => undefined);
  await createWindow();
});

app.on('window-all-closed', () => app.quit());
