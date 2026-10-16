# Licenças das dependências

Gerado por `node scripts/licenses.mjs` em 16/10/2026.

O Excel Fácil é distribuído sob a licença MIT. Todas as bibliotecas distribuídas junto com ele usam licenças permissivas, compatíveis com distribuição gratuita ou comercial (desde que os avisos de licença sejam mantidos).

## Resumo

| Licença | Pacotes |
|---|---|
| MIT | 51 |
| ISC | 10 |
| Apache-2.0 | 2 |
| (MIT OR GPL-3.0-or-later) | 1 |
| (MIT AND Zlib) | 1 |

Nenhuma licença restritiva (GPL, AGPL, comercial) encontrada.

Licenças duplas (por exemplo, "MIT OR GPL-3.0") são usadas sob a opção permissiva (MIT). Os avisos de licença das bibliotecas embutidas acompanham o programa em `dist-electron/xlsx-worker.js.LEGAL.txt` e nos comentários dos arquivos.

## Bibliotecas descartadas por causa da licença

- **HyperFormula** (motor de fórmulas): GPLv3 ou licença comercial paga. Usá-la obrigaria o aplicativo inteiro a ser GPL. Foi escrito um motor de fórmulas próprio (src/core/formula).
- **Handsontable** (grade de planilha): licença gratuita só para uso não comercial. Foi escrita uma grade própria em canvas (src/renderer/grid).

## Ambiente de execução

- electron@44.8.0: MIT (inclui Chromium e Node.js; os avisos de licença ficam em `LICENSES.chromium.html` na pasta do programa instalado).

## Embutidas na interface (bundle)

- react@19.3.1: MIT
- react-dom@19.3.1: MIT
- scheduler@0.28.0: MIT
- zustand@5.0.15: MIT
- lucide-react@1.58.0: ISC

## Embutidas no processo principal (leitura e gravação de .xlsx)

- @fast-csv/format@4.3.5: MIT
- @fast-csv/parse@4.3.6: MIT
- archiver-utils@2.1.0: MIT
- archiver@5.3.2: MIT
- async@3.2.6: MIT
- balanced-match@1.0.2: MIT
- bl@4.1.0: MIT
- brace-expansion@1.1.21: MIT
- buffer-crc32@0.2.13: MIT
- compress-commons@4.1.2: MIT
- concat-map@0.0.1: MIT
- core-util-is@1.0.3: MIT
- crc-32@1.2.2: Apache-2.0
- crc32-stream@4.0.3: MIT
- dayjs@1.11.23: MIT
- end-of-stream@1.4.5: MIT
- exceljs@4.4.0: MIT
- fast-csv@4.3.6: MIT
- fs-constants@1.0.0: MIT
- fs.realpath@1.0.0: ISC
- glob@7.2.3: ISC
- graceful-fs@4.2.11: ISC
- immediate@3.0.6: MIT
- inflight@1.0.6: ISC
- inherits@2.0.4: ISC
- jszip@3.10.2: (MIT OR GPL-3.0-or-later)
- lazystream@1.0.1: MIT
- lie@3.3.0: MIT
- lodash.defaults@4.2.0: MIT
- lodash.difference@4.5.0: MIT
- lodash.escaperegexp@4.1.2: MIT
- lodash.flatten@4.4.0: MIT
- lodash.groupby@4.6.0: MIT
- lodash.isboolean@3.0.3: MIT
- lodash.isequal@4.5.0: MIT
- lodash.isfunction@3.0.9: MIT
- lodash.isnil@4.0.0: MIT
- lodash.isplainobject@4.0.6: MIT
- lodash.isundefined@3.0.1: MIT
- lodash.union@4.6.0: MIT
- lodash.uniq@4.5.0: MIT
- minimatch@3.1.5: ISC
- normalize-path@3.0.0: MIT
- once@1.4.0: ISC
- pako@1.0.11: (MIT AND Zlib)
- path-is-absolute@1.0.1: MIT
- process-nextick-args@2.0.1: MIT
- readable-stream@3.6.2: MIT
- readdir-glob@1.1.3: Apache-2.0
- safe-buffer@5.2.1: MIT
- saxes@5.0.1: ISC
- setimmediate@1.0.5: MIT
- string_decoder@1.3.0: MIT
- tar-stream@2.2.0: MIT
- tmp@0.2.7: MIT
- util-deprecate@1.0.2: MIT
- uuid@11.1.1: MIT
- wrappy@1.0.2: ISC
- xmlchars@2.2.0: MIT
- zip-stream@4.1.1: MIT
