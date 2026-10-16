# Excel Fácil

Editor de planilhas para quem acha o Excel complicado. Funciona **100% offline**, todo em **português**, sem cadastro e sem internet. Abre e salva arquivos do Excel (`.xlsx`).

![Tela inicial](docs/img/01-inicio.png)

## Instalação (para quem vai usar)

1. Dê dois cliques em **`ExcelFacil-Setup-1.0.0.exe`** (fica na pasta `release`).
2. Se aparecer a tela azul **"O Windows protegeu o computador"**, clique em **Mais informações → Executar assim mesmo**.
   O aviso aparece porque o instalador não tem assinatura digital paga (veja "Avisos do Windows" abaixo). O programa não acessa a internet.
3. Escolha a pasta (ou deixe a sugerida) e clique em **Instalar**. Não é preciso ser administrador.
4. Responda se quer um **atalho na área de trabalho**.
5. Abra pelo atalho **Excel Fácil** ou pelo menu Iniciar.

Para desinstalar: **Configurações do Windows → Aplicativos → Excel Fácil → Desinstalar**. Seus arquivos de planilha não são apagados.

### Onde ficam os dados do programa

`%APPDATA%\Excel Fácil\` (ex.: `C:\Users\Você\AppData\Roaming\Excel Fácil`)

| Pasta/arquivo | Para que serve |
|---|---|
| `recuperacao\` | Cópias automáticas do trabalho ainda não salvo (para recuperar depois de uma queda) |
| `backups\` | Cópia do arquivo anterior, guardada sempre que você salva por cima (até 30) |
| `recentes.json` | Lista de planilhas recentes |
| `configuracoes.json` | Suas preferências |

## Como usar (resumo)

- **Começar:** na tela inicial, clique em **Nova planilha** ou escolha um **modelo pronto**.
- **Digitar:** clique numa célula e digite. `Enter` desce, `Tab` vai para a direita. Dois cliques (ou `F2`) editam a célula.
- **Somar sem fórmula:** selecione os números e clique em **Somar seleção** (guia Início ou Cálculos). O resultado aparece antes de ser inserido.
- **Fórmulas:** comece com `=`, por exemplo `=B2*C2` ou `=SOMA(B2:B10)`. Use `;` entre os itens e `,` para decimais.
- **Salvar:** `Ctrl+S`. O aviso no alto mostra se está tudo salvo.
- **Ajuda:** o botão amarelo **Precisa de ajuda?** tem tutoriais passo a passo e mostra onde fica cada botão.

![Somar seleção](docs/img/04-somar-selecao.png)

## Funcionalidades implementadas

**Tela inicial:** boas-vindas, Nova planilha, Abrir arquivo, Planilhas recentes (com aviso quando o arquivo sumiu), Modelos prontos, Configurações e recuperação de trabalho não salvo.

**Modelos prontos (com fórmulas de verdade):** Planilha em branco, Controle de gastos (total por categoria com SOMASE), Controle de vendas, Lista de clientes (com filtro), Controle de estoque (avisa "Repor"), Orçamento mensal (previsto × real e saldo).

**Editor:**
- Grade desenhada em canvas e virtualizada: só as células visíveis são desenhadas, e a planilha cresce conforme você rola (até 1.048.576 linhas × 16.384 colunas).
- Seleção com mouse e `Shift`; seleção de linhas e colunas inteiras e de tudo; navegação com setas, `Ctrl+setas`, `Home`, `Ctrl+Home/End` e `PageUp/Down`.
- Digitação com acentos (teclas mortas do teclado ABNT2 e IME), edição na célula ou na barra de fórmulas, caixa de endereço (digite `B5` e Enter).
- Copiar, recortar e colar (`Ctrl+C/X/V`), inclusive intervalos, colagem repetida numa área maior, colar só valores (`Ctrl+Shift+V`) ou só formatação, e colar de outros programas (texto com tabulação, decimais brasileiros).
- Desfazer e refazer (`Ctrl+Z/Y`), até 300 passos, inclusive para linhas, colunas, abas, filtros e larguras.
- Inserir e excluir linhas e colunas, com ajuste automático das fórmulas.
- Redimensionar linhas e colunas arrastando; dois cliques ajustam a largura ao conteúdo.
- Alça de preenchimento (arraste o quadradinho): copia fórmulas e continua séries (1, 2 → 3, 4…). Também `Ctrl+D` e `Ctrl+R`.
- Congelar a primeira linha.
- Abas: criar, renomear (duplo clique), duplicar, excluir, mover.
- Zoom de 50% a 200% (barra inferior, `Ctrl+roda` ou `Ctrl +/-`).
- Texto longo transborda para as células vazias ao lado, como no Excel.
- Menu do botão direito em células, linhas e colunas.

**Faixa de opções:**
- **Início:** colar/recortar/copiar, fonte e tamanho, negrito/itálico/sublinhado, cor do texto e de preenchimento, bordas (todas, externa, inferior, superior, nenhuma), alinhamento, quebra de texto, formatos (geral, número, moeda R$, porcentagem, data, texto), casas decimais, Somar seleção e Limpar formatação.
- **Inserir:** linhas, colunas, nova aba, Tabela (cores, listras, filtro), Gráfico (colunas, linhas ou pizza, salvo como imagem PNG) e Inserir função.
- **Cálculos:** Somar seleção, Calcular média, Maior valor, Menor valor, Contar, Porcentagem (parte do total ou X% de um valor), Soma automática e Mais funções.
- **Dados:** ordenar crescente e decrescente (mantendo o cabeçalho), Filtro com lista de valores e busca, Mostrar tudo, Localizar e Substituir (`Ctrl+F` / `Ctrl+H`), Remover duplicados.
- **Exibir:** congelar, zoom, ajustar largura das colunas.
- **Arquivo:** Novo, Abrir, Salvar, Salvar como (`F12`), Exportar PDF, Exportar CSV, Imprimir (com pré-visualização), Configurações e Fechar.

**Fórmulas (motor próprio):** 41 funções em português, referências relativas, absolutas (`F4` alterna o `$`) e entre abas, recálculo incremental, detecção de referência circular, erros explicados em linguagem simples, autocompletar com descrição das funções e clique em células para montar a fórmula. Detalhes e a tabela de tradução estão em [docs/FORMULAS.md](docs/FORMULAS.md).

**Barra de status:** soma, média, menor, maior e quantidade da seleção, sempre visíveis.

**Arquivos:**
- Abrir e salvar `.xlsx`, preservando valores, fórmulas (com o último resultado calculado), negrito/itálico/sublinhado, fonte, cores, alinhamento, quebra de texto, bordas, formatos numéricos, largura de colunas, altura de linhas, linha congelada, filtro e várias abas.
- Importar CSV (detecta `;`, `,` ou tabulação, UTF-8 ou Windows-1252) e exportar CSV (`;` e UTF-8 com BOM, o padrão do Excel em português).
- Exportar PDF e imprimir, com orientação, ajuste à largura, linhas de grade, título e "só a seleção".
- Avisos ao abrir arquivos com recursos não suportados (macros, gráficos, tabelas dinâmicas, vínculos externos, imagens, comentários, células mescladas, formatação condicional, validação de dados).

**Segurança dos seus dados:**
- O arquivo original **nunca** é sobrescrito sem confirmação. Na primeira vez que você salva por cima de um arquivo aberto, o programa pergunta. Se o arquivo tiver recursos que se perderiam, ele recomenda "Salvar uma cópia".
- Escrita atômica: grava num arquivo temporário e só depois troca, então uma queda de energia não corrompe o arquivo.
- Backup automático da versão anterior a cada salvamento por cima.
- Cópia de recuperação automática a cada 30 segundos (configurável), separada do arquivo, e também ao trocar de janela. Depois de uma queda, a tela inicial oferece **Recuperar**.
- Aviso ao fechar com alterações não salvas (Salvar / Não salvar / Cancelar).
- Indicador de salvamento sempre visível.

**Acessibilidade e conforto:** botões grandes com texto, dicas (tooltips) em português, modo **"Grande"** para letras e botões maiores (Configurações), confirmação antes de excluir linhas, colunas e abas com dados, e uma dica para iniciantes no topo da planilha.

## Avisos do Windows (SmartScreen)

O instalador **não tem assinatura digital** (o certificado de assinatura de código é pago). Por isso o Windows SmartScreen pode mostrar "O Windows protegeu o computador" na primeira execução. Clique em **Mais informações → Executar assim mesmo**. Para eliminar o aviso, assine o instalador com um certificado de assinatura de código (configuração `win.certificateFile` / `signtoolOptions` do electron-builder).

## Limitações conhecidas

O objetivo não é copiar toda a complexidade do Excel. Isto **não** está implementado:

- **Células mescladas:** ao abrir, aparecem separadas (o texto fica na primeira célula). Não é possível mesclar.
- **Gráficos dentro da planilha:** o gráfico é gerado como imagem PNG; ele não fica salvo no arquivo. Gráficos de arquivos do Excel não são exibidos.
- **Imagens, formas, comentários, formatação condicional, validação de dados, tabelas dinâmicas e macros:** não são exibidos e se perdem se você salvar por cima (o programa avisa e recomenda salvar uma cópia). **Macros nunca são executadas.**
- **Funções:** 41 funções (lista em [docs/FORMULAS.md](docs/FORMULAS.md)). Não há fórmulas de matriz, `PROCX`, `ÍNDICE/CORRESP`, `INDIRETO`, nomes definidos nem vínculos com outros arquivos. Fórmulas com funções desconhecidas vindas de arquivos mantêm o último valor salvo, sem recalcular.
- **Formatos de número:** geral, número, moeda (R$), porcentagem, data (dd/mm/aaaa) e texto. Formatos personalizados do Excel são mantidos ao salvar se a célula não for reformatada, mas são exibidos de forma aproximada. Horas não têm formato próprio.
- **Bordas:** só linha fina, sem estilos e cores de borda. Cores do "tema" do Excel são convertidas de forma aproximada.
- **Filtro:** filtra por lista de valores. Os critérios de filtro salvos por outros programas não são importados (só a área do filtro). Ordenação por uma coluna de cada vez.
- **Substituir** altera valores digitados, mas não altera textos dentro de fórmulas.
- **Seleção:** um intervalo contínuo por vez (sem `Ctrl+clique` em áreas separadas).
- **Alça de preenchimento:** continua séries numéricas e copia fórmulas, mas não continua meses, dias da semana ou datas.
- **CSV e impressão/PDF** trabalham com a aba atual.
- **Arquivos `.xls`** (Excel 97-2003) não são suportados: abra no Excel e salve como `.xlsx`.
- Uma planilha aberta por vez.
- Limites: arquivos de até 150 MB e 3 milhões de células preenchidas.

## Para desenvolvedores

Requisitos: Windows 10/11, Node.js 22+ (testado com 24.18) e npm.

```bash
npm install
npm run dev        # Vite + Electron com recarga automática
npm test           # 58 testes de unidade (fórmulas, cópia, desfazer, xlsx, csv, desempenho…)
npm run test:e2e   # 25 passos ponta a ponta no aplicativo real (abre janelas)
npm run build      # verificação de tipos + build da interface e do processo principal
npm run dist       # gera release/ExcelFacil-Setup-1.0.0.exe (NSIS) e release/win-unpacked/
npm run icon       # gera build/icon.png e build/icon.ico a partir de build/icon.svg
node scripts/licenses.mjs        # atualiza docs/LICENCAS.md
node tests/e2e/screens.mjs       # atualiza as capturas de tela de docs/img
```

Para testar o executável empacotado: `EXCELFACIL_EXE=caminho\ExcelFacil.exe node tests/e2e/run.mjs`. O build final desliga o fuse de argumentos de inspeção; para testar com o Playwright, gere uma cópia com `npx electron-builder --win dir --config.directories.output=release-test --config.electronFuses.enableNodeCliInspectArguments=true`.

### Tecnologias e licenças

Electron 44 (MIT), React 19 (MIT), TypeScript, Vite 8, Tailwind CSS 4 (MIT), Zustand (MIT), Lucide (ISC), ExcelJS (MIT) para `.xlsx`, electron-builder (MIT) e Vitest + Playwright para testes.

- **HyperFormula não foi usado:** é GPLv3 ou comercial. No lugar, há um motor de fórmulas próprio.
- **Handsontable não foi usado:** é gratuito só para uso não comercial. No lugar, há uma grade própria em canvas.
- Lista completa das licenças distribuídas: [docs/LICENCAS.md](docs/LICENCAS.md). Nenhuma é GPL ou comercial.

### Arquitetura

```
src/core/          Núcleo puro em TypeScript (sem interface), testável em Node
  address.ts         Endereços A1 ⇄ linha/coluna
  model.ts           Células, estilos, abas
  workbook.ts        Pasta de trabalho + desfazer/refazer (transações e fotos)
  engine.ts          Recálculo incremental com índice de dependências
  formula/           Tokenizador, parser, avaliador, tradução pt-BR, reescrita de referências
  format.ts          Números, moeda, datas no padrão brasileiro
  ops.ts             Ordenar, filtrar, localizar, duplicados, preencher, copiar/colar
  templates.ts       Modelos prontos
  io/                xlsx (ExcelJS), csv, html de impressão
src/renderer/      Interface React
  grid/              Grade em canvas (render.ts, Grid.tsx, geometria)
  components/        Tela inicial, faixa de opções, barras, abas, ajuda
  panels/            Cálculo rápido, localizar, filtro, imprimir, gráfico, tabela…
  actions/           Documento (abrir/salvar/recuperar), edição, dados
electron/          Processo principal, preload (API restrita) e worker de arquivos
tests/unit/        Vitest
tests/e2e/         Playwright (_electron)
```

**Segurança do Electron:** `contextIsolation` ligado, `nodeIntegration` desligado e `sandbox` ligado. O preload expõe só funções específicas, e o IPC valida o remetente, os tipos e os caminhos: só se grava em caminhos escolhidos pela pessoa numa janela de diálogo. A CSP é rígida, a navegação e novas janelas são bloqueadas, todas as permissões (câmera, notificações etc.) são negadas e todo acesso à rede é bloqueado. Não há telemetria. A leitura e gravação de `.xlsx` rodam num *worker thread*. Os fuses do Electron estão ligados (sem `RUN_AS_NODE`, sem `NODE_OPTIONS`, sem argumentos de inspeção, só carrega o app de dentro do `app.asar`, com verificação de integridade).

**Desempenho medido (10.000 linhas com fórmulas):** primeiro cálculo em ~200 ms, recálculo depois de uma edição em ~12 ms, ordenação em ~260 ms, gravar `.xlsx` em ~450 ms, abrir no aplicativo em ~0,9 s.

---

"Excel" é marca registrada da Microsoft Corporation. O Excel Fácil é um projeto independente, sem ligação com a Microsoft.
