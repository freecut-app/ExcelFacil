// Teste ponta a ponta: o fluxo completo de uma pessoa que nunca usou o aplicativo,
// mais salvar/reabrir, abrir .xlsx externo, exportar, recuperação após queda e arquivo grande.
// Uso: npm run test:e2e   (ou EXCELFACIL_EXE=caminho\Excel Fácil.exe node tests/e2e/run.mjs)

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { launch, stubDialogs, tempDir } from './launch.mjs';

const EXE = process.env.EXCELFACIL_EXE || undefined;
const work = tempDir('ef-e2e-');
const userData = path.join(work, 'dados');
const results = [];
let failed = 0;

async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    results.push(`  ✔ ${name} (${Date.now() - t} ms)`);
    console.log(`  ✔ ${name} (${Date.now() - t} ms)`);
  } catch (e) {
    failed++;
    console.log(`  ✘ ${name}\n    ${e?.stack ?? e}`);
    const shot = path.join(work, 'falha.png');
    await page?.screenshot({ path: shot }).catch(() => {});
    console.log(`    captura: ${shot}`);
    throw e;
  }
}

const ef = (page, fn, ...args) => page.evaluate(([f, a]) => window.__ef[f](...a), [fn, args]);

async function clickCell(page, a1, opts = {}) {
  await ef(page, 'cellRect', a1); // rola até a célula
  await page.waitForTimeout(60);
  const r = await ef(page, 'cellRect', a1);
  const shift = opts.modifiers?.includes('Shift');
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.click(r.x + Math.min(20, r.w / 2), r.y + r.h / 2);
  if (shift) await page.keyboard.up('Shift');
}

async function typeIn(page, text) {
  await page.keyboard.type(text, { delay: 5 });
}

async function waitFor(page, fn, msg, timeout = 15000) {
  const t = Date.now();
  for (;;) {
    if (await fn()) return;
    if (Date.now() - t > timeout) throw new Error('Tempo esgotado: ' + msg);
    await page.waitForTimeout(100);
  }
}

console.log(`Pasta de teste: ${work}`);
const savedPath = path.join(work, 'Minha planilha.xlsx');

// ---------------------------------------------------------------- 1ª sessão
let { app, page } = await launch({ userData, exe: EXE });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await step('tela inicial mostra boas-vindas, modelos e recentes', async () => {
  assert.match(await page.textContent('[data-testid="home"]'), /Bem-vindo ao Excel Fácil/);
  for (const id of ['blank', 'gastos', 'vendas', 'clientes', 'estoque', 'orcamento']) assert.ok(await page.isVisible(`[data-testid="tpl-${id}"]`));
});

await step('criar nova planilha', async () => {
  await page.click('[data-testid="btn-new"]');
  await page.waitForSelector('[data-testid="editor"]');
});

await step('preencher dados digitando (com acentos e decimais brasileiros)', async () => {
  await clickCell(page, 'A1');
  await typeIn(page, 'Produto');
  await page.keyboard.press('Tab');
  await typeIn(page, 'Preço');
  await page.keyboard.press('Enter');
  await clickCell(page, 'A2');
  for (const [p, v] of [['Café', '10,50'], ['Açúcar', '20'], ['Pão', '30,25']]) {
    await typeIn(page, p);
    await page.keyboard.press('Tab');
    await typeIn(page, v);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Home');
  }
  assert.equal(await ef(page, 'value', 'A1'), 'Produto');
  assert.equal(await ef(page, 'value', 'B1'), 'Preço');
  assert.equal(await ef(page, 'value', 'A3'), 'Açúcar');
  assert.equal(await ef(page, 'value', 'B2'), 10.5);
  assert.equal(await ef(page, 'value', 'B4'), 30.25);
});

await step('aplicar formatação (negrito, cor de fundo, moeda)', async () => {
  await clickCell(page, 'A1');
  await clickCell(page, 'B1', { modifiers: ['Shift'] });
  await page.keyboard.press('Control+b');
  await page.click('[data-testid="btn-fill"]');
  await page.click('button[title="#d1fae5"]');
  assert.equal((await ef(page, 'style', 'A1')).b, true);
  assert.equal((await ef(page, 'style', 'B1')).fill, '#d1fae5');
  await clickCell(page, 'B2');
  await clickCell(page, 'B4', { modifiers: ['Shift'] });
  await page.click('[data-testid="btn-currency"]');
  assert.equal(await ef(page, 'shown', 'B2'), 'R$ 10,50');
});

await step('cálculo com um clique: Somar seleção com prévia e inserção', async () => {
  await page.click('[data-testid="tab-calculos"]');
  await page.click('[data-testid="calc-sum"]');
  await page.waitForSelector('[data-testid="quick-panel"]');
  assert.equal(await page.textContent('[data-testid="quick-result"]'), 'R$ 60,75');
  assert.equal(await page.inputValue('[data-testid="quick-target"]'), 'B5');
  await page.click('[data-testid="quick-insert"]');
  assert.equal(await ef(page, 'edit', 'B5'), '=SOMA(B2:B4)');
  assert.equal(await ef(page, 'shown', 'B5'), 'R$ 60,75');
});

await step('barra de status mostra soma e média da seleção', async () => {
  await clickCell(page, 'B2');
  await clickCell(page, 'B4', { modifiers: ['Shift'] });
  const t = await page.textContent('[data-testid="selection-stats"]');
  assert.match(t, /Soma: 60,75/);
  assert.match(t, /Média: 20,25/);
});

await step('fórmula digitada em português, referência por clique e recálculo', async () => {
  await clickCell(page, 'C2');
  await typeIn(page, '=');
  await clickCell(page, 'B2'); // modo de apontar
  await typeIn(page, '*2');
  await page.keyboard.press('Enter');
  assert.equal(await ef(page, 'edit', 'C2'), '=B2*2');
  assert.equal(await ef(page, 'value', 'C2'), 21);
  await clickCell(page, 'D2');
  await typeIn(page, '=SE(B2>15;"Alto";"Baixo")');
  await page.keyboard.press('Enter');
  assert.equal(await ef(page, 'value', 'D2'), 'Baixo');
  await clickCell(page, 'B2');
  await typeIn(page, '16');
  await page.keyboard.press('Enter');
  assert.equal(await ef(page, 'value', 'D2'), 'Alto');
  assert.equal(await ef(page, 'value', 'C2'), 32);
  assert.equal(await ef(page, 'value', 'B5'), 66.25);
});

await step('erro de fórmula é explicado e a edição continua', async () => {
  await clickCell(page, 'E2');
  await typeIn(page, '=1+*2');
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid="formula-error"]');
  await page.click('text=Desistir');
  assert.equal(await ef(page, 'value', 'E2'), null);
  await clickCell(page, 'E2');
  await typeIn(page, '=1/0');
  await page.keyboard.press('Enter');
  await clickCell(page, 'E2');
  assert.match(await page.textContent('[data-testid="cell-error-help"]'), /Divisão por zero/);
  await page.keyboard.press('Delete');
});

await step('copiar e colar ajusta a fórmula', async () => {
  await clickCell(page, 'C2');
  await page.keyboard.press('Control+c');
  await clickCell(page, 'C3');
  await clickCell(page, 'C4', { modifiers: ['Shift'] });
  await page.keyboard.press('Control+v');
  await waitFor(page, async () => (await ef(page, 'edit', 'C4')) === '=B4*2', 'colar');
  assert.equal(await ef(page, 'value', 'C4'), 60.5);
});

await step('desfazer e refazer', async () => {
  await page.keyboard.press('Control+z');
  assert.equal(await ef(page, 'value', 'C4'), null);
  await page.keyboard.press('Control+y');
  assert.equal(await ef(page, 'value', 'C4'), 60.5);
});

await step('ordenar pela coluna e manter o cabeçalho', async () => {
  await page.keyboard.press('Escape');
  await clickCell(page, 'A3');
  await page.click('[data-testid="tab-dados"]');
  await page.click('[data-testid="btn-sort-asc"]');
  assert.equal(await ef(page, 'value', 'A1'), 'Produto');
  assert.equal(await ef(page, 'value', 'A2'), 'Açúcar');
  assert.equal(await ef(page, 'value', 'A4'), 'Pão');
  await page.keyboard.press('Control+z');
  assert.equal(await ef(page, 'value', 'A2'), 'Café');
});

await step('abas: nova, renomear (duplo clique) e voltar', async () => {
  await page.click('[data-testid="btn-add-sheet"]');
  assert.deepEqual(await ef(page, 'sheetNames'), ['Planilha1', 'Planilha2']);
  await page.dblclick('[data-testid="sheet-tab-1"]');
  await page.fill('[data-testid="sheet-rename-input"]', 'Resumo');
  await page.keyboard.press('Enter');
  assert.deepEqual(await ef(page, 'sheetNames'), ['Planilha1', 'Resumo']);
  await clickCell(page, 'A1');
  await typeIn(page, '=Planilha1!B5*2');
  await page.keyboard.press('Enter');
  assert.equal(await ef(page, 'value', 'A1'), 132.5);
  await page.click('[data-testid="sheet-tab-0"]');
});

await step('salvar (Ctrl+S) cria o .xlsx e marca como salvo', async () => {
  await stubDialogs(app, { save: savedPath });
  await page.keyboard.press('Control+s');
  await waitFor(page, () => Promise.resolve(fs.existsSync(savedPath)), 'arquivo salvo');
  await waitFor(page, async () => /Salvo às/.test(await page.textContent('[data-testid="save-status"]')), 'status salvo');
  const x = new ExcelJS.Workbook();
  await x.xlsx.readFile(savedPath);
  assert.equal(x.worksheets[0].getCell('B5').formula, 'SUM(B2:B4)');
  assert.equal(x.worksheets[0].getCell('B5').result, 66.25);
});

await step('fechar o aplicativo', async () => {
  await app.close();
});

// ---------------------------------------------------------------- 2ª sessão
({ app, page } = await launch({ userData, exe: EXE }));
page.on('pageerror', (e) => errors.push(e.message));

await step('reabrir pelos recentes sem perder dados', async () => {
  await page.waitForSelector('[data-testid="recent-list"]');
  await page.click(`text=Minha planilha.xlsx`);
  await page.waitForSelector('[data-testid="editor"]');
  assert.equal(await ef(page, 'value', 'A2'), 'Café');
  assert.equal(await ef(page, 'edit', 'B5'), '=SOMA(B2:B4)');
  assert.equal(await ef(page, 'shown', 'B5'), 'R$ 66,25');
  assert.equal(await ef(page, 'edit', 'D2'), '=SE(B2>15;"Alto";"Baixo")');
  assert.equal((await ef(page, 'style', 'A1')).b, true);
  assert.deepEqual(await ef(page, 'sheetNames'), ['Planilha1', 'Resumo']);
  assert.equal(await ef(page, 'value', 'A1', 1), 132.5);
});

await step('salvar por cima pede confirmação na primeira vez', async () => {
  await clickCell(page, 'A6');
  await typeIn(page, 'Leite');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+s');
  await page.waitForSelector('text=Salvar por cima do arquivo original?');
  await page.click('button:has-text("Salvar por cima")');
  await waitFor(page, async () => /Salvo às/.test(await page.textContent('[data-testid="save-status"]')), 'salvo');
  const backups = fs.readdirSync(path.join(userData, 'backups'));
  assert.ok(backups.length >= 1, 'deve existir backup do arquivo anterior');
});

await step('exportar CSV (ponto e vírgula, vírgula decimal)', async () => {
  const csv = path.join(work, 'export.csv');
  await stubDialogs(app, { save: csv });
  await page.click('[data-testid="btn-file"]');
  await page.click('[data-testid="fm-csv"]');
  await waitFor(page, () => Promise.resolve(fs.existsSync(csv)), 'csv');
  const text = fs.readFileSync(csv, 'utf8');
  assert.ok(text.startsWith('﻿Produto;Preço'));
  assert.match(text, /Café;R\$ 16,00;32;Alto/);
});

await step('exportar PDF', async () => {
  const pdf = path.join(work, 'export.pdf');
  await stubDialogs(app, { save: pdf });
  await page.click('[data-testid="btn-file"]');
  await page.click('[data-testid="fm-pdf"]');
  await page.waitForSelector('[data-testid="print-panel"]');
  await page.click('[data-testid="btn-save-pdf"]');
  await waitFor(page, () => Promise.resolve(fs.existsSync(pdf) && fs.statSync(pdf).size > 1000), 'pdf', 30000);
  assert.equal(fs.readFileSync(pdf).subarray(0, 4).toString(), '%PDF');
});

await step('abrir .xlsx criado por outro programa (avisa recursos não suportados)', async () => {
  const ext = path.join(work, 'externo.xlsx');
  const x = new ExcelJS.Workbook();
  const ws = x.addWorksheet('Relatório');
  ws.getCell('A1').value = 'Relatório anual';
  ws.mergeCells('A1:D1');
  ws.getCell('A2').value = 'Mês';
  ws.getCell('B2').value = 'Valor';
  ['Jan', 'Fev', 'Mar'].forEach((m, i) => {
    ws.getCell(`A${3 + i}`).value = m;
    ws.getCell(`B${3 + i}`).value = (i + 1) * 100;
  });
  ws.getCell('B6').value = { formula: 'SUM(B3:B5)', result: 600 };
  await x.xlsx.writeFile(ext);
  await stubDialogs(app, { open: ext });
  await page.keyboard.press('Control+o');
  await page.waitForSelector('[data-testid="warnings-panel"]');
  assert.match(await page.textContent('[data-testid="warnings-panel"]'), /mescladas/);
  await page.click('button:has-text("Entendi")');
  assert.equal(await ef(page, 'value', 'B6'), 600);
  await clickCell(page, 'B3');
  await typeIn(page, '1000');
  await page.keyboard.press('Enter');
  assert.equal(await ef(page, 'value', 'B6'), 1500);
  // Salvar não sobrescreve sem perguntar: recomenda cópia
  await page.keyboard.press('Control+s');
  await page.waitForSelector('text=Salvar uma cópia?');
  await page.click('button:has-text("Cancelar")');
  const back = new ExcelJS.Workbook();
  await back.xlsx.readFile(ext);
  assert.equal(back.worksheets[0].getCell('B3').value, 100, 'o original não pode ter sido alterado');
});

await step('fechar com alterações não salvas pede confirmação', async () => {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await page.waitForSelector('text=Salvar as alterações?');
  await page.click('button:has-text("Cancelar")');
  assert.ok(await page.isVisible('[data-testid="editor"]'));
});

await step('recuperação após fechamento inesperado', async () => {
  await clickCell(page, 'C3');
  await typeIn(page, 'NÃO SALVO');
  await page.keyboard.press('Enter');
  await ef(page, 'writeRecovery');
  await waitFor(page, () => Promise.resolve(fs.existsSync(path.join(userData, 'recuperacao')) && fs.readdirSync(path.join(userData, 'recuperacao')).length > 0), 'arquivo de recuperação');
  app.process().kill('SIGKILL');
  await new Promise((r) => setTimeout(r, 1500));
});

// ---------------------------------------------------------------- 3ª sessão
({ app, page } = await launch({ userData, exe: EXE }));
page.on('pageerror', (e) => errors.push(e.message));

await step('oferece recuperar e restaura as alterações', async () => {
  await page.waitForSelector('[data-testid="recovery-banner"]');
  await page.click('[data-testid="btn-recover"]');
  await page.waitForSelector('[data-testid="editor"]');
  assert.equal(await ef(page, 'value', 'C3'), 'NÃO SALVO');
  assert.equal(await ef(page, 'value', 'B3'), 1000);
});

await step('arquivo com 10.000 linhas: abre, calcula, rola e filtra', async () => {
  const big = path.join(work, 'grande.xlsx');
  const x = new ExcelJS.Workbook();
  const ws = x.addWorksheet('Dados');
  ws.addRow(['Item', 'Categoria', 'Qtd', 'Preço', 'Total']);
  for (let i = 1; i <= 10000; i++) {
    const r = i + 1;
    ws.addRow([`Item ${i}`, ['A', 'B', 'C'][i % 3], (i % 17) + 1, (i % 101) + 0.5, { formula: `C${r}*D${r}` }]);
  }
  ws.addRow([]);
  ws.addRow(['Total', '', '', '', { formula: 'SUM(E2:E10001)' }]);
  await x.xlsx.writeFile(big);
  await stubDialogs(app, { open: big });
  const t0 = Date.now();
  await page.keyboard.press('Control+o');
  await page.waitForSelector('text=Salvar as alterações?');
  await page.click('button:has-text("Não salvar")');
  await waitFor(page, async () => (await ef(page, 'value', 'A2')) === 'Item 1', 'abrir grande', 60000);
  const tOpen = Date.now() - t0;
  const total = await ef(page, 'value', 'E10003');
  assert.ok(total > 0);
  console.log(`    abrir 10.000 linhas: ${tOpen} ms`);
  // Rolar até o fim
  const t1 = Date.now();
  await clickCell(page, 'A2');
  await page.keyboard.press('Control+ArrowDown');
  assert.equal((await ef(page, 'state')).sel.ar, 10000);
  await page.mouse.wheel(0, -3000);
  await page.waitForTimeout(100);
  console.log(`    navegar até a última linha: ${Date.now() - t1} ms`);
  // Filtro
  await clickCell(page, 'B5');
  await page.click('[data-testid="tab-dados"]');
  await page.click('[data-testid="btn-filter"]');
  const hdr = await ef(page, 'cellRect', 'B1');
  await page.mouse.click(hdr.x + hdr.w - 10, hdr.y + hdr.h / 2);
  await page.waitForSelector('[data-testid="filter-popup"]');
  await page.click('[data-testid="filter-value-A"]');
  await page.click('[data-testid="filter-value-C"]');
  await page.click('[data-testid="filter-ok"]');
  const hidden = await ef(page, 'hidden');
  assert.ok(hidden.length > 6000 && hidden.length < 7000, `linhas escondidas: ${hidden.length}`);
});

await step('ajuda integrada mostra tutoriais', async () => {
  await page.click('[data-testid="btn-help"]');
  await page.click('[data-testid="help-somar"]');
  assert.match(await page.textContent('[data-testid="help-panel"]'), /Somar seleção/);
  await page.click('[data-testid="help-show"]');
  await page.waitForSelector('[data-tour="calc-sum"].tour-highlight');
});

await step('nenhum erro de JavaScript durante o uso', async () => {
  assert.deepEqual(errors, []);
});

await app.evaluate(({ app: a }) => a.exit(0)).catch(() => {});
console.log(failed ? `\n${failed} falha(s).` : `\nTodos os ${results.length} passos passaram.`);
process.exit(failed ? 1 : 0);
