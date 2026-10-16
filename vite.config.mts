import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, Plugin } from 'vite';

// Política de segurança de conteúdo (somente na versão final; o modo dev precisa de scripts inline).
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self' about:; object-src 'none'; base-uri 'none'; form-action 'none'";

function csp(): Plugin {
  return {
    name: 'csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), csp()],
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 2000, target: 'chrome130' },
  server: { port: 5183, strictPort: true },
});
