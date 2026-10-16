// Menu flutuante (botão direito e menus suspensos).

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { create } from 'zustand';

export interface MenuItem {
  label?: string;
  icon?: React.ReactNode;
  shortcut?: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  testId?: string;
}

const useMenu = create<{ menu: { x: number; y: number; items: MenuItem[] } | null }>(() => ({ menu: null }));

export function openMenu(x: number, y: number, items: MenuItem[]): void {
  useMenu.setState({ menu: { x, y, items } });
}

export function closeMenu(): void {
  useMenu.setState({ menu: null });
}

export function MenuList({ items, onDone }: { items: MenuItem[]; onDone: () => void }) {
  return (
    <div className="py-1">
      {items.map((it, i) =>
        it.separator ? (
          <div key={i} className="my-1 border-t border-gray-100" />
        ) : (
          <button
            key={i}
            data-testid={it.testId}
            disabled={it.disabled}
            className={`flex w-full items-center gap-3 px-3 py-2 text-left text-[0.92rem] hover:bg-brand-50 disabled:opacity-40 disabled:hover:bg-transparent ${it.danger ? 'text-red-700' : 'text-gray-800'}`}
            onClick={() => {
              onDone();
              it.onClick?.();
            }}
          >
            <span className="flex h-5 w-5 items-center justify-center text-gray-500">{it.icon}</span>
            <span className="flex-1">{it.label}</span>
            {it.shortcut && <span className="text-xs text-gray-400">{it.shortcut}</span>}
          </button>
        ),
      )}
    </div>
  );
}

export function MenuHost() {
  const menu = useMenu((s) => s.menu);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ x: Math.min(menu.x, window.innerWidth - r.width - 8), y: Math.min(menu.y, window.innerHeight - r.height - 8) });
  }, [menu]);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closeMenu();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && closeMenu();
    window.addEventListener('mousedown', close, true);
    window.addEventListener('keydown', key, true);
    window.addEventListener('blur', closeMenu);
    return () => {
      window.removeEventListener('mousedown', close, true);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', closeMenu);
    };
  }, [menu]);
  if (!menu) return null;
  return (
    <div ref={ref} className="anim-in fixed z-[90] min-w-[240px] rounded-xl border border-gray-200 bg-white shadow-xl" style={{ left: pos.x, top: pos.y }} role="menu">
      <MenuList items={menu.items} onDone={closeMenu} />
    </div>
  );
}

