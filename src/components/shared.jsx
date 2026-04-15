import { useState, useEffect } from 'react';

/* ═══════════════════════════════════════════════════════
   Shared primitives — quiet craft
   ═══════════════════════════════════════════════════════ */

// ─── Toasts ───────────────────────────────────────────
export function useToast() {
  const [toasts, setToasts] = useState([]);
  const addToast = (msg, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3600);
  };
  return { toasts, toast: addToast };
}

export function ToastContainer({ toasts }) {
  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2">
      {toasts.map(t => (
        <div
          key={t.id}
          className="bg-[#0B0B0C] text-[#FAFAF7] px-5 py-3 text-[13px] tracking-tight animate-rise"
          style={{ borderRadius: '2px' }}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ─── Form primitives ──────────────────────────────────
export const inputCls =
  "w-full px-0 py-3 text-[15px] text-[#0B0B0C] bg-transparent border-0 border-b border-[rgba(11,11,12,0.16)] outline-none transition-colors focus:border-[#0B0B0C] placeholder:text-[#A8A8AD] placeholder:font-light";

export const selectCls =
  "w-full px-0 py-3 text-[15px] text-[#0B0B0C] bg-transparent border-0 border-b border-[rgba(11,11,12,0.16)] outline-none transition-colors focus:border-[#0B0B0C] appearance-none cursor-pointer";

export const labelCls = "eyebrow block mb-2";

// ─── Format helpers ───────────────────────────────────
export const fmtEUR = (n) =>
  Number(n || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
export const fmtUSD = (n) =>
  Number(n || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

// ─── Button — three intents, no more ──────────────────
export function Button({ variant = 'primary', children, className = '', ...props }) {
  const variants = {
    primary:
      'bg-[#0B0B0C] text-[#FAFAF7] hover:bg-[#2C2C2E]',
    ghost:
      'bg-transparent text-[#0B0B0C] hover:bg-[rgba(11,11,12,0.04)]',
    outline:
      'bg-transparent text-[#0B0B0C] border border-[rgba(11,11,12,0.16)] hover:border-[#0B0B0C]',
  };
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 text-[13px] font-medium tracking-tight transition-all disabled:opacity-30 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      style={{ borderRadius: '2px' }}
    >
      {children}
    </button>
  );
}

// ─── Badge — restrained, typographic ──────────────────
export function Badge({ children, variant = 'default' }) {
  const styles = {
    default: 'text-[#6B6B70]',
    success: 'text-[#2E5D4F]',
    warning: 'text-[#8A4A1B]',
    error: 'text-[#7A2424]',
    info: 'text-[#6B6B70]',
    gold: 'text-[#8A6F3D]',
  };
  const dots = {
    default: 'bg-[#A8A8AD]',
    success: 'bg-[#2E5D4F]',
    warning: 'bg-[#8A4A1B]',
    error: 'bg-[#7A2424]',
    info: 'bg-[#A8A8AD]',
    gold: 'bg-[#8A6F3D]',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium tracking-wide ${styles[variant] || styles.default}`}>
      <span className={`w-1 h-1 rounded-full ${dots[variant] || dots.default}`} />
      {children}
    </span>
  );
}

// ─── Modal — quiet, editorial ─────────────────────────
export function Modal({ isOpen, onClose, title, subtitle, children, maxWidth = 'max-w-xl' }) {
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
        className="fixed inset-0 bg-[rgba(11,11,12,0.4)] z-40 animate-fade"
        onClick={onClose}
        style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
      />
      <div
        className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#FAFAF7] z-50 w-[calc(100%-2rem)] ${maxWidth} max-h-[88vh] overflow-hidden flex flex-col animate-scale`}
        style={{ borderRadius: '2px' }}
      >
        <header className="px-10 pt-10 pb-6 flex items-start justify-between gap-6">
          <div>
            {title && (
              <h2 className="font-display text-[26px] leading-[1.15] text-[#0B0B0C]">{title}</h2>
            )}
            {subtitle && (
              <p className="mt-2 text-[13px] text-[#6B6B70] max-w-md">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-[#6B6B70] hover:text-[#0B0B0C] transition-colors -mr-2 -mt-2"
            aria-label="Fermer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.25}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>
        <div className="px-10 pb-10 overflow-y-auto">{children}</div>
      </div>
    </>
  );
}

// ─── Empty state — editorial silence ──────────────────
export function EmptyState({ title, description, action }) {
  return (
    <div className="text-center py-24 px-6 animate-fade">
      <p className="font-display text-[22px] text-[#0B0B0C] leading-tight">{title}</p>
      {description && (
        <p className="text-[13px] text-[#6B6B70] mt-3 max-w-sm mx-auto leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

// ─── Spinner — slow, deliberate ───────────────────────
export function Spinner({ size = 'w-4 h-4' }) {
  return (
    <span
      className={`${size} inline-block border border-[rgba(11,11,12,0.1)] border-t-[#0B0B0C] rounded-full animate-spin`}
      style={{ animationDuration: '1.1s' }}
    />
  );
}

// ─── Rule — horizontal hairline with optional label ──
export function Rule({ children, className = '' }) {
  if (!children) {
    return <div className={`border-t border-[rgba(11,11,12,0.08)] ${className}`} />;
  }
  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <div className="flex-1 border-t border-[rgba(11,11,12,0.08)]" />
      <span className="eyebrow">{children}</span>
      <div className="flex-1 border-t border-[rgba(11,11,12,0.08)]" />
    </div>
  );
}

// ─── Datum — a label / value pair ─────────────────────
export function Datum({ label, value, className = '' }) {
  return (
    <div className={className}>
      <p className="eyebrow mb-1.5">{label}</p>
      <p className="text-[14px] text-[#0B0B0C] tabular">{value || '—'}</p>
    </div>
  );
}
