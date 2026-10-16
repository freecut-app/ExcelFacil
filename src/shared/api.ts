// Contrato da API exposta pelo preload (window.api). Tudo passa por IPC validado.

import type { WorkbookJSON } from '../core/model';
import type { ImportReport } from '../core/io/xlsx';
import type { RecoveryData } from '../core/persist';

export type FileKind = 'xlsx' | 'csv';

export interface OpenResult {
  ok: true;
  path: string;
  name: string;
  kind: FileKind;
  workbook: WorkbookJSON;
  report: ImportReport;
}

export interface Failure {
  ok: false;
  canceled?: boolean;
  message?: string;
}

export interface RecentFile {
  path: string;
  name: string;
  openedAt: string;
  exists: boolean;
}

export interface RecoveryInfo {
  docId: string;
  title: string;
  filePath: string | null;
  savedAt: string;
}

export interface Settings {
  autosaveSeconds: number; // intervalo do salvamento de recuperação
  uiScale: 'normal' | 'grande';
  defaultZoom: number;
  showWelcomeTips: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  autosaveSeconds: 30,
  uiScale: 'normal',
  defaultZoom: 100,
  showWelcomeTips: true,
};

export interface PdfOptions {
  landscape: boolean;
}

export interface ExcelFacilApi {
  platform: string;
  version: string;
  isTest: boolean;

  openFile(path?: string): Promise<OpenResult | Failure>;
  saveDialog(suggestedName: string, kind: 'xlsx' | 'csv' | 'pdf' | 'png'): Promise<{ ok: true; path: string } | Failure>;
  saveXlsx(path: string, workbook: WorkbookJSON): Promise<{ ok: true; path: string; name: string } | Failure>;
  saveText(path: string, text: string): Promise<{ ok: true } | Failure>;
  savePng(path: string, dataUrl: string): Promise<{ ok: true } | Failure>;
  exportPdf(path: string, html: string, opts: PdfOptions): Promise<{ ok: true } | Failure>;
  print(html: string, opts: PdfOptions): Promise<{ ok: true } | Failure>;
  showInFolder(path: string): Promise<void>;

  recentList(): Promise<RecentFile[]>;
  recentRemove(path: string): Promise<void>;
  recentClear(): Promise<void>;

  recoverySave(data: RecoveryData): Promise<{ ok: true } | Failure>;
  recoveryList(): Promise<RecoveryInfo[]>;
  recoveryLoad(docId: string): Promise<RecoveryData | null>;
  recoveryDelete(docId: string): Promise<void>;

  settingsGet(): Promise<Settings>;
  settingsSet(s: Partial<Settings>): Promise<Settings>;

  clipboardWrite(text: string, html?: string): Promise<void>;
  clipboardRead(): Promise<string>;

  setDirty(dirty: boolean, title: string): void;
  confirmClose(): void;
  onCloseRequested(cb: () => void): () => void;
  onOpenPath(cb: (path: string) => void): () => void;
}

declare global {
  interface Window {
    api: ExcelFacilApi;
  }
}
