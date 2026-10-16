// Ajuda integrada: tutoriais curtos e locais (sem IA, sem internet).

import { ArrowLeft, Calculator, FolderOpen, Keyboard, MousePointerClick, Palette, Printer, Save, Search, Table2, Undo2, X, Filter, Sigma } from 'lucide-react';
import { useState } from 'react';
import { AppState, setState, useApp } from '../store';

interface Topic {
  id: string;
  title: string;
  icon: React.ReactNode;
  steps: React.ReactNode[];
  tip?: React.ReactNode;
  show?: { tab?: AppState['ribbonTab']; target: string; needsEditor?: boolean };
}

const ic = 'h-5 w-5';
const K = ({ children }: { children: React.ReactNode }) => <kbd className="rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 font-mono text-[0.8rem] text-gray-800">{children}</kbd>;

const TOPICS: Topic[] = [
  {
    id: 'somar',
    title: 'Como somar valores',
    icon: <Sigma className={ic} />,
    steps: [
      <>Clique na primeira célula com número, <b>segure o botão do mouse</b> e arraste até a última.</>,
      <>Olhe a barra lá embaixo: ela já mostra a <b>Soma</b> e a <b>Média</b> do que você selecionou.</>,
      <>Para colocar o resultado na planilha, clique em <b>Somar seleção</b> (guia <b>Início</b> ou <b>Cálculos</b>).</>,
      <>Confira o resultado e clique em <b>Inserir</b>. Ele aparece logo abaixo dos números e se atualiza sozinho.</>,
    ],
    tip: <>Quem já conhece fórmulas pode digitar numa célula: <K>=SOMA(B2:B10)</K> e apertar <K>Enter</K>.</>,
    show: { tab: 'calculos', target: 'calc-sum' },
  },
  {
    id: 'conta',
    title: 'Como fazer uma conta (fórmula)',
    icon: <Calculator className={ic} />,
    steps: [
      <>Clique na célula onde quer o resultado.</>,
      <>Digite <K>=</K> e depois a conta. Exemplos: <K>=B2*C2</K> (multiplicar), <K>=B2-C2</K> (subtrair), <K>=B2/2</K> (dividir).</>,
      <>Em vez de digitar <K>B2</K>, você pode <b>clicar na célula</b> depois de digitar o <K>=</K> ou um sinal (+ - * /).</>,
      <>Aperte <K>Enter</K>. Quando os números mudarem, o resultado muda junto.</>,
    ],
    tip: <>Use vírgula para decimais (<K>2,5</K>) e ponto e vírgula para separar itens numa função: <K>=SE(D2&gt;100;"Alto";"Baixo")</K>.</>,
  },
  {
    id: 'tabela',
    title: 'Como criar uma tabela',
    icon: <Table2 className={ic} />,
    steps: [
      <>Na primeira linha, digite os <b>títulos</b> das colunas (por exemplo: Nome, Telefone, Cidade).</>,
      <>Nas linhas de baixo, digite os dados. Use <K>Tab</K> para ir para a direita e <K>Enter</K> para descer.</>,
      <>Selecione tudo (títulos e dados) e clique em <b>Inserir → Tabela</b>.</>,
      <>Escolha uma cor e clique em <b>Criar tabela</b>. A tabela ganha cores, bordas e botões de filtro.</>,
    ],
    tip: <>Prefere começar pronto? Na tela inicial há modelos como <b>Lista de clientes</b> e <b>Controle de gastos</b>.</>,
    show: { tab: 'inserir', target: 'table' },
  },
  {
    id: 'cores',
    title: 'Como alterar cores',
    icon: <Palette className={ic} />,
    steps: [
      <>Selecione as células que quer pintar.</>,
      <>Na guia <b>Início</b>, clique no <b>balde de tinta</b> para mudar o fundo da célula.</>,
      <>Para mudar a cor das letras, clique no botão com a letra <b>A sublinhada</b>.</>,
      <>Escolha a cor. Para tirar, escolha <b>Sem preenchimento</b> ou <b>Automática</b>.</>,
    ],
    tip: <>Errou? Aperte <K>Ctrl</K> + <K>Z</K> para desfazer.</>,
    show: { tab: 'inicio', target: 'fill' },
  },
  {
    id: 'salvar',
    title: 'Como salvar',
    icon: <Save className={ic} />,
    steps: [
      <>Clique no <b>disquete</b> lá no alto, à esquerda, ou aperte <K>Ctrl</K> + <K>S</K>.</>,
      <>Na primeira vez, escolha o <b>nome</b> e a <b>pasta</b> (por exemplo, Documentos) e clique em <b>Salvar</b>.</>,
      <>Nas próximas vezes é só apertar <K>Ctrl</K> + <K>S</K> de novo.</>,
      <>O aviso no alto mostra se está tudo salvo (bolinha verde) ou se há alterações não salvas (bolinha amarela).</>,
    ],
    tip: <>O arquivo fica no formato do Excel (.xlsx), então também abre no Microsoft Excel e em outros programas. Se o computador desligar sem salvar, o Excel Fácil oferece recuperar o trabalho.</>,
    show: { target: 'save' },
  },
  {
    id: 'imprimir',
    title: 'Como imprimir',
    icon: <Printer className={ic} />,
    steps: [
      <>Clique em <b>Arquivo → Imprimir</b> ou aperte <K>Ctrl</K> + <K>P</K>.</>,
      <>Veja na prévia como a página vai ficar. Se a planilha for larga, escolha <b>Paisagem</b>.</>,
      <>Clique em <b>Imprimir…</b> e escolha a impressora.</>,
      <>Para enviar por e-mail ou WhatsApp, use <b>Salvar PDF</b> no mesmo lugar.</>,
    ],
    show: { target: 'file' },
  },
  {
    id: 'abrir',
    title: 'Como abrir uma planilha do Excel',
    icon: <FolderOpen className={ic} />,
    steps: [
      <>Clique em <b>Arquivo → Abrir</b> (ou <K>Ctrl</K> + <K>O</K>). Na tela inicial, use <b>Abrir arquivo</b>.</>,
      <>Procure o arquivo (.xlsx ou .csv) e clique em <b>Abrir</b>.</>,
      <>Se o arquivo tiver recursos que o Excel Fácil não conhece (gráficos, macros…), aparece um aviso. Os valores aparecem normalmente.</>,
      <>Nesse caso, ao salvar, prefira <b>Salvar uma cópia</b> para não perder nada do original.</>,
    ],
    tip: <>Macros nunca são executadas, por segurança.</>,
    show: { target: 'file' },
  },
  {
    id: 'filtro',
    title: 'Como filtrar e ordenar',
    icon: <Filter className={ic} />,
    steps: [
      <>Clique numa célula da sua tabela.</>,
      <>Na guia <b>Dados</b>, clique em <b>Crescente</b> ou <b>Decrescente</b> para ordenar pela coluna clicada.</>,
      <>Clique em <b>Filtro</b>: aparecem setinhas nos títulos. Clique numa setinha e marque só o que quer ver.</>,
      <>Para ver tudo de novo, clique em <b>Mostrar tudo</b>.</>,
    ],
    show: { tab: 'dados', target: 'tab-dados' },
  },
  {
    id: 'desfazer',
    title: 'Como desfazer um erro',
    icon: <Undo2 className={ic} />,
    steps: [
      <>Aperte <K>Ctrl</K> + <K>Z</K> (ou a seta curva para a esquerda, lá no alto). Pode apertar várias vezes.</>,
      <>Para refazer, aperte <K>Ctrl</K> + <K>Y</K>.</>,
      <>Para apagar o que tem numa célula, selecione e aperte <K>Delete</K>.</>,
    ],
  },
  {
    id: 'procurar',
    title: 'Como procurar um texto',
    icon: <Search className={ic} />,
    steps: [
      <>Aperte <K>Ctrl</K> + <K>F</K> (ou <b>Dados → Localizar</b>).</>,
      <>Digite o que procura e aperte <K>Enter</K> para ir de um resultado ao próximo.</>,
      <>Para trocar um texto por outro, use <b>Substituir</b> (<K>Ctrl</K> + <K>H</K>).</>,
    ],
  },
  {
    id: 'basico',
    title: 'O básico: digitar e se mover',
    icon: <MousePointerClick className={ic} />,
    steps: [
      <>Clique numa célula (um quadradinho) e comece a digitar. Aperte <K>Enter</K> para confirmar.</>,
      <>Use as <b>setas do teclado</b> para andar entre as células.</>,
      <>Para corrigir uma célula, dê <b>dois cliques</b> nela (ou aperte <K>F2</K>).</>,
      <>Para alargar uma coluna, arraste a linha entre as letras lá no alto. Dois cliques nessa linha ajustam sozinho.</>,
    ],
  },
  {
    id: 'atalhos',
    title: 'Atalhos de teclado',
    icon: <Keyboard className={ic} />,
    steps: [
      <><K>Ctrl</K>+<K>C</K> copiar • <K>Ctrl</K>+<K>X</K> recortar • <K>Ctrl</K>+<K>V</K> colar</>,
      <><K>Ctrl</K>+<K>Z</K> desfazer • <K>Ctrl</K>+<K>Y</K> refazer</>,
      <><K>Ctrl</K>+<K>S</K> salvar • <K>Ctrl</K>+<K>O</K> abrir • <K>Ctrl</K>+<K>N</K> nova planilha • <K>Ctrl</K>+<K>P</K> imprimir</>,
      <><K>Ctrl</K>+<K>F</K> localizar • <K>Ctrl</K>+<K>H</K> substituir</>,
      <><K>Ctrl</K>+<K>B</K> negrito • <K>Ctrl</K>+<K>I</K> itálico • <K>Ctrl</K>+<K>U</K> sublinhado</>,
      <><K>F2</K> editar célula • <K>Alt</K>+<K>Enter</K> nova linha dentro da célula • <K>Ctrl</K>+<K>;</K> data de hoje</>,
      <><K>Ctrl</K>+<K>D</K> copiar para baixo • <K>Ctrl</K>+roda do mouse: zoom</>,
    ],
  },
];

function showWhere(t: Topic) {
  if (!t.show) return;
  if (t.show.tab) setState({ ribbonTab: t.show.tab });
  setTimeout(() => {
    const el = document.querySelector<HTMLElement>(`[data-tour="${t.show!.target}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    el.classList.remove('tour-highlight');
    void el.offsetWidth;
    el.classList.add('tour-highlight');
    setTimeout(() => el.classList.remove('tour-highlight'), 4200);
  }, 80);
}

export function HelpPanel() {
  const open = useApp((s) => s.helpOpen);
  const screen = useApp((s) => s.screen);
  const [topic, setTopic] = useState<Topic | null>(null);
  if (!open) return null;
  return (
    <aside className={`anim-in fixed bottom-0 right-0 ${screen === 'editor' ? 'top-11' : 'top-0'} z-[65] flex w-[400px] max-w-[94vw] flex-col border-l border-gray-200 bg-white shadow-2xl`} data-testid="help-panel" aria-label="Ajuda">
      <div className="flex items-center gap-2 bg-amber-400 px-4 py-3">
        {topic && (
          <button className="rounded p-1 hover:bg-black/10" onClick={() => setTopic(null)} aria-label="Voltar" title="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <h2 className="flex-1 text-[1.1rem] font-semibold text-gray-900">{topic ? topic.title : 'Precisa de ajuda?'}</h2>
        <button className="rounded p-1 hover:bg-black/10" onClick={() => setState({ helpOpen: false })} aria-label="Fechar ajuda" title="Fechar">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {!topic ? (
          <>
            <p className="mb-3 text-gray-600">Escolha o que você quer fazer. As instruções são curtas e passo a passo.</p>
            <div className="space-y-2">
              {TOPICS.map((t) => (
                <button key={t.id} className="flex w-full items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 text-left hover:border-brand-300 hover:bg-brand-50" onClick={() => setTopic(t)} data-testid={`help-${t.id}`}>
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700">{t.icon}</span>
                  <span className="font-medium text-gray-800">{t.title}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <ol className="space-y-3">
              {topic.steps.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">{i + 1}</span>
                  <span className="pt-0.5 leading-relaxed text-gray-700">{s}</span>
                </li>
              ))}
            </ol>
            {topic.tip && <div className="mt-4 rounded-xl bg-brand-50 p-3 text-[0.92rem] leading-relaxed text-brand-900">💡 {topic.tip}</div>}
            {topic.show && screen === 'editor' && (
              <button className="mt-4 w-full rounded-xl bg-brand-600 px-4 py-3 font-medium text-white hover:bg-brand-700" onClick={() => showWhere(topic)} data-testid="help-show">
                Mostrar onde fica
              </button>
            )}
            {topic.show && screen !== 'editor' && <p className="mt-4 text-sm text-gray-500">Abra ou crie uma planilha para ver onde fica cada botão.</p>}
          </>
        )}
      </div>
      <div className="border-t border-gray-100 p-3 text-center text-xs text-gray-400">A ajuda funciona sem internet.</div>
    </aside>
  );
}

