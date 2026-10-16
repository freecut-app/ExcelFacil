import { FilePlus2, FolderOpen, History, LifeBuoy, PiggyBank, Package, Settings, ShoppingCart, Trash2, Users, Wallet, FileSpreadsheet, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { TEMPLATES } from '../../core/templates';
import { RecentFile, RecoveryInfo } from '../../shared/api';
import { newDocument, openFile, recoverDocument } from '../actions/document';
import { confirm } from '../dialogs';
import { setState } from '../store';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = { FilePlus2, Wallet, ShoppingCart, Users, Package, PiggyBank };

function when(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay ? `hoje às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function Home() {
  const [recent, setRecent] = useState<RecentFile[]>([]);
  const [recovery, setRecovery] = useState<RecoveryInfo[]>([]);
  const load = async () => {
    setRecent(await window.api.recentList());
    setRecovery(await window.api.recoveryList());
  };
  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-brand-50 to-white" data-testid="home">
      <div className="mx-auto max-w-[1080px] px-6 py-8">
        <div className="flex items-center gap-4">
          <img src="./icon.svg" alt="" className="h-14 w-14" />
          <div className="flex-1">
            <h1 className="text-[2rem] font-bold text-brand-900">Bem-vindo ao Excel Fácil</h1>
            <p className="text-[1.02rem] text-gray-600">Planilhas simples, em português, que funcionam sem internet.</p>
          </div>
          <button className="flex items-center gap-2 rounded-lg px-3 py-2 text-gray-600 hover:bg-white" onClick={() => setState({ panel: { type: 'settings' } })} data-testid="home-settings" title="Configurações">
            <Settings className="h-5 w-5" /> Configurações
          </button>
          <button className="flex items-center gap-2 rounded-lg bg-amber-400 px-3 py-2 font-medium text-gray-900 hover:bg-amber-300" onClick={() => setState({ helpOpen: true })} title="Instruções passo a passo">
            <LifeBuoy className="h-5 w-5" /> Precisa de ajuda?
          </button>
        </div>

        {recovery.length > 0 && (
          <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-4" data-testid="recovery-banner">
            <div className="flex items-center gap-2 font-semibold text-amber-900">
              <History className="h-5 w-5" /> Encontramos alterações que não foram salvas
            </div>
            <p className="mt-1 text-sm text-amber-900/80">O programa foi fechado antes de salvar. Você pode recuperar o trabalho:</p>
            <div className="mt-3 space-y-2">
              {recovery.map((r) => (
                <div key={r.docId} className="flex items-center gap-3 rounded-xl bg-white px-4 py-2 shadow-sm">
                  <FileSpreadsheet className="h-5 w-5 text-brand-600" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{r.title}</div>
                    <div className="text-xs text-gray-500">Cópia de {when(r.savedAt)}{r.filePath ? ` • ${r.filePath}` : ''}</div>
                  </div>
                  <button className="h-9 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700" onClick={() => void recoverDocument(r.docId)} data-testid="btn-recover">
                    Recuperar
                  </button>
                  <button
                    className="h-9 rounded-lg px-3 text-sm text-gray-600 hover:bg-gray-100"
                    onClick={async () => {
                      if (await confirm({ title: 'Descartar as alterações?', message: `As alterações de "${r.title}" que não foram salvas serão apagadas.`, confirmLabel: 'Descartar', danger: true })) {
                        await window.api.recoveryDelete(r.docId);
                        void load();
                      }
                    }}
                  >
                    Descartar
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <button
            className="flex items-center gap-5 rounded-2xl bg-brand-600 px-6 py-6 text-left text-white shadow-lg shadow-brand-600/25 transition hover:-translate-y-0.5 hover:bg-brand-700"
            onClick={() => void newDocument('blank')}
            data-testid="btn-new"
          >
            <FilePlus2 className="h-12 w-12 shrink-0" />
            <span>
              <span className="block text-[1.4rem] font-semibold">Nova planilha</span>
              <span className="block text-white/85">Começar do zero, em branco</span>
            </span>
          </button>
          <button
            className="flex items-center gap-5 rounded-2xl border-2 border-brand-200 bg-white px-6 py-6 text-left text-brand-900 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-400"
            onClick={() => void openFile()}
            data-testid="btn-open"
          >
            <FolderOpen className="h-12 w-12 shrink-0 text-brand-600" />
            <span>
              <span className="block text-[1.4rem] font-semibold">Abrir arquivo</span>
              <span className="block text-gray-600">Planilhas do Excel (.xlsx) ou CSV</span>
            </span>
          </button>
        </div>

        <h2 className="mt-10 text-[1.2rem] font-semibold text-gray-800">Modelos prontos</h2>
        <p className="text-sm text-gray-500">Já vêm com cabeçalhos, cores e fórmulas. É só preencher.</p>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
          {TEMPLATES.map((t) => {
            const Ico = ICONS[t.icon] ?? FileSpreadsheet;
            return (
              <button
                key={t.id}
                className="group flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
                onClick={() => void newDocument(t.id)}
                data-testid={`tpl-${t.id}`}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 group-hover:bg-brand-100">
                  <Ico className="h-6 w-6" />
                </span>
                <span>
                  <span className="block font-semibold text-gray-900">{t.title}</span>
                  <span className="block text-sm text-gray-500">{t.description}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-10 flex items-center justify-between">
          <h2 className="text-[1.2rem] font-semibold text-gray-800">Planilhas recentes</h2>
          {recent.length > 0 && (
            <button
              className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-gray-500 hover:bg-gray-100"
              onClick={async () => {
                if (await confirm({ title: 'Limpar a lista de recentes?', message: 'Os arquivos não serão apagados, só a lista.', confirmLabel: 'Limpar lista' })) {
                  await window.api.recentClear();
                  void load();
                }
              }}
            >
              <Trash2 className="h-4 w-4" /> Limpar lista
            </button>
          )}
        </div>
        {recent.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-gray-300 bg-white/60 p-6 text-center text-gray-500">
            As planilhas que você abrir ou salvar vão aparecer aqui.
          </p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-2xl border border-gray-200 bg-white" data-testid="recent-list">
            {recent.map((r) => (
              <div key={r.path} className="flex items-center gap-3 border-b border-gray-100 px-4 py-2.5 last:border-b-0 hover:bg-brand-50/50">
                <FileSpreadsheet className={`h-6 w-6 shrink-0 ${r.exists ? 'text-brand-600' : 'text-gray-300'}`} />
                <button className="min-w-0 flex-1 text-left disabled:cursor-not-allowed" disabled={!r.exists} onClick={() => void openFile(r.path)} title={r.path}>
                  <div className={`truncate font-medium ${r.exists ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{r.name}</div>
                  <div className="truncate text-xs text-gray-500">{r.exists ? r.path : 'Arquivo não encontrado (foi movido ou apagado)'}</div>
                </button>
                <span className="hidden shrink-0 text-xs text-gray-400 sm:block">{when(r.openedAt)}</span>
                <button
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  title="Tirar da lista (o arquivo não é apagado)"
                  aria-label="Tirar da lista"
                  onClick={async () => {
                    await window.api.recentRemove(r.path);
                    void load();
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="mt-10 text-center text-xs text-gray-400">
          Excel Fácil {window.api?.version} • funciona 100% no seu computador, sem internet e sem cadastro.
        </p>
      </div>
    </div>
  );
}
