// Ciclo de vida do documento: novo, abrir, salvar, salvar como, recuperação e fechar.

import { keyCol, keyRow } from '../../core/address';
import { WorkbookJSON } from '../../core/model';
import { RecoveryData, prepareForSave } from '../../core/persist';
import { createFromTemplate } from '../../core/templates';
import { Workbook } from '../../core/workbook';
import { sheetToCSV } from '../../core/io/csv';
import { OpenResult } from '../../shared/api';
import { alertMsg, choose } from '../dialogs';
import { cellSel, currentSheet, emptyMeta, getState, isDirty, setState, toast } from '../store';
import { commitEdit } from './editing';

let unsubscribeWb: (() => void) | null = null;
let autosaveTimer: ReturnType<typeof setInterval> | null = null;
let lastRecoveryRev = -1;

function newDocId(): string {
  return crypto.randomUUID().toLowerCase();
}

function stripExt(name: string): string {
  return name.replace(/\.(xlsx|xlsm|csv|txt)$/i, '');
}

export function windowTitle(): string {
  const s = getState();
  if (s.screen !== 'editor') return 'Excel Fácil';
  return `${isDirty(s) ? '• ' : ''}${s.meta.fileName} — Excel Fácil`;
}

export function syncDirty(): void {
  window.api?.setDirty(isDirty(), windowTitle());
}

/** Coloca uma pasta de trabalho no editor. */
function attach(wb: Workbook, meta: Partial<ReturnType<typeof emptyMeta>>, active = 0, markDirty = false): void {
  unsubscribeWb?.();
  unsubscribeWb = wb.onChange(() => {
    setState({ rev: wb.rev });
    syncDirty();
  });
  const m = { ...emptyMeta(), docId: newDocId(), ...meta };
  m.savedRev = markDirty ? -1 : wb.rev;
  lastRecoveryRev = wb.rev;
  setState({
    screen: 'editor',
    wb,
    rev: wb.rev,
    meta: m,
    active: Math.max(0, Math.min(active, wb.sheets.length - 1)),
    sel: cellSel(0, 0),
    selBySheet: {},
    editing: null,
    clip: null,
    panel: null,
    fileMenu: false,
    zoom: getState().settings.defaultZoom,
    formulaError: null,
  });
  // Seleciona a primeira célula vazia útil em modelos (abaixo do cabeçalho).
  startAutosave();
  syncDirty();
}

/** Pergunta o que fazer com alterações não salvas. Devolve false se a pessoa cancelar. */
export async function ensureSavedOrDiscarded(action = 'continuar'): Promise<boolean> {
  if (!commitEdit('none')) return false;
  if (!isDirty()) return true;
  const key = await choose({
    title: 'Salvar as alterações?',
    message: (
      <>
        A planilha <b>{getState().meta.fileName}</b> tem alterações que ainda não foram salvas. O que você quer fazer antes de {action}?
      </>
    ),
    icon: 'warn',
    choices: [
      { key: 'cancel', label: 'Cancelar' },
      { key: 'discard', label: 'Não salvar', kind: 'normal' },
      { key: 'save', label: 'Salvar', kind: 'primary' },
    ],
  });
  if (key === 'cancel') return false;
  if (key === 'save') return await save();
  // Descartar: remove a cópia de recuperação.
  const id = getState().meta.docId;
  if (id) await window.api.recoveryDelete(id);
  return true;
}

export async function newDocument(templateId = 'blank'): Promise<void> {
  if (getState().screen === 'editor' && !(await ensureSavedOrDiscarded('criar uma nova planilha'))) return;
  const wb = createFromTemplate(templateId);
  const names: Record<string, string> = {
    blank: 'Nova planilha',
    gastos: 'Controle de gastos',
    vendas: 'Controle de vendas',
    clientes: 'Lista de clientes',
    estoque: 'Controle de estoque',
    orcamento: 'Orçamento mensal',
  };
  attach(wb, { fileName: names[templateId] ?? 'Nova planilha', kind: 'new' });
  if (templateId !== 'blank') {
    const sh = currentSheet()!;
    const r = sh.freezeRows || 1;
    setState({ sel: cellSel(r, 0) });
  }
}

export async function openFile(path?: string): Promise<void> {
  if (getState().screen === 'editor' && !(await ensureSavedOrDiscarded('abrir outro arquivo'))) return;
  setState({ busy: 'Abrindo o arquivo…' });
  let res;
  try {
    res = await window.api.openFile(path);
  } finally {
    setState({ busy: null });
  }
  if (!res.ok) {
    if (!res.canceled) await alertMsg('Não foi possível abrir', res.message ?? 'Erro desconhecido.', 'warn');
    return;
  }
  await loadOpenResult(res);
}

export async function loadOpenResult(res: OpenResult): Promise<void> {
  let wb: Workbook;
  try {
    wb = Workbook.fromJSON(res.workbook);
  } catch {
    await alertMsg('Não foi possível abrir', 'O conteúdo do arquivo não pôde ser interpretado.', 'warn');
    return;
  }
  const warnings = [...res.report.warnings];
  // Funções que o motor não conhece: o último valor salvo é mantido.
  let unsupported = 0;
  for (const s of wb.sheets) for (const [k, c] of s.cells) if (c.f != null && wb.engine.isUnsupported(s, keyRow(k), keyCol(k))) unsupported++;
  if (unsupported) {
    warnings.push(
      `${unsupported} fórmula(s) usam funções que o Excel Fácil ainda não calcula. O último resultado salvo no arquivo foi mantido, mas não será atualizado.`,
    );
  }
  attach(
    wb,
    {
      filePath: res.path,
      fileName: res.kind === 'csv' ? stripExt(res.name) : res.name,
      kind: res.kind,
      needsSaveAs: res.kind === 'csv' || res.report.unsupported || unsupported > 0,
      warnings,
    },
    res.workbook.activeSheet,
  );
  if (warnings.length) setState({ panel: { type: 'warnings' } });
  else toast(`"${res.name}" aberto.`, 'success');
}

export async function recoverDocument(docId: string): Promise<void> {
  const d = await window.api.recoveryLoad(docId);
  if (!d) {
    await alertMsg('Não foi possível recuperar', 'A cópia de recuperação não foi encontrada ou está danificada.', 'warn');
    return;
  }
  let wb: Workbook;
  try {
    wb = Workbook.fromJSON(d.workbook as WorkbookJSON);
  } catch {
    await alertMsg('Não foi possível recuperar', 'A cópia de recuperação está danificada.', 'warn');
    return;
  }
  attach(
    wb,
    {
      docId: d.docId,
      filePath: d.filePath,
      fileName: d.title,
      kind: d.filePath && /\.xlsx$/i.test(d.filePath) ? 'xlsx' : 'new',
      // Por segurança, uma recuperação nunca grava por cima do arquivo sem perguntar.
      overwriteConfirmed: false,
    },
    d.workbook.activeSheet,
    true,
  );
  toast('Alterações recuperadas. Salve para guardar no arquivo.', 'success', 5000);
}

function suggestedName(): string {
  return stripExt(getState().meta.fileName);
}

/** Salvar (Ctrl+S). Nunca sobrescreve um arquivo de outro programa sem perguntar. */
export async function save(): Promise<boolean> {
  if (!commitEdit('none')) return false;
  const s = getState();
  if (!s.wb) return false;
  const m = s.meta;
  if (!m.filePath || m.kind === 'csv' || !/\.xlsx$/i.test(m.filePath)) return saveAs();
  if (m.needsSaveAs && !m.overwriteConfirmed) {
    const key = await choose({
      title: 'Salvar uma cópia?',
      icon: 'warn',
      message: (
        <>
          Este arquivo tem recursos que o Excel Fácil não consegue manter (veja a lista em <b>Avisos do arquivo</b>). Se você salvar por cima do
          original, eles serão perdidos. Recomendamos salvar uma cópia.
        </>
      ),
      choices: [
        { key: 'cancel', label: 'Cancelar' },
        { key: 'overwrite', label: 'Substituir o original', kind: 'danger' },
        { key: 'copy', label: 'Salvar uma cópia', kind: 'primary' },
      ],
    });
    if (key === 'cancel') return false;
    if (key === 'copy') return saveAs();
  } else if (m.kind === 'xlsx' && !m.overwriteConfirmed && m.lastSavedAt === null) {
    const key = await choose({
      title: 'Salvar por cima do arquivo original?',
      message: (
        <>
          Você está salvando <b>{m.fileName}</b>, que foi aberto do computador. O arquivo original será substituído (uma cópia de segurança
          fica guardada pelo Excel Fácil).
        </>
      ),
      choices: [
        { key: 'cancel', label: 'Cancelar' },
        { key: 'copy', label: 'Salvar uma cópia' },
        { key: 'overwrite', label: 'Salvar por cima', kind: 'primary' },
      ],
    });
    if (key === 'cancel') return false;
    if (key === 'copy') return saveAs();
  }
  setState((st) => ({ meta: { ...st.meta, overwriteConfirmed: true } }));
  return writeTo(m.filePath);
}

export async function saveAs(): Promise<boolean> {
  if (!commitEdit('none')) return false;
  if (!getState().wb) return false;
  const r = await window.api.saveDialog(suggestedName(), 'xlsx');
  if (!r.ok) return false;
  const ok = await writeTo(r.path);
  if (ok) setState((st) => ({ meta: { ...st.meta, needsSaveAs: false, overwriteConfirmed: true, kind: 'xlsx' } }));
  return ok;
}

async function writeTo(path: string): Promise<boolean> {
  const s = getState();
  const wb = s.wb!;
  const rev = wb.rev;
  setState((st) => ({ meta: { ...st.meta, saving: true, saveError: null } }));
  const json = prepareForSave(wb, s.active);
  const r = await window.api.saveXlsx(path, json);
  if (!r.ok) {
    setState((st) => ({ meta: { ...st.meta, saving: false, saveError: r.message ?? 'Erro ao salvar.' } }));
    await alertMsg('Não foi possível salvar', r.message ?? 'Erro desconhecido.', 'warn');
    return false;
  }
  setState((st) => ({
    meta: { ...st.meta, saving: false, filePath: r.path, fileName: r.name, kind: 'xlsx', savedRev: rev, lastSavedAt: Date.now(), saveError: null },
  }));
  await window.api.recoveryDelete(getState().meta.docId);
  lastRecoveryRev = rev;
  syncDirty();
  toast('Planilha salva.', 'success', 2000);
  return true;
}

export async function exportCsv(): Promise<void> {
  if (!commitEdit('none')) return;
  const s = getState();
  const sh = currentSheet();
  if (!s.wb || !sh) return;
  const r = await window.api.saveDialog(`${suggestedName()} - ${sh.name}`, 'csv');
  if (!r.ok) return;
  const res = await window.api.saveText(r.path, sheetToCSV(s.wb, sh));
  if (res.ok) {
    toast(s.wb.sheets.length > 1 ? `Aba "${sh.name}" exportada como CSV (o CSV guarda só uma aba).` : 'Exportado como CSV.', 'success', 4500);
  } else await alertMsg('Não foi possível exportar', res.message, 'warn');
}

export async function closeDocument(): Promise<void> {
  if (!(await ensureSavedOrDiscarded('fechar'))) return;
  const id = getState().meta.docId;
  stopAutosave();
  if (id && !isDirty()) await window.api.recoveryDelete(id);
  unsubscribeWb?.();
  unsubscribeWb = null;
  setState({ screen: 'home', wb: null, meta: emptyMeta(), editing: null, panel: null, fileMenu: false, clip: null });
  syncDirty();
}

// ---------------- recuperação automática ----------------

export async function writeRecovery(force = false): Promise<void> {
  const s = getState();
  if (!s.wb || s.screen !== 'editor') return;
  if (!force && (s.wb.rev === lastRecoveryRev || !isDirty(s))) return;
  const rev = s.wb.rev;
  const data: RecoveryData = {
    format: 'excel-facil-recovery',
    version: 1,
    docId: s.meta.docId,
    title: s.meta.fileName,
    filePath: s.meta.filePath,
    savedAt: new Date().toISOString(),
    workbook: s.wb.toJSON(s.active),
  };
  const r = await window.api.recoverySave(data);
  if (r.ok) {
    lastRecoveryRev = rev;
    setState((st) => ({ meta: { ...st.meta, recoveryAt: Date.now() } }));
  }
}

export function startAutosave(): void {
  stopAutosave();
  const sec = getState().settings.autosaveSeconds;
  autosaveTimer = setInterval(() => void writeRecovery(), sec * 1000);
}

export function stopAutosave(): void {
  if (autosaveTimer) clearInterval(autosaveTimer);
  autosaveTimer = null;
}

/** Fechar a janela: pergunta se quer salvar. */
export async function handleCloseRequest(): Promise<void> {
  if (getState().screen === 'editor' && !(await ensureSavedOrDiscarded('sair'))) return;
  window.api.confirmClose();
}
