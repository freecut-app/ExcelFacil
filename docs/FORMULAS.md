# Fórmulas no Excel Fácil

O Excel Fácil tem um motor de fórmulas próprio (pasta `src/core/formula`), escrito do zero. O HyperFormula não foi usado porque sua licença (GPLv3 ou comercial) não combina com a distribuição livre do aplicativo.

## Como a fórmula é guardada

A pessoa **digita e vê** a fórmula em português. Internamente, e dentro do arquivo `.xlsx`, ela é guardada no formato **canônico** do Excel (em inglês). É assim que o próprio Microsoft Excel faz, por isso os arquivos abrem nos dois programas.

| O que a pessoa digita (pt-BR) | Como fica guardado (interno / .xlsx) |
|---|---|
| `=SOMA(B2:B10)` | `SUM(B2:B10)` |
| `=SE(D2>100;"Alto";"Baixo")` | `IF(D2>100,"Alto","Baixo")` |
| `=MÉDIA(A1;2,5)` | `AVERAGE(A1,2.5)` |
| `=SE(A1;VERDADEIRO;FALSO)` | `IF(A1,TRUE,FALSE)` |

A tradução acontece token por token (`src/core/formula/locale.ts`):

| Elemento | Português (exibido) | Interno |
|---|---|---|
| Separador de argumentos | `;` | `,` |
| Separador decimal | `,` (ex.: `2,5`) | `.` (ex.: `2.5`) |
| Verdadeiro / falso | `VERDADEIRO` / `FALSO` | `TRUE` / `FALSE` |
| Textos entre aspas | sem alteração | sem alteração |
| Nomes de aba | sem alteração (`'Minha aba'!A1`) | sem alteração |
| Referências | `A1`, `$A$1`, `A1:B5`, `A:A` | iguais |

Nomes digitados sem acento também são aceitos (`MEDIA`, `MINIMO`, `CONT.NUM`, `NAO`…), assim como os nomes em inglês (`SUM`). A fórmula é sempre mostrada de volta com o nome oficial em português.

Se a pessoa usar vírgula para separar argumentos (`=SOMA(A1,A2)`), aparece a mensagem: **"Use ponto e vírgula (;) para separar os argumentos"**. Parênteses esquecidos no fim são fechados automaticamente.

## Funções suportadas

| Português | Interno | O que faz |
|---|---|---|
| SOMA | SUM | Soma |
| MÉDIA | AVERAGE | Média |
| MÍNIMO | MIN | Menor valor |
| MÁXIMO | MAX | Maior valor |
| CONT.NÚM | COUNT | Conta números |
| CONT.VALORES | COUNTA | Conta células não vazias |
| CONTAR.VAZIO | COUNTBLANK | Conta células vazias |
| SE | IF | Condição |
| SEERRO | IFERROR | Valor alternativo em caso de erro |
| E / OU / NÃO | AND / OR / NOT | Lógica |
| SOMASE | SUMIF | Soma com critério (`">10"`, `"<>0"`, `"Casa"`, curingas `*` e `?`) |
| CONT.SE | COUNTIF | Conta com critério |
| MÉDIASE | AVERAGEIF | Média com critério |
| PROCV | VLOOKUP | Procura na primeira coluna (exata com `FALSO`, aproximada por padrão) |
| ARRED | ROUND | Arredonda |
| ARREDONDAR.PARA.CIMA | ROUNDUP | Arredonda para cima |
| ARREDONDAR.PARA.BAIXO | ROUNDDOWN | Arredonda para baixo |
| INT | INT | Parte inteira |
| ABS | ABS | Valor absoluto |
| RAIZ | SQRT | Raiz quadrada |
| POTÊNCIA | POWER | Potência |
| MOD | MOD | Resto da divisão |
| MULT | PRODUCT | Multiplica |
| MED | MEDIAN | Mediana |
| CONCATENAR / CONCAT | CONCATENATE / CONCAT | Junta textos |
| ESQUERDA / DIREITA / EXT.TEXTO | LEFT / RIGHT / MID | Pedaços de texto |
| NÚM.CARACT | LEN | Tamanho do texto |
| MAIÚSCULA / MINÚSCULA / ARRUMAR | UPPER / LOWER / TRIM | Texto |
| HOJE / AGORA | TODAY / NOW | Data e hora atuais |
| DATA / ANO / MÊS / DIA | DATE / YEAR / MONTH / DAY | Datas |

Operadores: `+ - * / ^ & = <> < > <= >=` e `%` (ex.: `=10%*B2`). A precedência é a mesma do Excel, inclusive `=-2^2` = 4.

## Erros

| Exibido | Interno | Explicação mostrada para a pessoa |
|---|---|---|
| `#DIV/0!` | `#DIV/0!` | Divisão por zero |
| `#VALOR!` | `#VALUE!` | Conta com texto |
| `#REF!` | `#REF!` | Célula ou aba excluída |
| `#NOME?` | `#NAME?` | Nome de função escrito errado |
| `#N/D` | `#N/A` | Valor não encontrado (PROCV) |
| `#NÚM!` | `#NUM!` | Número inválido |
| `#CIRCULAR!` | `#CIRC!` | A fórmula depende dela mesma |

Ao clicar numa célula com erro, a explicação aparece abaixo da barra de fórmulas.

## Recálculo

- Cada fórmula é analisada uma única vez, e as células de que ela depende ficam indexadas.
- Quando uma célula muda, só as fórmulas que dependem dela (direta ou indiretamente) são recalculadas.
- O cálculo usa uma pilha explícita, então cadeias longas (`A2=A1+1`, `A3=A2+1`… 20.000 linhas) não travam.
- Referências circulares são detectadas e mostradas como `#CIRCULAR!`.

## Fórmulas de arquivos .xlsx com funções não suportadas

Se um arquivo usa uma função que o motor não conhece (por exemplo, `PROCX`/`XLOOKUP`), o Excel Fácil **mantém o último resultado salvo no arquivo** e avisa ao abrir. Esse valor não é recalculado.

## Segurança

Nenhuma fórmula é executada como código. O texto vira uma árvore sintática, e só as operações da tabela acima são avaliadas. Não há macros, conexões externas, `INDIRETO` nem funções que acessem arquivos ou a rede.
