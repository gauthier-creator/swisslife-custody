import { useState, useEffect } from 'react';

/* ═══════════════════════════════════════════════════════
   Shared primitives — Revolut-inspired, fintech-grade
   Soft shadows · rounded-18 · stylized circular icons
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
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {toasts.map(t => (
        <div
          key={t.id}
          className="bg-[#191C1F] text-white px-5 py-3 text-[14px] font-medium rounded-2xl shadow-[0_8px_32px_-8px_rgba(0,0,0,0.3)] animate-slide-up"
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ─── Form primitives ──────────────────────────────────
export const inputCls =
  "w-full h-11 px-4 text-[14px] text-[#191C1F] bg-white border border-[rgba(25,28,31,0.1)] rounded-xl outline-none transition-colors focus:border-[#0666EB] focus:ring-4 focus:ring-[rgba(6,102,235,0.1)] placeholder:text-[#A5ADB6]";

export const selectCls =
  "w-full h-11 px-4 pr-9 text-[14px] text-[#191C1F] bg-white border border-[rgba(25,28,31,0.1)] rounded-xl outline-none transition-colors focus:border-[#0666EB] focus:ring-4 focus:ring-[rgba(6,102,235,0.1)] appearance-none cursor-pointer";

export const textareaCls =
  "w-full px-4 py-3 text-[14px] text-[#191C1F] bg-white border border-[rgba(25,28,31,0.1)] rounded-xl outline-none transition-colors focus:border-[#0666EB] focus:ring-4 focus:ring-[rgba(6,102,235,0.1)] placeholder:text-[#A5ADB6] resize-none";

export const labelCls = "block text-[13px] font-medium text-[#52585F] mb-2";

// ─── Format helpers ───────────────────────────────────
export const fmtEUR = (n) =>
  Number(n || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
export const fmtUSD = (n) =>
  Number(n || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

// Extract initials from a name
export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s[0]?.toUpperCase() || '')
    .join('') || '?';

// Deterministic color from a string (for avatars)
const AVATAR_COLORS = [
  { bg: '#EC7E00', fg: '#FFFFFF' }, // orange
  { bg: '#0666EB', fg: '#FFFFFF' }, // Revolut blue
  { bg: '#00BE90', fg: '#FFFFFF' }, // green
  { bg: '#E950A4', fg: '#FFFFFF' }, // pink
  { bg: '#6A8EAD', fg: '#FFFFFF' }, // slate blue
  { bg: '#4F56F1', fg: '#FFFFFF' }, // indigo
  { bg: '#0B84FF', fg: '#FFFFFF' }, // bright blue
  { bg: '#FFB800', fg: '#191C1F' }, // amber
];
export const avatarColor = (key = '') => {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

// ─── Button ───────────────────────────────────────────
export function Button({ variant = 'primary', size = 'md', children, className = '', ...props }) {
  const variants = {
    primary:
      'bg-[#191C1F] text-white border border-[#191C1F] hover:bg-[#2A2E33] shadow-[0_1px_2px_rgba(0,0,0,0.04)]',
    accent:
      'bg-[#0666EB] text-white border border-[#0666EB] hover:bg-[#0558C8] shadow-[0_4px_16px_-4px_rgba(6,102,235,0.4)]',
    secondary:
      'bg-white text-[#191C1F] border border-[rgba(25,28,31,0.1)] hover:bg-[#F7F8FA] hover:border-[rgba(25,28,31,0.15)]',
    soft:
      'bg-[#E6F0FD] text-[#0666EB] border border-transparent hover:bg-[#D6E6FC]',
    ghost:
      'bg-transparent text-[#52585F] border border-transparent hover:bg-[#F1F3F6] hover:text-[#191C1F]',
    danger:
      'bg-[#EC4C5A] text-white border border-[#EC4C5A] hover:bg-[#D63B49]',
    link:
      'bg-transparent text-[#0666EB] border-0 hover:underline px-0 h-auto',
  };
  const sizes = {
    sm: 'h-8 px-3 text-[13px] rounded-lg',
    md: 'h-10 px-4 text-[14px] rounded-xl',
    lg: 'h-12 px-5 text-[14px] rounded-xl',
    pill: 'h-10 px-5 text-[14px] rounded-full',
  };
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed tracking-[-0.1px] ${variants[variant]} ${variant !== 'link' ? sizes[size] : ''} ${className}`}
    >
      {children}
    </button>
  );
}

// ─── Badge ────────────────────────────────────────────
export function Badge({ children, variant = 'default', dot = false, size = 'md' }) {
  const styles = {
    default: 'bg-[#F1F3F6] text-[#52585F]',
    success: 'bg-[#E6F9F2] text-[#008266]',
    warning: 'bg-[#FFF6E0] text-[#B07800]',
    error:   'bg-[#FDECEE] text-[#C93545]',
    info:    'bg-[#E6F0FD] text-[#0666EB]',
    gold:    'bg-[#FDEFDB] text-[#B05E00]',
    pink:    'bg-[#FCEAF4] text-[#B83680]',
    purple:  'bg-[#EDE9FE] text-[#5B21B6]',
  };
  const dotColors = {
    default: 'bg-[#A5ADB6]',
    success: 'bg-[#00BE90]',
    warning: 'bg-[#FFB800]',
    error:   'bg-[#EC4C5A]',
    info:    'bg-[#0666EB]',
    gold:    'bg-[#EC7E00]',
    pink:    'bg-[#E950A4]',
    purple:  'bg-[#8B5CF6]',
  };
  const sizes = {
    sm: 'px-2 py-0.5 text-[11px] rounded-md',
    md: 'px-2.5 py-1 text-[12px] rounded-lg',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold ${sizes[size]} ${styles[variant] || styles.default}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant] || dotColors.default}`} />}
      {children}
    </span>
  );
}

// ─── Card ─────────────────────────────────────────────
// Revolut-inspired: soft drop-shadow, rounded-[18px], no hard border
export function Card({ children, className = '', variant = 'elevated', ...props }) {
  const variants = {
    elevated: 'bg-white rounded-[18px] shadow-[0_0_20px_-10px_rgba(0,0,0,0.16)] border border-[rgba(25,28,31,0.04)]',
    flat:     'bg-white rounded-[18px] border border-[rgba(25,28,31,0.08)]',
    soft:     'bg-[#F7F8FA] rounded-[18px] border border-[rgba(25,28,31,0.04)]',
    dark:     'bg-[#191C1F] text-white rounded-[18px] shadow-[0_8px_32px_-12px_rgba(0,0,0,0.3)]',
  };
  return (
    <div
      {...props}
      className={`${variants[variant] || variants.elevated} ${className}`}
    >
      {children}
    </div>
  );
}

// ─── Avatar ───────────────────────────────────────────
// Revolut-style colored circle with initials or image
export function Avatar({ name = '', src, size = 40, ring = false, status }) {
  const { bg, fg } = avatarColor(name);
  const dim = typeof size === 'number' ? `${size}px` : size;
  const fontSize = Math.round((typeof size === 'number' ? size : 40) * 0.4);
  return (
    <div className="relative inline-flex flex-shrink-0" style={{ width: dim, height: dim }}>
      <div
        className={`w-full h-full rounded-full flex items-center justify-center font-semibold tracking-[-0.2px] overflow-hidden ${ring ? 'ring-2 ring-white' : ''}`}
        style={{ background: src ? undefined : bg, color: fg, fontSize: `${fontSize}px` }}
      >
        {src ? <img src={src} alt={name} className="w-full h-full object-cover" /> : initials(name)}
      </div>
      {status && (
        <span
          className="absolute bottom-0 right-0 w-[30%] h-[30%] rounded-full border-2 border-white"
          style={{ background: status === 'online' ? '#00BE90' : status === 'busy' ? '#EC4C5A' : '#A5ADB6' }}
        />
      )}
    </div>
  );
}

// ─── Avatar Stack ─────────────────────────────────────
export function AvatarStack({ items = [], size = 32, max = 3 }) {
  const shown = items.slice(0, max);
  const rest = items.length - shown.length;
  return (
    <div className="flex items-center">
      {shown.map((it, i) => (
        <div key={i} className="-ml-2 first:ml-0">
          <Avatar name={it.name || it} size={size} ring />
        </div>
      ))}
      {rest > 0 && (
        <div
          className="-ml-2 rounded-full bg-[#F1F3F6] text-[#52585F] flex items-center justify-center font-semibold ring-2 ring-white"
          style={{ width: size, height: size, fontSize: Math.round(size * 0.35) }}
        >
          +{rest}
        </div>
      )}
    </div>
  );
}

// ─── Icon Pill ────────────────────────────────────────
// Circular colored background with centered icon — Revolut signature
export function IconPill({ children, tone = 'blue', size = 40 }) {
  const tones = {
    blue:   { bg: '#E6F0FD', fg: '#0666EB' },
    green:  { bg: '#E6F9F2', fg: '#00BE90' },
    pink:   { bg: '#FCEAF4', fg: '#E950A4' },
    orange: { bg: '#FDEFDB', fg: '#EC7E00' },
    gray:   { bg: '#F1F3F6', fg: '#52585F' },
    indigo: { bg: '#EDE9FE', fg: '#4F56F1' },
    amber:  { bg: '#FFF6E0', fg: '#B07800' },
    red:    { bg: '#FDECEE', fg: '#EC4C5A' },
    dark:   { bg: '#191C1F', fg: '#FFFFFF' },
  };
  const { bg, fg } = tones[tone] || tones.blue;
  return (
    <div
      className="rounded-full flex-shrink-0 flex items-center justify-center"
      style={{ width: size, height: size, background: bg, color: fg }}
    >
      {children}
    </div>
  );
}

// ─── Delta Indicator ──────────────────────────────────
// Little arrow + value, colored by direction (Revolut pattern)
export function Delta({ value, positive, tone, prefix = '' }) {
  const isUp = positive ?? (typeof value === 'number' ? value >= 0 : true);
  const color = tone || (isUp ? '#00BE90' : '#EC4C5A');
  return (
    <div className="inline-flex items-center gap-1 text-[14px] font-medium tabular-nums" style={{ color }}>
      <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="currentColor">
        {isUp
          ? <path d="M5 1L9 7H1L5 1Z" />
          : <path d="M5 9L1 3H9L5 9Z" />}
      </svg>
      <span>{prefix}{value}</span>
    </div>
  );
}

// ─── KPI Tile ─────────────────────────────────────────
// The signature Revolut 190x190 tile: label · big amount · delta · visual
export function KPITile({ label, value, delta, tone = 'blue', visual, onClick, className = '' }) {
  const clickable = !!onClick;
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-[18px] p-5 border border-[rgba(25,28,31,0.04)] shadow-[0_0_20px_-10px_rgba(0,0,0,0.16)] ${clickable ? 'tile-hover cursor-pointer' : ''} ${className}`}
    >
      <div className="flex flex-col h-full justify-between gap-4 min-h-[140px]">
        <div>
          <p className="text-[13px] text-[#75808A] font-medium">{label}</p>
          <p className="mt-0.5 text-[22px] font-semibold text-[#191C1F] tabular-nums tracking-[-0.3px] leading-[1.2]">
            {value}
          </p>
          {delta && (
            <div className="mt-1">
              {typeof delta === 'string' || typeof delta === 'number'
                ? <Delta value={delta} tone={tone === 'pink' ? '#E950A4' : tone === 'blue' ? '#0666EB' : undefined} />
                : delta}
            </div>
          )}
        </div>
        {visual && <div className="flex items-end">{visual}</div>}
      </div>
    </div>
  );
}

// ─── Sparkline ────────────────────────────────────────
// Stylized mini-chart for KPI tiles
export function Sparkline({ points = [0.4, 0.3, 0.55, 0.42, 0.65, 0.5, 0.8, 0.7, 0.95], tone = 'blue', width = 150, height = 44 }) {
  const stroke = tone === 'pink' ? '#E950A4' : tone === 'green' ? '#00BE90' : '#0666EB';
  const fill = tone === 'pink' ? 'sparkline-gradient-pink' : tone === 'green' ? 'sparkline-gradient-green' : 'sparkline-gradient-blue';
  const max = Math.max(...points), min = Math.min(...points);
  const range = max - min || 1;
  const step = width / (points.length - 1);
  const coords = points.map((p, i) => [i * step, height - ((p - min) / range) * height * 0.9 - 2]);
  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id={`spark-${tone}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.25" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${tone})`} />
      <path d={line} stroke={stroke} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── List Row ─────────────────────────────────────────
// Revolut's signature horizontal row: icon + title/subtitle + trailing
export function ListRow({ icon, tone = 'blue', title, subtitle, trailing, trailingSub, onClick, divider = true }) {
  const clickable = !!onClick;
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-4 px-5 py-3.5 ${divider ? 'border-b border-[rgba(25,28,31,0.06)] last:border-0' : ''} ${clickable ? 'cursor-pointer hover:bg-[#F7F8FA] transition-colors' : ''}`}
    >
      {icon && (
        typeof icon === 'string' || typeof icon === 'number'
          ? <IconPill tone={tone}><span className="text-[14px] font-semibold">{icon}</span></IconPill>
          : <IconPill tone={tone}>{icon}</IconPill>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-semibold text-[#191C1F] truncate tracking-[-0.15px]">{title}</p>
        {subtitle && <p className="text-[13px] text-[#75808A] truncate mt-0.5">{subtitle}</p>}
      </div>
      {(trailing || trailingSub) && (
        <div className="text-right flex-shrink-0">
          {trailing && <p className="text-[15px] font-semibold text-[#191C1F] tabular-nums tracking-[-0.15px]">{trailing}</p>}
          {trailingSub && <p className="text-[12px] text-[#75808A] mt-0.5">{trailingSub}</p>}
        </div>
      )}
    </div>
  );
}

// ─── Section Title ────────────────────────────────────
// Compact section header inside a card
export function SectionTitle({ children, action }) {
  return (
    <div className="px-5 pt-4 pb-2 flex items-center justify-between">
      <h3 className="text-[13px] font-medium text-[#75808A]">{children}</h3>
      {action}
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
        className="fixed inset-0 bg-[rgba(25,28,31,0.5)] backdrop-blur-sm z-40 animate-fade"
        onClick={onClose}
      />
      <div
        className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white z-50 w-[calc(100%-2rem)] ${maxWidth} max-h-[85vh] rounded-[22px] shadow-[0_24px_64px_-24px_rgba(0,0,0,0.4)] flex flex-col animate-scale border border-[rgba(25,28,31,0.04)]`}
      >
        {(title || subtitle) && (
          <header className="px-6 pt-6 pb-5 flex items-start justify-between gap-4">
            <div>
              {title && <h2 className="text-[20px] font-semibold text-[#191C1F] tracking-[-0.3px]">{title}</h2>}
              {subtitle && <p className="mt-1.5 text-[13px] text-[#75808A] leading-relaxed">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center text-[#75808A] hover:text-[#191C1F] hover:bg-[#F1F3F6] rounded-full transition-colors -mr-1"
              aria-label="Fermer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </header>
        )}
        <div className="px-6 pb-6 overflow-y-auto">{children}</div>
      </div>
    </>
  );
}

// ─── Empty state ──────────────────────────────────────
export function EmptyState({ title, description, action, icon }) {
  return (
    <div className="text-center py-16 px-6">
      {icon && (
        <IconPill tone="gray" size={56}>
          {icon}
        </IconPill>
      )}
      <p className="text-[16px] font-semibold text-[#191C1F] tracking-[-0.2px] mt-4">{title}</p>
      {description && (
        <p className="text-[14px] text-[#75808A] mt-1.5 max-w-sm mx-auto leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ─── Spinner ──────────────────────────────────────────
export function Spinner({ size = 'w-4 h-4' }) {
  return (
    <span
      className={`${size} inline-block border-2 border-[rgba(25,28,31,0.12)] border-t-[#0666EB] rounded-full animate-spin`}
    />
  );
}

// ─── Stat Cell ────────────────────────────────────────
// Thin horizontal strip cell — for secondary KPI rows inside a card
export function StatCell({ label, value, sub, className = '' }) {
  return (
    <div className={`px-5 py-4 ${className}`}>
      <p className="text-[12px] font-medium text-[#75808A]">{label}</p>
      <p className="mt-1 text-[16px] font-semibold text-[#191C1F] tabular-nums tracking-[-0.2px] truncate">{value || '—'}</p>
      {sub && <p className="text-[12px] text-[#A5ADB6] mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

// ─── Action Button ────────────────────────────────────
// Revolut's signature circular action with label below (Add money, Exchange, etc.)
export function ActionButton({ icon, label, tone = 'dark', onClick }) {
  const tones = {
    dark:  { bg: '#191C1F', fg: '#FFFFFF' },
    blue:  { bg: '#0666EB', fg: '#FFFFFF' },
    soft:  { bg: '#E6F0FD', fg: '#0666EB' },
    white: { bg: '#FFFFFF', fg: '#191C1F' },
  };
  const { bg, fg } = tones[tone] || tones.dark;
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-2 group">
      <div
        className="w-11 h-11 rounded-full flex items-center justify-center transition-transform group-hover:scale-105 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
        style={{ background: bg, color: fg }}
      >
        {icon}
      </div>
      <span className="text-[12px] font-medium text-[#52585F] group-hover:text-[#191C1F] transition-colors">
        {label}
      </span>
    </button>
  );
}
