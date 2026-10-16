// Faixa de opções com as ferramentas mais usadas primeiro.

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown10,
  ArrowDownAZ,
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  ArrowUpZA,
  BarChart3,
  Bold,
  Calculator,
  ClipboardPaste,
  Copy,
  CopyX,
  DollarSign,
  Eraser,
  Filter,
  FilterX,
  Hash,
  Italic,
  Minus,
  MoveHorizontal,
  Percent,
  PaintBucket,
  Pin,
  Plus,
  Scissors,
  Search,
  Sigma,
  SquareDashed,
  Grid3x3,
  Square,
  Table2,
  TrendingDown,
  TrendingUp,
  Underline,
  Type,
  WrapText,
  ZoomIn,
  ZoomOut,
  Trash2,
  Replace,
  FunctionSquare,
  Baseline,
  PanelBottom,
  PanelTop,
  ListOrdered,
  Divide,
} from 'lucide-react';
import { NumFmt } from '../../core/model';
import { autoSum, openQuick, showAllRows, sortSelection, toggleFilter } from '../actions/data';
import {
  addSheet,
  applyBorders,
  autofitColumns,
  changeDecimals,
  clearFormats,
  copySelection,
  deleteCols,
  deleteRows,
  insertCols,
  insertRows,
  pasteSelection,
  setNumberFormat,
  setStyle,
  setZoom,
  toggleFlag,
  toggleFreeze,
} from '../actions/editing';
import { currentSheet, getState, setState, useApp } from '../store';
import { ColorGrid, Dropdown, Group, IconButton, RibbonButton } from './ui';

const FONTS = ['Segoe UI', 'Calibri', 'Arial', 'Times New Roman', 'Verdana', 'Tahoma', 'Georgia', 'Courier New', 'Comic Sans MS'];
const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48];
const ic = 'h-[18px] w-[18px]';
const big = 'h-7 w-7';

function useActiveStyle() {
  useApp((s) => s.rev);
  const sel = useApp((s) => s.sel);
  useApp((s) => s.active);
  const sh = currentSheet();
  return sh?.get(sel.ar, sel.ac)?.s ?? {};
}

function Inicio() {
  const st = useActiveStyle();
  return (
    <>
      <Group label="Área de transferência">
        <RibbonButton big icon={<ClipboardPaste className={big} />} label="Colar" tip="Colar (Ctrl+V)" onClick={() => void pasteSelection('all')} testId="btn-paste" />
        <div className="flex flex-col">
          <RibbonButton icon={<Scissors className={ic} />} label="Recortar" tip="Recortar (Ctrl+X)" onClick={() => void copySelection(true)} />
          <RibbonButton icon={<Copy className={ic} />} label="Copiar" tip="Copiar (Ctrl+C)" onClick={() => void copySelection(false)} testId="btn-copy" />
        </div>
      </Group>
      <Group label="Fonte">
        <div className="flex flex-col gap-1">
          <div className="flex gap-1">
            <select
              title="Tipo de letra"
              aria-label="Tipo de letra"
              className="h-8 w-[150px] rounded-md border border-gray-300 bg-white px-1 text-[0.85rem]"
              value={st.font ?? 'Segoe UI'}
              onChange={(e) => setStyle({ font: e.target.value === 'Segoe UI' ? undefined : e.target.value }, 'Fonte')}
            >
              {FONTS.map((f) => (
                <option key={f} value={f} style={{ fontFamily: f }}>
                  {f}
                </option>
              ))}
            </select>
            <select
              title="Tamanho da letra"
              aria-label="Tamanho da letra"
              className="h-8 w-[62px] rounded-md border border-gray-300 bg-white px-1 text-[0.85rem]"
              value={st.size ?? 11}
              onChange={(e) => setStyle({ size: +e.target.value === 11 ? undefined : +e.target.value }, 'Tamanho da letra')}
            >
              {SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-0.5">
            <IconButton icon={<Bold className={ic} />} tip="Negrito (Ctrl+B)" active={!!st.b} onClick={() => toggleFlag('b')} testId="btn-bold" tour="bold" />
            <IconButton icon={<Italic className={ic} />} tip="Itálico (Ctrl+I)" active={!!st.i} onClick={() => toggleFlag('i')} />
            <IconButton icon={<Underline className={ic} />} tip="Sublinhado (Ctrl+U)" active={!!st.u} onClick={() => toggleFlag('u')} />
            <Dropdown
              button={(_o, t) => <IconButton icon={<Baseline className={ic} style={{ color: st.color ?? '#111' }} />} tip="Cor do texto" onClick={t} tour="color" testId="btn-color" />}
            >
              {(close) => (
                <ColorGrid
                  noneLabel="Automática (preto)"
                  onPick={(c) => {
                    close();
                    setStyle({ color: c }, 'Cor do texto');
                  }}
                />
              )}
            </Dropdown>
            <Dropdown
              button={(_o, t) => <IconButton icon={<PaintBucket className={ic} style={{ color: st.fill ?? '#6b7280' }} />} tip="Cor de preenchimento (fundo da célula)" onClick={t} tour="fill" testId="btn-fill" />}
            >
              {(close) => (
                <ColorGrid
                  noneLabel="Sem preenchimento"
                  onPick={(c) => {
                    close();
                    setStyle({ fill: c }, 'Cor de preenchimento');
                  }}
                />
              )}
            </Dropdown>
            <Dropdown button={(_o, t) => <IconButton icon={<Grid3x3 className={ic} />} tip="Bordas" onClick={t} testId="btn-borders" />}>
              {(close) => (
                <div className="w-[220px] py-1">
                  {(
                    [
                      ['all', 'Todas as bordas', <Grid3x3 key="a" className="h-4 w-4" />],
                      ['outline', 'Borda externa', <Square key="b" className="h-4 w-4" />],
                      ['bottom', 'Borda inferior', <PanelBottom key="c" className="h-4 w-4" />],
                      ['top', 'Borda superior', <PanelTop key="d" className="h-4 w-4" />],
                      ['none', 'Sem bordas', <SquareDashed key="e" className="h-4 w-4" />],
                    ] as const
                  ).map(([k, label, icon]) => (
                    <button
                      key={k}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-brand-50"
                      onClick={() => {
                        close();
                        applyBorders(k);
                      }}
                    >
                      {icon}
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </Dropdown>
          </div>
        </div>
      </Group>
      <Group label="Alinhamento">
        <div className="flex flex-col gap-1">
          <div className="flex gap-0.5">
            <IconButton icon={<AlignLeft className={ic} />} tip="Alinhar à esquerda" active={st.align === 'left'} onClick={() => setStyle({ align: st.align === 'left' ? undefined : 'left' }, 'Alinhar')} />
            <IconButton icon={<AlignCenter className={ic} />} tip="Centralizar" active={st.align === 'center'} onClick={() => setStyle({ align: st.align === 'center' ? undefined : 'center' }, 'Alinhar')} />
            <IconButton icon={<AlignRight className={ic} />} tip="Alinhar à direita" active={st.align === 'right'} onClick={() => setStyle({ align: st.align === 'right' ? undefined : 'right' }, 'Alinhar')} />
          </div>
          <RibbonButton icon={<WrapText className={ic} />} label="Quebrar texto" tip="Mostrar o texto em várias linhas dentro da célula" active={!!st.wrap} onClick={() => toggleFlag('wrap')} />
        </div>
      </Group>
      <Group label="Número">
        <div className="flex flex-col gap-1">
          <select
            title="Formato do número"
            aria-label="Formato do número"
            className="h-8 w-[150px] rounded-md border border-gray-300 bg-white px-1 text-[0.85rem]"
            value={st.fmt ?? 'general'}
            onChange={(e) => setNumberFormat(e.target.value as NumFmt)}
            data-testid="select-numfmt"
          >
            <option value="general">Geral</option>
            <option value="number">Número (1.234,56)</option>
            <option value="currency">Moeda (R$)</option>
            <option value="percent">Porcentagem (%)</option>
            <option value="date">Data (dd/mm/aaaa)</option>
            <option value="text">Texto</option>
          </select>
          <div className="flex gap-0.5">
            <IconButton icon={<DollarSign className={ic} />} tip="Formato de moeda (R$)" active={st.fmt === 'currency'} onClick={() => setNumberFormat('currency')} testId="btn-currency" tour="currency" />
            <IconButton icon={<Percent className={ic} />} tip="Formato de porcentagem" active={st.fmt === 'percent'} onClick={() => setNumberFormat('percent')} testId="btn-percent" />
            <IconButton icon={<Hash className={ic} />} tip="Separador de milhar (1.234,56)" active={st.fmt === 'number'} onClick={() => setNumberFormat('number')} />
            <IconButton icon={<Plus className={ic} />} tip="Mais casas decimais" onClick={() => changeDecimals(1)} />
            <IconButton icon={<Minus className={ic} />} tip="Menos casas decimais" onClick={() => changeDecimals(-1)} />
          </div>
        </div>
      </Group>
      <Group label="Cálculo rápido">
        <RibbonButton big icon={<Sigma className={big} />} label="Somar seleção" tip="Soma os números selecionados e mostra o resultado" onClick={() => openQuick('sum')} tour="quicksum" testId="btn-quick-sum" />
      </Group>
      <Group label="Limpar">
        <RibbonButton big icon={<Eraser className={big} />} label="Limpar formatação" tip="Remove cores, negrito, bordas e formatos da seleção" onClick={clearFormats} />
      </Group>
    </>
  );
}

function Inserir() {
  return (
    <>
      <Group label="Linhas">
        <RibbonButton big icon={<ArrowUpToLine className={big} />} label="Linha acima" tip="Inserir linha acima da seleção" onClick={() => insertRows('above')} testId="btn-insert-row" />
        <RibbonButton big icon={<ArrowDownToLine className={big} />} label="Linha abaixo" tip="Inserir linha abaixo da seleção" onClick={() => insertRows('below')} />
        <RibbonButton big icon={<Trash2 className={big} />} label="Excluir linha" tip="Excluir as linhas selecionadas" onClick={() => void deleteRows()} />
      </Group>
      <Group label="Colunas">
        <RibbonButton big icon={<ArrowLeftToLine className={big} />} label="Coluna à esquerda" tip="Inserir coluna à esquerda" onClick={() => insertCols('left')} />
        <RibbonButton big icon={<ArrowRightToLine className={big} />} label="Coluna à direita" tip="Inserir coluna à direita" onClick={() => insertCols('right')} />
        <RibbonButton big icon={<Trash2 className={big} />} label="Excluir coluna" tip="Excluir as colunas selecionadas" onClick={() => void deleteCols()} />
      </Group>
      <Group label="Abas">
        <RibbonButton big icon={<Plus className={big} />} label="Nova aba" tip="Criar uma nova aba de planilha" onClick={addSheet} />
      </Group>
      <Group label="Tabelas e gráficos">
        <RibbonButton big icon={<Table2 className={big} />} label="Tabela" tip="Transformar a seleção numa tabela bonita, com filtro" onClick={() => setState({ panel: { type: 'table' } })} tour="table" testId="btn-table" />
        <RibbonButton big icon={<BarChart3 className={big} />} label="Gráfico" tip="Criar um gráfico com os dados selecionados" onClick={() => setState({ panel: { type: 'chart' } })} testId="btn-chart" />
      </Group>
      <Group label="Fórmulas">
        <RibbonButton big icon={<FunctionSquare className={big} />} label="Inserir função" tip="Escolher uma função com explicação" onClick={() => setState({ panel: { type: 'functions' } })} />
      </Group>
    </>
  );
}

function Calculos() {
  return (
    <>
      <Group label="Calcular a seleção (sem fórmulas)">
        <RibbonButton big icon={<Sigma className={big} />} label="Somar seleção" tip="Soma os números selecionados" onClick={() => openQuick('sum')} tour="calc-sum" testId="calc-sum" />
        <RibbonButton big icon={<Divide className={big} />} label="Calcular média" tip="Média dos números selecionados" onClick={() => openQuick('avg')} testId="calc-avg" />
        <RibbonButton big icon={<TrendingUp className={big} />} label="Maior valor" tip="Encontra o maior número da seleção" onClick={() => openQuick('max')} testId="calc-max" />
        <RibbonButton big icon={<TrendingDown className={big} />} label="Menor valor" tip="Encontra o menor número da seleção" onClick={() => openQuick('min')} testId="calc-min" />
        <RibbonButton big icon={<ListOrdered className={big} />} label="Contar" tip="Conta quantos números há na seleção" onClick={() => openQuick('count')} testId="calc-count" />
        <RibbonButton big icon={<Percent className={big} />} label="Porcentagem" tip="Quanto cada valor representa do total, ou X% de um valor" onClick={() => openQuick('pct')} testId="calc-pct" />
      </Group>
      <Group label="Fórmulas automáticas">
        <RibbonButton big icon={<Calculator className={big} />} label="Soma automática" tip="Insere =SOMA(...) logo abaixo dos números selecionados" onClick={() => autoSum('SOMA')} testId="btn-autosum" />
        <RibbonButton big icon={<FunctionSquare className={big} />} label="Mais funções" tip="Ver todas as funções com explicação" onClick={() => setState({ panel: { type: 'functions' } })} />
      </Group>
    </>
  );
}

function Dados() {
  const sh = currentSheet();
  useApp((s) => s.rev);
  const hasFilter = !!sh?.filter;
  return (
    <>
      <Group label="Ordenar">
        <RibbonButton big icon={<ArrowDownAZ className={big} />} label="Crescente" tip="Ordenar de A a Z / do menor para o maior, pela coluna selecionada" onClick={() => sortSelection(true)} testId="btn-sort-asc" />
        <RibbonButton big icon={<ArrowUpZA className={big} />} label="Decrescente" tip="Ordenar de Z a A / do maior para o menor, pela coluna selecionada" onClick={() => sortSelection(false)} testId="btn-sort-desc" />
      </Group>
      <Group label="Filtrar">
        <RibbonButton big icon={<Filter className={big} />} label={hasFilter ? 'Remover filtro' : 'Filtro'} tip="Mostrar só as linhas que você escolher" active={hasFilter} onClick={toggleFilter} testId="btn-filter" />
        <RibbonButton big icon={<FilterX className={big} />} label="Mostrar tudo" tip="Limpa as escolhas do filtro e mostra todas as linhas" disabled={!hasFilter} onClick={showAllRows} />
      </Group>
      <Group label="Localizar">
        <RibbonButton big icon={<Search className={big} />} label="Localizar" tip="Procurar um texto ou número (Ctrl+F)" onClick={() => setState({ panel: { type: 'find', replace: false } })} testId="btn-find" />
        <RibbonButton big icon={<Replace className={big} />} label="Substituir" tip="Trocar um texto por outro (Ctrl+H)" onClick={() => setState({ panel: { type: 'find', replace: true } })} />
      </Group>
      <Group label="Limpeza">
        <RibbonButton big icon={<CopyX className={big} />} label="Remover duplicados" tip="Apagar linhas repetidas" onClick={() => setState({ panel: { type: 'dedupe' } })} testId="btn-dedupe" />
      </Group>
    </>
  );
}

function Exibir() {
  const zoom = useApp((s) => s.zoom);
  useApp((s) => s.rev);
  const sh = currentSheet();
  return (
    <>
      <Group label="Congelar">
        <RibbonButton big icon={<Pin className={big} />} label={sh?.freezeRows ? 'Descongelar' : 'Congelar 1ª linha'} tip="Deixar a primeira linha sempre visível ao rolar" active={!!sh?.freezeRows} onClick={toggleFreeze} testId="btn-freeze" />
      </Group>
      <Group label="Zoom">
        <RibbonButton big icon={<ZoomOut className={big} />} label="Diminuir" tip="Diminuir zoom (Ctrl -)" onClick={() => setZoom(zoom - 10)} />
        <RibbonButton big icon={<Type className={big} />} label={`${zoom}%`} tip="Voltar para 100%" onClick={() => setZoom(100)} />
        <RibbonButton big icon={<ZoomIn className={big} />} label="Aumentar" tip="Aumentar zoom (Ctrl +)" onClick={() => setZoom(zoom + 10)} />
      </Group>
      <Group label="Colunas">
        <RibbonButton big icon={<MoveHorizontal className={big} />} label="Ajustar largura" tip="Ajusta a largura das colunas selecionadas ao conteúdo" onClick={() => autofitColumns()} testId="btn-autofit" />
        <RibbonButton big icon={<ArrowDown10 className={big} />} label="Largura padrão" tip="Volta as colunas selecionadas para a largura normal" onClick={() => {
          const s = getState();
          const shx = currentSheet();
          if (!s.wb || !shx) return;
          const r = s.sel;
          const c1 = Math.min(r.ac, r.fc);
          const c2 = Math.min(Math.max(r.ac, r.fc), c1 + 500);
          s.wb.setColWidth(shx, Array.from({ length: c2 - c1 + 1 }, (_, i) => c1 + i), null);
        }} />
      </Group>
    </>
  );
}

const TABS = [
  ['inicio', 'Início'],
  ['inserir', 'Inserir'],
  ['calculos', 'Cálculos'],
  ['dados', 'Dados'],
  ['exibir', 'Exibir'],
] as const;

export function Ribbon() {
  const tab = useApp((s) => s.ribbonTab);
  return (
    <div className="shrink-0 border-b border-gray-200 bg-white">
      <div className="flex items-end gap-1 px-2 pt-1" role="tablist">
        <button
          className="mr-1 rounded-t-lg bg-brand-600 px-4 py-1.5 text-[0.9rem] font-medium text-white hover:bg-brand-700"
          onClick={() => setState({ fileMenu: true })}
          data-tour="file"
          data-testid="btn-file"
          title="Novo, abrir, salvar, exportar e imprimir"
        >
          Arquivo
        </button>
        {TABS.map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            data-tour={`tab-${k}`}
            data-testid={`tab-${k}`}
            className={`rounded-t-lg px-4 py-1.5 text-[0.9rem] ${tab === k ? 'bg-brand-50 font-semibold text-brand-800 shadow-[inset_0_-3px_0_var(--color-brand-600)]' : 'text-gray-600 hover:bg-gray-50'}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setState({ ribbonTab: k })}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex h-[92px] items-stretch overflow-x-auto overflow-y-hidden bg-brand-50/40 px-1 py-1">
        {tab === 'inicio' && <Inicio />}
        {tab === 'inserir' && <Inserir />}
        {tab === 'calculos' && <Calculos />}
        {tab === 'dados' && <Dados />}
        {tab === 'exibir' && <Exibir />}
      </div>
    </div>
  );
}
