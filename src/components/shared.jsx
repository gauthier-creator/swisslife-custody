import { useState, useEffect } from 'react';

/* ═══════════════════════════════════════════════════════
   Shared primitives — Linear-inspired, fintech-grade
   ═══════════════════════════════════════════════════════ */

// ─── Toasts ───────────────────────────────────────────
export function useToast() {
  const [toasts, setToasts] = useState([]);
  const addToast = (msg, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3200);
  };
  return { toasts, toast: addToast };
}

export function ToastContainer({ toasts }) {
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
      {toasts.map(t => (
        <div
          key={t.id}
          className="bg-[#18181B] text-white px-4 py-2.5 text-[13px] font-medium rounded-md shadow-lg animate-slide-up"
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ─── Form primitives ──────────────────────────────────
export const inputCls =
  "w-full h-9 px-3 text-[13px] text-[#09090B] bg-white border border-[rgba(9,9,11,0.1)] rounded-md outline-none transition-colors focus:border-[rgba(9,9,11,0.3)] focus:ring-2 focus:ring-[rgba(9,9,11,0.06)] placeholder:text-[#A1A1AA]";

export const selectCls =
  "w-full h-9 px-3 pr-8 text-[13px] text-[#09090B] bg-white border border-[rgba(9,9,11,0.1)] rounded-md outline-none transition-colors focus:border-[rgba(9,9,11,0.3)] focus:ring-2 focus:ring-[rgba(9,9,11,0.06)] appearance-none cursor-pointer";

export const textareaCls =
  "w-full px-3 py-2 text-[13px] text-[#09090B] bg-white border border-[rgba(9,9,11,0.1)] rounded-md outline-none transition-colors focus:border-[rgba(9,9,11,0.3)] focus:ring-2 focus:ring-[rgba(9,9,11,0.06)] placeholder:text-[#A1A1AA] resize-none";

export const labelCls = "block text-[12px] font-medium text-[#52525B] mb-1.5";

// ─── Format helpers ───────────────────────────────────
export const fmtEUR = (n) =>
  Number(n || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
export const fmtUSD = (n) =>
  Number(n || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

// ─── Button ───────────────────────────────────────────
export function Button({ variant = 'primary', size = 'md', children, className = '', ...props }) {
  const variants = {
    primary:
      'bg-[#18181B] text-white border border-[#18181B] hover:bg-[#27272A] hover:border-[#27272A]',
    secondary:
      'bg-white text-[#09090B] border border-[rgba(9,9,11,0.1)] hover:bg-[#FAFAFA] hover:border-[rgba(9,9,11,0.15)]',
    ghost:
      'bg-transparent text-[#52525B] border border-transparent hover:bg-[#F4F4F5] hover:text-[#09090B]',
    danger:
      'bg-[#EF4444] text-white border border-[#EF4444] hover:bg-[#DC2626] hover:border-[#DC2626]',
    link:
      'bg-transparent text-[#09090B] border-0 hover:underline px-0 h-auto',
  };
  const sizes = {
    sm: 'h-7 px-2.5 text-[12px]',
    md: 'h-8 px-3 text-[13px]',
    lg: 'h-9 px-3.5 text-[13px]',
  };
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 font-medium rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${variants[variant]} ${variant !== 'link' ? sizes[size] : ''} ${className}`}
    >
      {children}
    </button>
  );
}

// ─── Badge ────────────────────────────────────────────
export function Badge({ children, variant = 'default', dot = false }) {
  const styles = {
    default: 'bg-[#F4F4F5] text-[#52525B] border-[rgba(9,9,11,0.06)]',
    success: 'bg-[#ECFDF5] text-[#047857] border-[rgba(16,185,129,0.2)]',
    warning: 'bg-[#FFFBEB] text-[#B45309] border-[rgba(245,158,11,0.25)]',
    error:   'bg-[#FEF2F2] text-[#B91C1C] border-[rgba(239,68,68,0.2)]',
    info:    'bg-[#EFF6FF] text-[#1D4ED8] border-[rgba(59,130,246,0.2)]',
    gold:    'bg-[#FEF3C7] text-[#92400E] border-[rgba(180,83,9,0.2)]',
  };
  const dotColors = {
    default: 'bg-[#A1A1AA]',
    success: 'bg-[#10B981]',
    warning: 'bg-[#F59E0B]',
    error:   'bg-[#EF4444]',
    info:    'bg-[#3B82F6]',
    gold:    'bg-[#B45309]',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium rounded-md border ${styles[variant] || styles.default}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant] || dotColors.default}`} />}
      {children}
    </span>
  );
}

// ─── Card ─────────────────────────────────────────────
export function Card({ children, className = '', ...props }) {
  return (
    <div
      {...props}
      className={`bg-white border border-[rgba(9,9,11,0.08)] rounded-lg ${className}`}
    >
      {children}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────
export function Modal({ isOpen, onClose, title, subtitle, children, maxWidth = 'max-w-lg' }) {
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  if (!isOpen) return null;
  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-40 animate-fade"
        onClick={onClose}
      />
      <div
        className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white z-50 w-[calc(100%-2rem)] ${maxWidth} max-h-[85vh] rounded-lg shadow-2xl flex flex-col animate-scale border border-[rgba(9,9,11,0.08)]`}
      >
        {(title || subtitle) && (
          <header className="px-6 pt-5 pb-4 border-b border-[rgba(9,9,11,0.08)] flex items-start justify-between gap-4">
            <div>
              {title && <h2 className="text-[15px] font-semibold text-[#09090B] tracking-tight">{title}</h2>}
              {subtitle && <p className="mt-1 text-[12px] text-[#71717A] leading-relaxed">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center text-[#71717A] hover:text-[#09090B] hover:bg-[#F4F4F5] rounded-md transition-colors -mr-1"
              aria-label="Fermer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </header>
        )}
        <div className="px-6 py-5 overflow-y-auto">{children}</div>
      </div>
    </>
  );
}

// ─── Empty state ──────────────────────────────────────
export function EmptyState({ title, description, action, icon }) {
  return (
    <div className="text-center py-16 px-6">
      {icon && (
        <div className="w-10 h-10 rounded-lg bg-[#F4F4F5] flex items-center justify-center mx-auto mb-4">
          {icon}
        </div>
      )}
      <p className="text-[14px] font-semibold text-[#09090B]">{title}</p>
      {description && (
        <p className="text-[13px] text-[#71717A] mt-1.5 max-w-sm mx-auto leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ─── Spinner ──────────────────────────────────────────
export function Spinner({ size = 'w-4 h-4' }) {
  return (
    <span
      className={`${size} inline-block border-2 border-[rgba(9,9,11,0.1)] border-t-[#09090B] rounded-full animate-spin`}
    />
  );
}

// ─── StatCell — KPI strip cell ───────────────────────
export function StatCell({ label, value, sub, className = '' }) {
  return (
    <div className={`px-5 py-3.5 ${className}`}>
      <p className="text-[11px] font-medium text-[#71717A] uppercase tracking-wider mb-1">{label}</p>
      <p className="text-[14px] font-semibold text-[#09090B] tabular-nums truncate">{value || '—'}</p>
      {sub && <p className="text-[11px] text-[#A1A1AA] mt-0.5 truncate">{sub}</p>}
    </div>
  );
}
