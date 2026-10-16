// Ponte segura entre a interface e o processo principal.
// Só funções específicas são expostas; nenhum acesso direto a Node ou ao sistema de arquivos.
import { contextBridge, ipcRenderer } from 'electron';
import type { ExcelFacilApi } from '../src/shared/api';

const inv = (ch: string, ...args: unknown[]) => ipcRenderer.invoke(ch, ...args);

const api: ExcelFacilApi = {
  platform: process.platform,
  version: process.env.EXCELFACIL_VERSION ?? '1.0.0',
  isTest: process.env.EXCELFACIL_TEST === '1',

  openFile: (p) => inv('file:open', p),
  saveDialog: (name, kind) => inv('file:saveDialog', name, kind),
  saveXlsx: (p, wb) => inv('file:saveXlsx', p, wb),
  saveText: (p, t) => inv('file:saveText', p, t),
  savePng: (p, d) => inv('file:savePng', p, d),
  exportPdf: (p, html, o) => inv('file:exportPdf', p, html, o),
  print: (html, o) => inv('print:run', html, o),
  showInFolder: (p) => inv('file:showInFolder', p),

  recentList: () => inv('recent:list'),
  recentRemove: (p) => inv('recent:remove', p),
  recentClear: () => inv('recent:clear'),

  recoverySave: (d) => inv('recovery:save', d),
  recoveryList: () => inv('recovery:list'),
  recoveryLoad: (id) => inv('recovery:load', id),
  recoveryDelete: (id) => inv('recovery:delete', id),

  settingsGet: () => inv('settings:get'),
  settingsSet: (s) => inv('settings:set', s),

  clipboardWrite: (t, h) => inv('clipboard:write', t, h),
  clipboardRead: () => inv('clipboard:read'),

  setDirty: (d, title) => ipcRenderer.send('app:setDirty', d, title),
  confirmClose: () => ipcRenderer.send('app:confirmClose'),
  onCloseRequested: (cb) => {
    const l = () => cb();
    ipcRenderer.on('app:closeRequested', l);
    return () => ipcRenderer.removeListener('app:closeRequested', l);
  },
  onOpenPath: (cb) => {
    const l = (_e: unknown, p: string) => cb(p);
    ipcRenderer.on('app:openPath', l);
    return () => ipcRenderer.removeListener('app:openPath', l);
  },
};

contextBridge.exposeInMainWorld('api', api);
