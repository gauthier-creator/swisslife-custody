import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Kbd } from './shared';

/* ═══════════════════════════════════════════════════════
   Command Palette — ⌘K navigation & search
   Linear/Mercury-style, warm paper, bronze accent
   ═══════════════════════════════════════════════════════ */

// Groups declared once so they stay stable across renders
const DEFAULT_GROUPS = [
  {
    id: 'navigate',
    label: 'Navigation',
    items: [
      { id: 'clients',    title: 'Clients',       hint: 'Dossiers custody',              section: 'clients',    shortcut: ['G', 'C'], icon: 'users' },
      { id: 'wallets',    title: 'Wallets',       hint: 'Portefeuilles MPC · DFNS',      section: 'wallets',    shortcut: ['G', 'W'], icon: 'wallet' },
      { id: 'compliance', title: 'Compliance',    hint: 'Alertes · rapports Tracfin',    section: 'compliance', shortcut: ['G', 'M'], icon: 'shield' },
      { id: 'policies',   title: 'Policies',      hint: 'Règles du Policy Engine',       section: 'policies',   shortcut: ['G', 'P'], icon: 'book' },
    ],
  },
  {
    id: 'admin',
    label: 'Administration',
    adminOnly: true,
    items: [
      { id: 'config', title: 'Configuration', hint: 'Connecteurs · clés API', section: 'config', icon: 'cog' },
    ],
  },
  {
    id: 'actions',
    label: 'Actions rapides',
    items: [
      { id: 'doc-contract',  title: 'Documentation DFNS',   hint: 'docs.dfns.co',               href: 'https://docs.dfns.co', icon: 'link' },
      { id: 'doc-chain',     title: 'Chainalysis Public API', hint: 'public.chainalysis.com',  href: 'https://public.chainalysis.com/api/v1/', icon: 'link' },
      { id: 'doc-amf',       title: 'AMF · Règlement PSAN', hint: 'amf-france.org',             href: 'https://www.amf-france.org/fr/espace-professionnels/fintech/mes-relations-avec-lamf/obtenir-un-agrement-ou-un-enregistrement-de-psan', icon: 'link' },
    ],
  },
];

function Icon({ name }) {
  const common = { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'users':  return <svg {...common}><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c0-3.2 2.5-5.2 5.5-5.2s5.5 2 5.5 5.2" /><circle cx="16.5" cy="9" r="2.4" /><path d="M20.5 18c0-2.4-1.8-3.8-4-3.8" /></svg>;
    case 'wallet': return <svg {...common}><rect x="3" y="6" width="18" height="13" rx="2.2" /><path d="M3 9h18" /><circle cx="16.5" cy="14" r="1.2" fill="currentColor" /></svg>;
    case 'shield': return <svg {...common}><path d="M12 3.2 19.5 6 v6.5 c0 4-3.2 7.2-7.5 8.3 -4.3-1.1-7.5-4.3-7.5-8.3 V6 Z" /><path d="M9.2 12.2 L11.4 14.4 L15.2 10.2" /></svg>;
    case 'book':   return <svg {...common}><path d="M5 4 h10 a3 3 0 0 1 3 3 v13 H8 a3 3 0 0 1 -3 -3 Z" /><path d="M5 17 a3 3 0 0 1 3 -3 h10" /></svg>;
    case 'cog':    return <svg {...common}><circle cx="12" cy="12" r="2.8" /><path d="M12 3 v2 M12 19 v2 M4.2 4.2 l1.5 1.5 M18.3 18.3 l1.5 1.5 M3 12 h2 M19 12 h2 M4.2 19.8 l1.5 -1.5 M18.3 5.7 l1.5 -1.5" /></svg>;
    case 'link':   return <svg {...common}><path d="M10 14 a4 4 0 0 0 5.7 0 l3 -3 a4 4 0 0 0 -5.7 -5.7 l -1 1" /><path d="M14 10 a4 4 0 0 0 -5.7 0 l -3 3 a4 4 0 0 0 5.7 5.7 l 1 -1" /></svg>;
    default:       return <svg {...common}><circle cx="12" cy="12" r="6" /></svg>;
  }
}

// Simple fuzzy scoring: +100 exact, +50 starts-with, +25 word-start, +5 contains
function score(item, q) {
  if (!q) return 1;
  const hay = `${item.title} ${item.hint || ''}`.toLowerCase();
  const needle = q.toLowerCase().trim();
  if (!needle) return 1;
  if (hay === needle) return 1000;
  if (hay.startsWith(needle)) return 500;
  const words = hay.split(/\s+/);
  if (words.some(w => w.startsWith(needle))) return 300;
  if (hay.includes(needle)) return 120;
  // character-in-order fuzzy
  let i = 0, matched = 0;
  for (const ch of hay) {
    if (ch === needle[i]) { i++; matched++; if (i >= needle.length) break; }
  }
  return i >= needle.length ? 30 + matched : 0;
}

export default function CommandPalette({ open, onClose, onNavigate, isAdmin = false }) {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Build flat indexed results, respecting adminOnly
  const { groups, flat } = useMemo(() => {
    const visibleGroups = DEFAULT_GROUPS
      .filter(g => !g.adminOnly || isAdmin)
      .map(g => {
        const scored = g.items
          .map(it => ({ ...it, _score: score(it, query) }))
          .filter(it => it._score > 0)
          .sort((a, b) => b._score - a._score);
        return { ...g, items: scored };
      })
      .filter(g => g.items.length > 0);

    const flatList = [];
    visibleGroups.forEach(g => g.items.forEach(it => flatList.push({ ...it, group: g.label })));
    return { groups: visibleGroups, flat: flatList };
  }, [query, isAdmin]);

  // Reset active on query change
  useEffect(() => { setActiveIdx(0); }, [query]);

  // Focus input when opening
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Scroll active row into view
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector(`[data-cmdk-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx, open]);

  const runItem = useCallback((item) => {
    if (!item) return;
    if (item.href) {
      window.open(item.href, '_blank', 'noopener,noreferrer');
    } else if (item.section) {
      onNavigate?.(item.section);
    }
    onClose?.();
  }, [onNavigate, onClose]);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose?.(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, flat.length - 1)); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); return; }
    if (e.key === 'Enter')     { e.preventDefault(); runItem(flat[activeIdx]); return; }
  };

  if (!open) return null;

  let flatCursor = -1;

  return (
    <>
      <div
        className="fixed inset-0 z-[60] cmdk-overlay animate-fade"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Palette de commandes"
        className="fixed left-1/2 top-[14vh] -translate-x-1/2 z-[61] w-[calc(100%-2rem)] max-w-[620px] cmdk-surface animate-cmdk-rise overflow-hidden"
        onKeyDown={onKeyDown}
      >
        {/* Header · search */}
        <div className="flex items-center gap-3 px-5 h-[60px] border-b border-[#E9E4D9]">
          <svg className="w-4 h-4 text-[#8A8278] flex-shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8.8" cy="8.8" r="5.4" />
            <path d="M13 13 l4 4" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Aller à… clients, wallets, compliance"
            className="flex-1 h-full bg-transparent outline-none text-[15px] text-[#0A0A0A] placeholder:text-[#8A8278] tracking-[-0.01em]"
            autoComplete="off"
            spellCheck="false"
          />
          <div className="flex items-center gap-1.5 flex-shrink-0 pl-2 border-l border-[#E9E4D9]">
            <Kbd>esc</Kbd>
          </div>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          className="max-h-[52vh] overflow-y-auto px-2 py-2"
        >
          {groups.length === 0 && (
            <div className="px-4 py-10 text-center">
              <p className="text-[13px] font-medium text-[#0A0A0A] tracking-[-0.01em]">Aucun résultat</p>
              <p className="text-[12px] text-[#5D5D5D] mt-1">Essayez <span className="font-display italic text-[#7C5E3C]">clients</span>, <span className="font-display italic text-[#7C5E3C]">wallets</span> ou <span className="font-display italic text-[#7C5E3C]">compliance</span></p>
            </div>
          )}

          {groups.map((g) => (
            <div key={g.id} className="mb-1">
              <p className="px-3 pt-3 pb-1.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-[#8A8278]">{g.label}</p>
              <ul>
                {g.items.map((it) => {
                  flatCursor += 1;
                  const idx = flatCursor;
                  const active = idx === activeIdx;
                  return (
                    <li
                      key={it.id}
                      data-cmdk-idx={idx}
                      onMouseEnter={() => setActiveIdx(idx)}
                      onClick={() => runItem(it)}
                      className={`flex items-center gap-3 px-3 h-[46px] rounded-[10px] cursor-pointer select-none transition-colors ${
                        active ? 'bg-[#F5F3EE]' : ''
                      }`}
                    >
                      <span className={`w-8 h-8 flex items-center justify-center rounded-[8px] flex-shrink-0 transition-colors ${active ? 'bg-white border border-[#E9E4D9] text-[#7C5E3C]' : 'bg-[#F5F3EE] text-[#1E1E1E] border border-transparent'}`}>
                        <Icon name={it.icon} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13.5px] font-medium text-[#0A0A0A] truncate tracking-[-0.01em]">{it.title}</p>
                        {it.hint && <p className="text-[11.5px] text-[#5D5D5D] truncate mt-0.5 tracking-[-0.003em]">{it.hint}</p>}
                      </div>
                      {active && (
                        <span className="text-[11px] font-medium text-[#7C5E3C] tracking-[-0.003em] flex items-center gap-1.5">
                          Ouvrir
                          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6 h6 M6 3 l3 3 -3 3" />
                          </svg>
                        </span>
                      )}
                      {!active && it.shortcut && (
                        <div className="flex items-center gap-1 text-[10px] text-[#8A8278]">
                          {it.shortcut.map((k, i) => <Kbd key={i}>{k}</Kbd>)}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 h-[44px] border-t border-[#E9E4D9] bg-white text-[11px] text-[#5D5D5D] tracking-[-0.003em]">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> naviguer</span>
            <span className="flex items-center gap-1.5"><Kbd>↵</Kbd> ouvrir</span>
          </div>
          <span className="flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-[#7C5E3C]" />
            <span className="uppercase tracking-[0.08em] font-medium text-[#8A8278]">SwissLife Custody</span>
          </span>
        </div>
      </div>
    </>
  );
}
