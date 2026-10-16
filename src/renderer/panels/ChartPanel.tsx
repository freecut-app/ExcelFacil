// Gráficos básicos a partir da seleção, salvos como imagem PNG.
// O gráfico não fica guardado dentro da planilha (limitação documentada).

import { BarChart3, LineChart, PieChart } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { colToLetters, rangeToA1 } from '../../core/address';
import { formatValue } from '../../core/format';
import { displayText } from '../../core/ops';
import { focusGrid, selectionOrRegion } from '../actions/editing';
import { alertMsg, btnClass } from '../dialogs';
import { Modal } from '../components/ui';
import { currentSheet, setState, toast, useApp } from '../store';

const SERIES_COLORS = ['#059669', '#2563eb', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];

interface ChartData {
  labels: string[];
  series: { name: string; values: number[] }[];
  fmt: (n: number) => string;
}

function useChartData(): ChartData | null {
  const wb = useApp((s) => s.wb)!;
  const sh = currentSheet()!;
  return useMemo(() => {
    const r = selectionOrRegion();
    // Cabeçalho: primeira linha sem números
    let hasHeader = false;
    for (let c = r.c1; c <= r.c2; c++) {
      const v = wb.value(sh, r.r1, c);
      if (typeof v === 'string' && v) hasHeader = true;
      if (typeof v === 'number') {
        hasHeader = false;
        break;
      }
    }
    const r0 = hasHeader ? r.r1 + 1 : r.r1;
    // Primeira coluna com texto = rótulos
    let labelCol = -1;
    for (let row = r0; row <= r.r2; row++) if (typeof wb.value(sh, row, r.c1) === 'string') labelCol = r.c1;
    const labels: string[] = [];
    for (let row = r0; row <= r.r2; row++) {
      if (sh.hiddenRows.has(row)) continue;
      labels.push(labelCol >= 0 ? displayText(wb, sh, row, labelCol) : String(row + 1));
    }
    const series: ChartData['series'] = [];
    let fmtStyle;
    for (let c = r.c1; c <= r.c2; c++) {
      if (c === labelCol) continue;
      let any = false;
      const values: number[] = [];
      for (let row = r0; row <= r.r2; row++) {
        if (sh.hiddenRows.has(row)) continue;
        const v = wb.value(sh, row, c);
        if (typeof v === 'number') {
          any = true;
          values.push(v);
          fmtStyle ??= sh.get(row, c)?.s;
        } else values.push(0);
      }
      if (!any) continue;
      const head = hasHeader ? displayText(wb, sh, r.r1, c) : '';
      series.push({ name: head || `Coluna ${colToLetters(c)}`, values });
    }
    if (!series.length || !labels.length) return null;
    const st = fmtStyle;
    return { labels: labels.slice(0, 60), series: series.slice(0, 8).map((s) => ({ ...s, values: s.values.slice(0, 60) })), fmt: (n: number) => formatValue(n, st) };
  }, [wb, sh]);
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function ChartSvg({ data, kind, title, svgRef }: { data: ChartData; kind: 'bar' | 'line' | 'pie'; title: string; svgRef: React.RefObject<SVGSVGElement | null> }) {
  const W = 720;
  const H = 420;
  const pad = { l: 80, r: 24, t: title ? 52 : 24, b: 76 };
  const cw = W - pad.l - pad.r;
  const ch = H - pad.t - pad.b;
  const all = data.series.flatMap((s) => s.values);
  const max = niceMax(Math.max(0, ...all));
  const min = Math.min(0, ...all);
  const range = max - min || 1;
  const y = (v: number) => pad.t + ch - ((v - min) / range) * ch;
  const n = data.labels.length;
  const fontFam = 'Segoe UI, Arial, sans-serif';

  const legend = (
    <g>
      {data.series.map((s, i) => (
        <g key={s.name} transform={`translate(${pad.l + i * 150}, ${H - 22})`}>
          <rect width="12" height="12" fill={SERIES_COLORS[i % SERIES_COLORS.length]} rx="2" />
          <text x="18" y="10" fontSize="12" fill="#374151" fontFamily={fontFam}>
            {s.name.slice(0, 20)}
          </text>
        </g>
      ))}
    </g>
  );

  if (kind === 'pie') {
    const s = data.series[0];
    const vals = s.values.map((v) => Math.max(0, v));
    const total = vals.reduce((a, b) => a + b, 0) || 1;
    let a0 = -Math.PI / 2;
    const cx = 250;
    const cy = pad.t + (H - pad.t - 20) / 2;
    const R = Math.min(150, (H - pad.t - 40) / 2);
    return (
      <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ background: '#fff', maxWidth: '100%' }}>
        <rect width={W} height={H} fill="#fff" />
        {title && (
          <text x={W / 2} y="32" textAnchor="middle" fontSize="20" fontWeight="600" fill="#111827" fontFamily={fontFam}>
            {title}
          </text>
        )}
        {vals.map((v, i) => {
          const a1 = a0 + (v / total) * Math.PI * 2;
          const large = a1 - a0 > Math.PI ? 1 : 0;
          const d = vals.length === 1 || v === total
            ? `M ${cx} ${cy - R} A ${R} ${R} 0 1 1 ${cx - 0.01} ${cy - R} Z`
            : `M ${cx} ${cy} L ${cx + R * Math.cos(a0)} ${cy + R * Math.sin(a0)} A ${R} ${R} 0 ${large} 1 ${cx + R * Math.cos(a1)} ${cy + R * Math.sin(a1)} Z`;
          a0 = a1;
          return <path key={i} d={d} fill={SERIES_COLORS[i % SERIES_COLORS.length]} stroke="#fff" strokeWidth="2" />;
        })}
        {data.labels.slice(0, 12).map((l, i) => (
          <g key={i} transform={`translate(440, ${pad.t + 10 + i * 26})`}>
            <rect width="14" height="14" fill={SERIES_COLORS[i % SERIES_COLORS.length]} rx="3" />
            <text x="22" y="12" fontSize="13" fill="#374151" fontFamily={fontFam}>
              {l.slice(0, 22)} — {((vals[i] / total) * 100).toFixed(1).replace('.', ',')}%
            </text>
          </g>
        ))}
      </svg>
    );
  }

  const ticks = 5;
  const groupW = cw / n;
  const barW = Math.max(2, (groupW * 0.75) / data.series.length);
  return (
    <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ background: '#fff', maxWidth: '100%' }}>
      <rect width={W} height={H} fill="#fff" />
      {title && (
        <text x={W / 2} y="32" textAnchor="middle" fontSize="20" fontWeight="600" fill="#111827" fontFamily={fontFam}>
          {title}
        </text>
      )}
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const v = min + (range * i) / ticks;
        return (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="#e5e7eb" />
            <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#6b7280" fontFamily={fontFam}>
              {data.fmt(v)}
            </text>
          </g>
        );
      })}
      <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="#9ca3af" />
      {data.labels.map((l, i) => (
        <text
          key={i}
          x={pad.l + groupW * (i + 0.5)}
          y={pad.t + ch + 16}
          textAnchor={n > 8 ? 'end' : 'middle'}
          fontSize="11"
          fill="#374151"
          fontFamily={fontFam}
          transform={n > 8 ? `rotate(-35 ${pad.l + groupW * (i + 0.5)} ${pad.t + ch + 16})` : undefined}
        >
          {l.slice(0, 16)}
        </text>
      ))}
      {kind === 'bar'
        ? data.series.map((s, si) =>
            s.values.map((v, i) => {
              const x = pad.l + groupW * i + (groupW - barW * data.series.length) / 2 + si * barW;
              const y0 = y(Math.max(0, v));
              const h = Math.abs(y(v) - y(0));
              return <rect key={`${si}-${i}`} x={x} y={y0} width={barW - 1} height={h} fill={SERIES_COLORS[si % SERIES_COLORS.length]} rx="2" />;
            }),
          )
        : data.series.map((s, si) => (
            <g key={si}>
              <polyline fill="none" stroke={SERIES_COLORS[si % SERIES_COLORS.length]} strokeWidth="3" points={s.values.map((v, i) => `${pad.l + groupW * (i + 0.5)},${y(v)}`).join(' ')} />
              {s.values.map((v, i) => (
                <circle key={i} cx={pad.l + groupW * (i + 0.5)} cy={y(v)} r="4" fill="#fff" stroke={SERIES_COLORS[si % SERIES_COLORS.length]} strokeWidth="2" />
              ))}
            </g>
          ))}
      {legend}
    </svg>
  );
}

export function ChartPanel() {
  const data = useChartData();
  const sh = currentSheet()!;
  const [kind, setKind] = useState<'bar' | 'line' | 'pie'>('bar');
  const [title, setTitle] = useState(data?.series[0]?.name ?? '');
  const svgRef = useRef<SVGSVGElement>(null);
  const close = () => {
    setState({ panel: null });
    focusGrid();
  };

  const savePng = async () => {
    const svg = svgRef.current;
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' }));
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 1440;
    canvas.height = 840;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    const d = await window.api.saveDialog(title || `Gráfico - ${sh.name}`, 'png');
    if (!d.ok) return;
    const r = await window.api.savePng(d.path, canvas.toDataURL('image/png'));
    if (r.ok) {
      toast('Imagem do gráfico salva.', 'success');
      void window.api.showInFolder(d.path);
    } else await alertMsg('Não foi possível salvar', r.message, 'warn');
  };

  return (
    <Modal
      title="Criar gráfico"
      onClose={close}
      width="w-[min(860px,96vw)]"
      testId="chart-panel"
      footer={
        <>
          <button className={btnClass()} onClick={close}>Fechar</button>
          <button className={btnClass('primary')} disabled={!data} onClick={() => void savePng()} data-testid="chart-save">
            Salvar como imagem
          </button>
        </>
      }
    >
      {!data ? (
        <p className="text-gray-700">
          Selecione os dados do gráfico: uma coluna com os nomes (por exemplo, meses ou produtos) e uma ou mais colunas com números. Inclua a linha de títulos.
        </p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {(
              [
                ['bar', 'Colunas', <BarChart3 key="b" className="h-4 w-4" />],
                ['line', 'Linhas', <LineChart key="l" className="h-4 w-4" />],
                ['pie', 'Pizza', <PieChart key="p" className="h-4 w-4" />],
              ] as const
            ).map(([k, label, icon]) => (
              <button key={k} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${kind === k ? 'border-brand-500 bg-brand-50 font-medium text-brand-800' : 'border-gray-200'}`} onClick={() => setKind(k)}>
                {icon} {label}
              </button>
            ))}
            <input className="ml-auto h-9 w-[260px] rounded-lg border border-gray-300 px-2 text-sm" placeholder="Título do gráfico" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Título do gráfico" />
          </div>
          <div className="flex justify-center rounded-xl border border-gray-200 bg-white p-2">
            <ChartSvg data={data} kind={kind} title={title} svgRef={svgRef} />
          </div>
          <p className="mt-2 text-sm text-gray-500">
            Dados: {rangeToA1(selectionOrRegion())}. {kind === 'pie' && data.series.length > 1 ? 'A pizza usa só a primeira coluna de números. ' : ''}
            O gráfico é salvo como imagem (PNG) para colocar em documentos ou enviar; ele não fica guardado dentro da planilha.
          </p>
        </>
      )}
    </Modal>
  );
}
