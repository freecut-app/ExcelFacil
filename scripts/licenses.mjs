// Lista as licenças de tudo que é distribuído com o aplicativo (docs/LICENCAS.md).
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const read = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
const lic = (p) => (typeof p.license === 'string' ? p.license : p.license?.type ?? (p.licenses || []).map((l) => l.type).join(' OR ')) || 'DESCONHECIDA';

// 1) Pacotes embutidos no processo principal (lidos do metafile do esbuild)
const meta = JSON.parse(fs.readFileSync('dist-electron/meta.json', 'utf8'));
const prod = new Map();
for (const input of Object.keys(meta.inputs)) {
  const m = /node_modules[\/]((?:@[^\/]+[\/])?[^\/]+)/.exec(input);
  if (!m) continue;
  const dir = input.slice(0, m.index + m[0].length);
  try {
    const p = read(dir);
    prod.set(`${p.name}@${p.version}`, lic(p));
  } catch {}
}
// 2) Bibliotecas embutidas na interface (bundle do Vite)
const bundled = ['react', 'react-dom', 'scheduler', 'zustand', 'lucide-react', 'use-sync-external-store'].filter((n) => fs.existsSync(path.join('node_modules', n)));
const ui = bundled.map((n) => {
  const p = read(path.join('node_modules', n));
  return [`${p.name}@${p.version}`, lic(p)];
});
const electron = read('node_modules/electron');

const OK = new Set(['MIT', 'MIT/X11', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', '0BSD', 'BlueOak-1.0.0', 'Unlicense', 'CC0-1.0', 'Zlib']);
// "A OR B": basta uma opção permissiva (escolhemos ela). "A AND B": todas precisam ser.
const isOk = (l) => {
  const t = l.replace(/[()]/g, '').trim();
  if (t.includes(' OR ')) return t.split(' OR ').some((x) => OK.has(x.trim()));
  return t.split(' AND ').every((x) => OK.has(x.trim()));
};
const all = [...prod, ...ui];
const bad = all.filter(([, l]) => !isOk(l));
const count = {};
for (const [, l] of all) count[l] = (count[l] ?? 0) + 1;

let md = `# Licenças das dependências\n\nGerado por \`node scripts/licenses.mjs\` em ${new Date().toLocaleDateString('pt-BR')}.\n\n`;
md += `O Excel Fácil é distribuído sob a licença MIT. Todas as bibliotecas distribuídas junto com ele usam licenças permissivas, compatíveis com distribuição gratuita ou comercial (desde que os avisos de licença sejam mantidos).\n\n`;
md += `## Resumo\n\n| Licença | Pacotes |\n|---|---|\n${Object.entries(count).sort((a, b) => b[1] - a[1]).map(([l, n]) => `| ${l} | ${n} |`).join('\n')}\n\n`;
md += bad.length ? `## ⚠ Licenças para revisar\n\n${bad.map(([n, l]) => `- ${n}: ${l}`).join('\n')}\n\n` : `Nenhuma licença restritiva (GPL, AGPL, comercial) encontrada.\n\n`;
md += `Licenças duplas (por exemplo, "MIT OR GPL-3.0") são usadas sob a opção permissiva (MIT). Os avisos de licença das bibliotecas embutidas acompanham o programa em \`dist-electron/xlsx-worker.js.LEGAL.txt\` e nos comentários dos arquivos.

`;
md += `## Bibliotecas descartadas por causa da licença\n\n- **HyperFormula** (motor de fórmulas): GPLv3 ou licença comercial paga. Usá-la obrigaria o aplicativo inteiro a ser GPL. Foi escrito um motor de fórmulas próprio (src/core/formula).\n- **Handsontable** (grade de planilha): licença gratuita só para uso não comercial. Foi escrita uma grade própria em canvas (src/renderer/grid).\n\n`;
md += `## Ambiente de execução\n\n- electron@${electron.version}: ${lic(electron)} (inclui Chromium e Node.js; os avisos de licença ficam em \`LICENSES.chromium.html\` na pasta do programa instalado).\n\n`;
md += `## Embutidas na interface (bundle)\n\n${ui.map(([n, l]) => `- ${n}: ${l}`).join('\n')}\n\n`;
md += `## Embutidas no processo principal (leitura e gravação de .xlsx)\n\n${[...prod].sort().map(([n, l]) => `- ${n}: ${l}`).join('\n')}\n`;
fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/LICENCAS.md', md);
console.log(`Pacotes: ${all.length}. Para revisar: ${bad.length}`);
for (const b of bad) console.log('  revisar:', b.join(' '));
