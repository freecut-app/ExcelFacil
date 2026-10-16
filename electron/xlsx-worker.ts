// Worker que lê e grava arquivos fora da thread principal.
import { parentPort } from 'node:worker_threads';
import { csvToSheet } from '../src/core/io/csv';
import { readXlsx, writeXlsx } from '../src/core/io/xlsx';
import type { WorkbookJSON } from '../src/core/model';

type Msg =
  | { op: 'read'; data: ArrayBuffer }
  | { op: 'write'; workbook: WorkbookJSON }
  | { op: 'csv'; text: string; name: string };

parentPort!.once('message', async (m: Msg) => {
  try {
    if (m.op === 'read') {
      const result = await readXlsx(new Uint8Array(m.data));
      parentPort!.postMessage({ ok: true, result });
    } else if (m.op === 'write') {
      const bytes = await writeXlsx(m.workbook);
      parentPort!.postMessage({ ok: true, result: bytes }, [bytes.buffer as ArrayBuffer]);
    } else if (m.op === 'csv') {
      const { sheet, delimiter, rows } = csvToSheet(m.text, m.name);
      const warnings: string[] = [];
      if (rows > 1_048_576) throw new Error('O CSV tem mais linhas do que o limite de uma planilha (1.048.576).');
      parentPort!.postMessage({
        ok: true,
        result: {
          workbook: { format: 'excel-facil', version: 1, activeSheet: 0, sheets: [sheet] },
          report: { warnings, unsupported: true, cells: sheet.cells.length, delimiter },
        },
      });
    }
  } catch (e) {
    parentPort!.postMessage({ ok: false, message: (e as Error).message });
  }
});
