import { useState, useEffect, useRef } from 'react';

// Toast system
export function useToast() {
  const [toasts, setToasts] = useState([]);
  const addToast = (msg, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  };
  return { toasts, toast: addToast };
}

export function ToastContainer({ toasts }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 space-y-2">
      {toasts.map(t => (
        <div key={t.id} className="bg-[#0F0F10] text-white px-4 py-2.5 rounded-xl text-[13px] font-medium shadow-lg animate-fade-in-up max-w-sm">
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// Input styles
export const inputCls = "w-full px-3.5 py-2.5 text-[14px] text-[#0F0F10] bg-white border border-[rgba(0,0,29,0.12)] rounded-xl outline-none transition-all focus:border-[rgba(0,0,29,0.3)] focus:shadow-[0_0_0_3px_rgba(0,0,29,0.04)] placeholder:text-[#A8A29E]";
export const selectCls = "w-full px-3.5 py-2.5 text-[14px] text-[#0F0F10] bg-white border border-[rgba(0,0,29,0.12)] rounded-xl outline-none transition-all focus:border-[rgba(0,0,29,0.3)] appearance-none cursor-pointer";
export const labelCls = "block text-[12px] font-medium text-[#787881] mb-1.5";

// Format helpers
export const fmtEUR = (n) => Number(n || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
export const fmtUSD = (n) => Number(n || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

// Badge
export function Badge({ children, variant = 'default' }) {
  const styles = {
    default: 'bg-[rgba(0,0,23,0.04)] text-[#787881]',
    success: 'bg-[#ECFDF5] text-[#059669]',
    warning: 'bg-[#FFFBEB] text-[#D97706]',
    error: 'bg-[#FEF2F2] text-[#DC2626]',
    info: 'bg-[#EEF2FF] text-[#6366F1]',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${styles[variant] || styles.default}`}>
      {children}
    </span>
  );
}

// Modal
export function Modal({ isOpen, onClose, title, children, maxWidth = 'max-w-lg' }) {
  if (!isOpen) return null;
  return (
    <>
      <div className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-40" onClick={onClose} style={{ animation: 'fadeIn 0.15s ease' }} />
      <div className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-xl z-50 w-full ${maxWidth} max-h-[85vh] overflow-y-auto`} style={{ animation: 'scaleIn 0.2s var(--ease-out) forwards' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(0,0,29,0.06)]">
          <h3 className="text-[16px] font-semibold text-[#0F0F10]">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-[#A8A29E] hover:text-[#0F0F10] hover:bg-[rgba(0,0,23,0.04)] transition-all">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </>
  );
}

// Empty state
export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="text-center py-16 px-4">
      {icon && <div className="w-12 h-12 bg-[rgba(0,0,23,0.03)] rounded-2xl flex items-center justify-center mx-auto mb-4">{icon}</div>}
      <p className="text-[14px] font-medium text-[#0F0F10]">{title}</p>
      {description && <p className="text-[13px] text-[#787881] mt-1 max-w-sm mx-auto">{description}</p>}
      {action}
    </div>
  );
}

// Spinner
export function Spinner({ size = 'w-5 h-5' }) {
  return <span className={`${size} border-2 border-[rgba(0,0,29,0.1)] border-t-[#0F0F10] rounded-full animate-spin inline-block`} />;
}
