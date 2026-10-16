// Modelos prontos (todos com fórmulas de verdade).

import { CellStyle } from './model';
import { Workbook } from './workbook';

export interface TemplateInfo {
  id: string;
  title: string;
  description: string;
  icon: string; // nome do ícone lucide
}

export const TEMPLATES: TemplateInfo[] = [
  { id: 'blank', title: 'Planilha em branco', description: 'Comece do zero', icon: 'FilePlus2' },
  { id: 'gastos', title: 'Controle de gastos', description: 'Anote despesas e veja o total por categoria', icon: 'Wallet' },
  { id: 'vendas', title: 'Controle de vendas', description: 'Vendas com total automático por linha', icon: 'ShoppingCart' },
  { id: 'clientes', title: 'Lista de clientes', description: 'Contatos organizados com filtro', icon: 'Users' },
  { id: 'estoque', title: 'Controle de estoque', description: 'Avisa quando é hora de repor', icon: 'Package' },
  { id: 'orcamento', title: 'Orçamento mensal', description: 'Previsto x real e saldo do mês', icon: 'PiggyBank' },
];

const HEADER: CellStyle = { b: true, color: '#ffffff', fill: '#047857', align: 'center', bt: true, bb: true, bl: true, br: true };
const BOX: CellStyle = { bt: true, bb: true, bl: true, br: true };
const TITLE: CellStyle = { b: true, size: 16, color: '#065f46' };
const TOTAL_LABEL: CellStyle = { b: true, fill: '#d1fae5', bt: true, bb: true, bl: true, br: true };
const MONEY: CellStyle = { fmt: 'currency', dec: 2 };

class Builder {
  wb: Workbook;
  constructor(name: string) {
    this.wb = new Workbook([name]);
  }
  get sh() {
    return this.wb.sheets[this.wb.sheets.length - 1];
  }
  /** Escreve uma linha a partir de uma coluna. Textos começando com "=" são fórmulas em português. */
  row(r: number, values: (string | number | null)[], style?: CellStyle | ((c: number) => CellStyle | undefined), c0 = 0) {
    values.forEach((v, i) => {
      const c = c0 + i;
      if (v !== null && v !== '') this.wb.setInput(this.sh, r, c, String(typeof v === 'number' ? String(v).replace('.', ',') : v));
      const s = typeof style === 'function' ? style(c) : style;
      if (s) this.wb.applyStyle(this.sh, { r1: r, c1: c, r2: r, c2: c }, s);
    });
  }
  widths(ws: number[]) {
    ws.forEach((w, c) => this.wb.setColWidth(this.sh, [c], w));
  }
  done(): Workbook {
    this.wb.clearHistory();
    return this.wb;
  }
}

export function createFromTemplate(id: string): Workbook {
  switch (id) {
    case 'gastos': {
      const b = new Builder('Gastos');
      b.row(0, ['Controle de gastos'], TITLE);
      b.row(1, ['Data', 'Descrição', 'Categoria', 'Valor', 'Pago?'], HEADER);
      const rows: (string | number)[][] = [
        ['05/10/2026', 'Supermercado', 'Alimentação', 'R$ 320,50', 'Sim'],
        ['08/10/2026', 'Conta de luz', 'Casa', 'R$ 142,90', 'Sim'],
        ['10/10/2026', 'Farmácia', 'Saúde', 'R$ 58,00', 'Não'],
        ['12/10/2026', 'Ônibus', 'Transporte', 'R$ 44,00', 'Sim'],
        ['15/10/2026', 'Padaria', 'Alimentação', 'R$ 36,75', 'Sim'],
      ];
      rows.forEach((r, i) => b.row(2 + i, r, (c) => (c === 3 ? { ...BOX, ...MONEY } : BOX)));
      for (let i = rows.length; i < 15; i++) b.row(2 + i, [null, null, null, null, null], (c) => (c === 3 ? { ...BOX, ...MONEY } : BOX));
      b.row(17, ['', '', 'Total', '=SOMA(D3:D17)'], (c) => (c === 3 ? { ...TOTAL_LABEL, ...MONEY } : c === 2 ? TOTAL_LABEL : undefined));
      b.row(1, ['Por categoria', 'Total'], HEADER, 6);
      ['Alimentação', 'Casa', 'Saúde', 'Transporte', 'Lazer', 'Outros'].forEach((cat, i) =>
        b.row(2 + i, [cat, `=SOMASE($C$3:$C$17;G${3 + i};$D$3:$D$17)`], (c) => (c === 7 ? { ...BOX, ...MONEY } : BOX), 6),
      );
      b.row(8, ['Não pago', '=SOMASE($E$3:$E$17;"Não";$D$3:$D$17)'], (c) => (c === 7 ? { ...TOTAL_LABEL, ...MONEY } : TOTAL_LABEL), 6);
      b.widths([110, 220, 140, 120, 80, 30, 140, 120]);
      b.wb.setFreezeRows(b.sh, 2);
      return b.done();
    }
    case 'vendas': {
      const b = new Builder('Vendas');
      b.row(0, ['Controle de vendas'], TITLE);
      b.row(1, ['Data', 'Cliente', 'Produto', 'Quantidade', 'Preço unitário', 'Total'], HEADER);
      const rows: (string | number)[][] = [
        ['01/10/2026', 'Maria Souza', 'Bolo de cenoura', 2, 'R$ 35,00'],
        ['02/10/2026', 'João Lima', 'Torta de frango', 1, 'R$ 48,00'],
        ['03/10/2026', 'Ana Costa', 'Brigadeiro (cento)', 3, 'R$ 90,00'],
        ['05/10/2026', 'Pedro Alves', 'Bolo de cenoura', 1, 'R$ 35,00'],
      ];
      for (let i = 0; i < 20; i++) {
        const r = 2 + i;
        const base = rows[i] ?? [null, null, null, null, null];
        b.row(r, [...base, `=SE(D${r + 1}="";"";D${r + 1}*E${r + 1})`], (c) => (c >= 4 ? { ...BOX, ...MONEY } : BOX));
      }
      b.row(22, ['', '', '', '=SOMA(D3:D22)', 'Total geral', '=SOMA(F3:F22)'], (c) => (c === 5 ? { ...TOTAL_LABEL, ...MONEY } : c >= 3 ? TOTAL_LABEL : undefined));
      b.row(23, ['', '', '', '', 'Maior venda', '=MÁXIMO(F3:F22)'], (c) => (c === 5 ? { ...BOX, ...MONEY } : c === 4 ? BOX : undefined));
      b.row(24, ['', '', '', '', 'Média por venda', '=SEERRO(MÉDIA(F3:F22);0)'], (c) => (c === 5 ? { ...BOX, ...MONEY } : c === 4 ? BOX : undefined));
      b.row(25, ['', '', '', '', 'Nº de vendas', '=CONT.NÚM(F3:F22)'], (c) => (c >= 4 ? BOX : undefined));
      b.widths([110, 180, 180, 110, 130, 130]);
      b.wb.setFreezeRows(b.sh, 2);
      return b.done();
    }
    case 'clientes': {
      const b = new Builder('Clientes');
      b.row(0, ['Lista de clientes'], TITLE);
      b.row(1, ['Nome', 'Telefone', 'E-mail', 'Cidade', 'Aniversário', 'Observações'], HEADER);
      const rows = [
        ['Maria Souza', '(11) 98765-4321', 'maria@exemplo.com', 'São Paulo', '12/03/1985', 'Prefere contato por WhatsApp'],
        ['João Lima', '(21) 99876-5432', 'joao@exemplo.com', 'Rio de Janeiro', '25/07/1990', ''],
        ['Ana Costa', '(31) 97654-3210', 'ana@exemplo.com', 'Belo Horizonte', '03/11/1978', 'Cliente desde 2020'],
      ];
      for (let i = 0; i < 30; i++) b.row(2 + i, rows[i] ?? [null, null, null, null, null, null], BOX);
      b.row(33, ['Total de clientes:', '=CONT.VALORES(A3:A32)'], TOTAL_LABEL);
      b.widths([180, 140, 200, 140, 110, 260]);
      b.wb.setFreezeRows(b.sh, 2);
      b.sh.filter = { headerRow: 1, c1: 0, c2: 5, allowed: {} };
      return b.done();
    }
    case 'estoque': {
      const b = new Builder('Estoque');
      b.row(0, ['Controle de estoque'], TITLE);
      b.row(1, ['Produto', 'Estoque atual', 'Estoque mínimo', 'Preço de custo', 'Valor em estoque', 'Situação'], HEADER);
      const rows: (string | number)[][] = [
        ['Arroz 5 kg', 12, 5, 'R$ 24,90'],
        ['Feijão 1 kg', 4, 6, 'R$ 8,50'],
        ['Óleo 900 ml', 20, 8, 'R$ 7,20'],
        ['Café 500 g', 2, 4, 'R$ 16,90'],
      ];
      for (let i = 0; i < 25; i++) {
        const r = 2 + i;
        const base = rows[i] ?? [null, null, null, null];
        b.row(r, [...base, `=SE(B${r + 1}="";"";B${r + 1}*D${r + 1})`, `=SE(A${r + 1}="";"";SE(B${r + 1}<=C${r + 1};"Repor";"OK"))`], (c) =>
          c === 3 || c === 4 ? { ...BOX, ...MONEY } : c === 5 ? { ...BOX, align: 'center', b: true } : BOX,
        );
      }
      b.row(27, ['Total', '=SOMA(B3:B27)', '', '', '=SOMA(E3:E27)', '=CONT.SE(F3:F27;"Repor")&" para repor"'], (c) =>
        c === 4 ? { ...TOTAL_LABEL, ...MONEY } : TOTAL_LABEL,
      );
      b.widths([200, 120, 130, 130, 140, 130]);
      b.wb.setFreezeRows(b.sh, 2);
      return b.done();
    }
    case 'orcamento': {
      const b = new Builder('Orçamento');
      b.row(0, ['Orçamento mensal'], TITLE);
      b.row(2, ['Receitas', 'Previsto', 'Real', 'Diferença'], HEADER);
      const rec: (string | number)[][] = [
        ['Salário', 'R$ 3.000,00', 'R$ 3.000,00'],
        ['Renda extra', 'R$ 500,00', 'R$ 350,00'],
        ['Outros', 'R$ 0,00', ''],
      ];
      rec.forEach((r, i) => b.row(3 + i, [...r, `=C${4 + i}-B${4 + i}`], (c) => (c === 0 ? BOX : { ...BOX, ...MONEY })));
      b.row(6, ['Total de receitas', '=SOMA(B4:B6)', '=SOMA(C4:C6)', '=C7-B7'], (c) => (c === 0 ? TOTAL_LABEL : { ...TOTAL_LABEL, ...MONEY }));

      b.row(8, ['Despesas', 'Previsto', 'Real', 'Diferença'], HEADER);
      const desp: (string | number)[][] = [
        ['Aluguel', 'R$ 1.200,00', 'R$ 1.200,00'],
        ['Mercado', 'R$ 800,00', 'R$ 910,40'],
        ['Contas (luz, água, internet)', 'R$ 350,00', 'R$ 332,15'],
        ['Transporte', 'R$ 250,00', 'R$ 280,00'],
        ['Lazer', 'R$ 200,00', 'R$ 120,00'],
        ['Outros', 'R$ 150,00', ''],
      ];
      desp.forEach((r, i) => b.row(9 + i, [...r, `=B${10 + i}-C${10 + i}`], (c) => (c === 0 ? BOX : { ...BOX, ...MONEY })));
      b.row(15, ['Total de despesas', '=SOMA(B10:B15)', '=SOMA(C10:C15)', '=B16-C16'], (c) => (c === 0 ? TOTAL_LABEL : { ...TOTAL_LABEL, ...MONEY }));

      b.row(17, ['Saldo do mês', '=B7-B16', '=C7-C16'], (c) => (c === 0 ? { ...HEADER, align: 'left' } : { ...TOTAL_LABEL, ...MONEY, b: true }));
      b.row(18, ['Situação', '', '=SE(C18>=0;"Sobrou dinheiro 🙂";"Gastou mais do que ganhou")'], (c) => (c === 0 ? TOTAL_LABEL : c === 2 ? { b: true } : undefined));
      b.row(20, ['Dica: a coluna "Diferença" mostra quanto o real ficou acima ou abaixo do previsto.'], { i: true, color: '#6b7280' });
      b.widths([240, 130, 130, 130]);
      return b.done();
    }
    default: {
      const wb = new Workbook(['Planilha1']);
      return wb;
    }
  }
}
