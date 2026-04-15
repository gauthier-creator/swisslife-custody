import { useState, useEffect, useRef } from 'react';

/* ═══════════════════════════════════════════════════════
   Shared primitives — Apple-grade private banking
   Monochrome · hairline borders · editorial typography
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
    <div className="fixed bottom-8 right-8 z-50 flex flex-col items-end gap-2">
      {toasts.map(t => (
        <div
          key={t.id}
          className="bg-[#0A0A0A] text-white px-5 py-3.5 text-[13px] font-medium rounded-xl shadow-[0_12px_32px_-8px_rgba(10,10,10,0.35)] animate-slide-up tracking-[-0.01em]"
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ─── Form primitives ──────────────────────────────────
export const inputCls =
  "w-full h-11 px-4 text-[14px] text-[#0A0A0A] bg-white border border-[rgba(10,10,10,0.1)] rounded-[10px] outline-none transition-all focus:border-[rgba(10,10,10,0.35)] focus:ring-4 focus:ring-[rgba(10,10,10,0.04)] placeholder:text-[#9B9B9B] tracking-[-0.006em]";

export const selectCls =
  "w-full h-11 px-4 pr-9 text-[14px] text-[#0A0A0A] bg-white border border-[rgba(10,10,10,0.1)] rounded-[10px] outline-none transition-all focus:border-[rgba(10,10,10,0.35)] focus:ring-4 focus:ring-[rgba(10,10,10,0.04)] appearance-none cursor-pointer tracking-[-0.006em]";

export const textareaCls =
  "w-full px-4 py-3 text-[14px] text-[#0A0A0A] bg-white border border-[rgba(10,10,10,0.1)] rounded-[10px] outline-none transition-all focus:border-[rgba(10,10,10,0.35)] focus:ring-4 focus:ring-[rgba(10,10,10,0.04)] placeholder:text-[#9B9B9B] resize-none tracking-[-0.006em]";

export const labelCls =
  "block text-[12px] font-medium text-[#4A4A4A] mb-2 tracking-[-0.003em]";

// ─── Format helpers ───────────────────────────────────
export const fmtEUR = (n) =>
  Number(n || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
export const fmtUSD = (n) =>
  Number(n || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

// Compact currency — €18.9B, €4.2M — for display KPIs
export const fmtCompactEUR = (n) => {
  const num = Number(n || 0);
  if (num >= 1e9) return `€${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `€${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `€${(num / 1e3).toFixed(0)}K`;
  return `€${num}`;
};

// Extract initials
export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s[0]?.toUpperCase() || '')
    .join('') || '?';

// Kept for back-compat — returns a neutral palette (no longer used colorfully)
export const avatarColor = () => ({ bg: '#F5F3EE', fg: '#0A0A0A' });

// ─── Button ───────────────────────────────────────────
// Apple-style pill buttons, tracking-tight, no loud variants
export function Button({ variant = 'primary', size = 'md', children, className = '', ...props }) {
  const variants = {
    primary:
      'bg-[#0A0A0A] text-white border border-[#0A0A0A] hover:bg-[#2A2A2A] shadow-[0_1px_2px_rgba(10,10,10,0.06)]',
    accent:
      'bg-[#7C5E3C] text-white border border-[#7C5E3C] hover:bg-[#6A4F30] shadow-[0_1px_2px_rgba(124,94,60,0.12)]',
    secondary:
      'bg-white text-[#0A0A0A] border border-[rgba(10,10,10,0.12)] hover:bg-[#FBFAF7] hover:border-[rgba(10,10,10,0.2)]',
    soft:
      'bg-[#F5F3EE] text-[#0A0A0A] border border-transparent hover:bg-[#EFECE4]',
    ghost:
      'bg-transparent text-[#4A4A4A] border border-transparent hover:bg-[#F5F3EE] hover:text-[#0A0A0A]',
    danger:
      'bg-white text-[#DC2626] border border-[rgba(220,38,38,0.25)] hover:bg-[#FEF2F2] hover:border-[rgba(220,38,38,0.4)]',
    link:
      'bg-transparent text-[#0A0A0A] border-0 hover:underline underline-offset-4 px-0 h-auto',
  };
  const sizes = {
    sm: 'h-8 px-3.5 text-[13px] rounded-full',
    md: 'h-10 px-5 text-[13.5px] rounded-full',
    lg: 'h-12 px-6 text-[14px] rounded-full',
    pill: 'h-10 px-5 text-[13.5px] rounded-full',
  };
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 font-medium transition-[background,border-color,color,box-shadow,transform] duration-[220ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] disabled:opacity-40 disabled:cursor-not-allowed tracking-[-0.01em] whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(124,94,60,0.22)] active:scale-[0.97] will-change-transform ${variants[variant]} ${variant !== 'link' ? sizes[size] : ''} ${className}`}
    >
      {children}
    </button>
  );
}

// ─── Kbd ──────────────────────────────────────────────
// Keyboard shortcut pill — matches the .kbd CSS utility
export function Kbd({ children, className = '' }) {
  return <kbd className={`kbd ${className}`}>{children}</kbd>;
}

// ─── Skeleton primitives ──────────────────────────────
// Used for async loading in tables & lists — shimmer, not spinner
export function Skeleton({ className = '', style = {} }) {
  return (
    <span
      className={`inline-block align-middle rounded-[6px] skeleton-shimmer ${className}`}
      style={style}
    />
  );
}

export function SkeletonCircle({ size = 36, className = '' }) {
  return (
    <span
      className={`inline-block rounded-full skeleton-shimmer ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

export function SkeletonRow({ cols = 4, className = '' }) {
  // Editorial table skeleton row — matches our tdCls padding
  return (
    <tr className={`border-b border-[rgba(10,10,10,0.06)] ${className}`}>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-6 py-4">
          <Skeleton
            className="h-[14px]"
            style={{ width: `${60 + ((i * 13) % 35)}%`, opacity: 1 - i * 0.08 }}
          />
        </td>
      ))}
    </tr>
  );
}

// ─── useCountUp ───────────────────────────────────────
// Animate a number from 0 to `value` on mount. Respects prefers-reduced-motion.
export function useCountUp(value, { duration = 900, decimals = 0, start = 0 } = {}) {
  const [display, setDisplay] = useState(start);
  const frameRef = useRef();
  useEffect(() => {
    if (typeof value !== 'number' || !isFinite(value)) {
      setDisplay(value);
      return;
    }
    const reduced = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || duration <= 0) {
      setDisplay(value);
      return;
    }
    const startTs = performance.now();
    const from = 0;
    const to = value;
    const easeOut = (t) => 1 - Math.pow(1 - t, 3);
    const tick = (now) => {
      const t = Math.min(1, (now - startTs) / duration);
      const next = from + (to - from) * easeOut(t);
      setDisplay(decimals ? Number(next.toFixed(decimals)) : Math.round(next));
      if (t < 1) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [value, duration, decimals]);
  return display;
}

// ─── CopyButton ───────────────────────────────────────
// One-click copy pill with bounce-check confirmation
export function CopyButton({ value, label = 'Copier', className = '' }) {
  const [copied, setCopied] = useState(false);
  const onClick = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(String(value ?? ''));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-full text-[11px] font-medium text-[#6B6B6B] hover:text-[#0A0A0A] hover:bg-[#F5F3EE] transition-colors tracking-[-0.003em] ${className}`}
      aria-label="Copier"
    >
      <span className="relative flex items-center justify-center w-[11px] h-[11px]">
        {copied ? (
          <svg className="w-[11px] h-[11px] animate-check-bounce" viewBox="0 0 12 12" fill="none" stroke="#7C5E3C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 6.2 L5 8.5 L9.5 3.5" />
          </svg>
        ) : (
          <svg className="w-[11px] h-[11px]" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3.2" y="3.2" width="6.2" height="6.2" rx="1.2" />
            <path d="M2 7.4 V2.4 a0.8 0.8 0 0 1 0.8 -0.8 H7.6" />
          </svg>
        )}
      </span>
      <span>{copied ? 'Copié' : label}</span>
    </button>
  );
}

// ─── Badge ────────────────────────────────────────────
// Outline style — no loud backgrounds. Dot conveys semantic color.
export function Badge({ children, variant = 'default', dot = false, size = 'md' }) {
  const tone = {
    default: { text: '#4A4A4A', dot: '#9B9B9B' },
    success: { text: '#166534', dot: '#16A34A' },
    warning: { text: '#92400E', dot: '#CA8A04' },
    error:   { text: '#991B1B', dot: '#DC2626' },
    info:    { text: '#1E40AF', dot: '#2563EB' },
    gold:    { text: '#7C5E3C', dot: '#7C5E3C' },
    pink:    { text: '#4A4A4A', dot: '#9B9B9B' },
    purple:  { text: '#4A4A4A', dot: '#9B9B9B' },
  };
  const sizes = {
    sm: 'h-5 px-2 text-[11px]',
    md: 'h-6 px-2.5 text-[12px]',
  };
  const t = tone[variant] || tone.default;
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border border-[rgba(10,10,10,0.1)] bg-white tracking-[-0.003em] ${sizes[size]}`}
      style={{ color: t.text }}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full" style={{ background: t.dot }} />}
      {children}
    </span>
  );
}

// ─── Card ─────────────────────────────────────────────
// Hairline border, warm white, barely-there shadow. Apple restraint.
export function Card({ children, className = '', variant = 'elevated', ...props }) {
  const variants = {
    elevated: 'bg-white rounded-[14px] border border-[rgba(10,10,10,0.08)] shadow-[0_1px_2px_rgba(10,10,10,0.03)]',
    flat:     'bg-white rounded-[14px] border border-[rgba(10,10,10,0.08)]',
    soft:     'bg-[#F5F3EE] rounded-[14px] border border-[rgba(10,10,10,0.04)]',
    dark:     'bg-[#0A0A0A] text-white rounded-[14px] shadow-[0_12px_32px_-12px_rgba(10,10,10,0.3)]',
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
// Monochrome — warm paper bg, dark initials, hairline inner border. Private-bank refined.
export function Avatar({ name = '', src, size = 40, ring = false, status, tone = 'default' }) {
  const dim = typeof size === 'number' ? `${size}px` : size;
  const fontSize = Math.round((typeof size === 'number' ? size : 40) * 0.36);
  const bg = tone === 'dark' ? '#0A0A0A' : tone === 'accent' ? '#7C5E3C' : '#F5F3EE';
  const fg = tone === 'dark' || tone === 'accent' ? '#FFFFFF' : '#0A0A0A';
  const border = tone === 'default' ? '1px solid rgba(10, 10, 10, 0.08)' : 'none';
  return (
    <div className="relative inline-flex flex-shrink-0" style={{ width: dim, height: dim }}>
      <div
        className={`w-full h-full rounded-full flex items-center justify-center font-medium overflow-hidden tracking-[-0.02em] ${ring ? 'ring-[3px] ring-white' : ''}`}
        style={{ background: src ? undefined : bg, color: fg, fontSize: `${fontSize}px`, border }}
      >
        {src ? <img src={src} alt={name} className="w-full h-full object-cover" /> : initials(name)}
      </div>
      {status && (
        <span
          className="absolute bottom-0 right-0 w-[28%] h-[28%] rounded-full border-2 border-white"
          style={{ background: status === 'online' ? '#16A34A' : status === 'busy' ? '#DC2626' : '#9B9B9B' }}
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
          className="-ml-2 rounded-full bg-[#F5F3EE] text-[#0A0A0A] flex items-center justify-center font-medium ring-[3px] ring-white border border-[rgba(10,10,10,0.08)]"
          style={{ width: size, height: size, fontSize: Math.round(size * 0.32) }}
        >
          +{rest}
        </div>
      )}
    </div>
  );
}

// ─── Icon Container ───────────────────────────────────
// Monochrome square container for icons (replaces colorful IconPill)
export function IconPill({ children, tone = 'default', size = 40 }) {
  // tone kept for back-compat; now mostly ignored except semantic contexts
  const styles = {
    default: { bg: '#F5F3EE', fg: '#0A0A0A', border: '1px solid rgba(10, 10, 10, 0.06)' },
    dark:    { bg: '#0A0A0A', fg: '#FFFFFF', border: 'none' },
    accent:  { bg: 'rgba(124, 94, 60, 0.08)', fg: '#7C5E3C', border: '1px solid rgba(124, 94, 60, 0.16)' },
    green:   { bg: '#F5F3EE', fg: '#166534', border: '1px solid rgba(10, 10, 10, 0.06)' },
    amber:   { bg: '#F5F3EE', fg: '#92400E', border: '1px solid rgba(10, 10, 10, 0.06)' },
    red:     { bg: '#F5F3EE', fg: '#991B1B', border: '1px solid rgba(10, 10, 10, 0.06)' },
    blue:    { bg: '#F5F3EE', fg: '#0A0A0A', border: '1px solid rgba(10, 10, 10, 0.06)' },
    pink:    { bg: '#F5F3EE', fg: '#0A0A0A', border: '1px solid rgba(10, 10, 10, 0.06)' },
    orange:  { bg: '#F5F3EE', fg: '#0A0A0A', border: '1px solid rgba(10, 10, 10, 0.06)' },
    gray:    { bg: '#F5F3EE', fg: '#4A4A4A', border: '1px solid rgba(10, 10, 10, 0.06)' },
    indigo:  { bg: '#F5F3EE', fg: '#0A0A0A', border: '1px solid rgba(10, 10, 10, 0.06)' },
  };
  const { bg, fg, border } = styles[tone] || styles.default;
  const radius = size >= 44 ? '12px' : '10px';
  return (
    <div
      className="flex-shrink-0 flex items-center justify-center"
      style={{ width: size, height: size, background: bg, color: fg, border, borderRadius: radius }}
    >
      {children}
    </div>
  );
}

// ─── Delta Indicator ──────────────────────────────────
// Tiny directional value — used in metric footers
export function Delta({ value, positive, tone, prefix = '' }) {
  const isUp = positive ?? (typeof value === 'number' ? value >= 0 : true);
  const color = tone || (isUp ? '#16A34A' : '#DC2626');
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-medium tabular-nums tracking-[-0.003em]" style={{ color }}>
      <svg className="w-2 h-2" viewBox="0 0 10 10" fill="currentColor">
        {isUp
          ? <path d="M5 1.5L8.5 7H1.5L5 1.5Z" />
          : <path d="M5 8.5L1.5 3H8.5L5 8.5Z" />}
      </svg>
      <span>{prefix}{value}</span>
    </span>
  );
}

// ─── Metric ───────────────────────────────────────────
// The core editorial metric: small label, big display number, muted caption.
// Used individually, or in a MetricRow (inside a Card with dividers).
export function Metric({ label, value, caption, delta, align = 'left', className = '' }) {
  const alignCls = align === 'right' ? 'text-right items-end' : 'text-left items-start';
  return (
    <div className={`flex flex-col ${alignCls} ${className}`}>
      <span className="text-[12px] font-medium text-[#6B6B6B] tracking-[-0.003em]">{label}</span>
      <span className="mt-2 text-[30px] font-medium text-[#0A0A0A] tabular-nums tracking-[-0.03em] leading-[1.1]">
        {value}
      </span>
      {(caption || delta) && (
        <div className="mt-1.5 flex items-center gap-2">
          {delta && (typeof delta === 'string' || typeof delta === 'number'
            ? <Delta value={delta} positive prefix={typeof delta === 'string' && delta.startsWith('-') ? '' : '+'} />
            : delta)}
          {caption && <span className="text-[12px] text-[#6B6B6B] tracking-[-0.003em]">{caption}</span>}
        </div>
      )}
    </div>
  );
}

// ─── MetricRow ────────────────────────────────────────
// Horizontal strip of metrics inside a Card with vertical dividers. Mercury/Stripe pattern.
export function MetricRow({ children, className = '' }) {
  // expects an array of <Metric /> children; splits them with hairline dividers
  const items = Array.isArray(children) ? children : [children];
  return (
    <Card className={`flex divide-x divide-[rgba(10,10,10,0.08)] ${className}`}>
      {items.map((child, i) => (
        <div key={i} className="flex-1 px-6 py-6 animate-slide-up" style={{ animationDelay: `${i * 40}ms` }}>
          {child}
        </div>
      ))}
    </Card>
  );
}

// ─── KPITile (compat shim → now a clean Metric card) ──
// Kept for back-compat. Ignores visual/tone/sparklines — renders a clean bordered metric.
export function KPITile({ label, value, delta, visual, onClick, className = '' }) {
  const clickable = !!onClick;
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-[14px] p-6 border border-[rgba(10,10,10,0.08)] shadow-[0_1px_2px_rgba(10,10,10,0.03)] ${clickable ? 'lift cursor-pointer' : ''} ${className}`}
    >
      <p className="text-[12px] font-medium text-[#6B6B6B] tracking-[-0.003em]">{label}</p>
      <p className="mt-2 text-[28px] font-medium text-[#0A0A0A] tabular-nums tracking-[-0.03em] leading-[1.1]">
        {value}
      </p>
      {delta && (
        <div className="mt-2">
          {typeof delta === 'string' || typeof delta === 'number'
            ? <Delta value={delta} positive />
            : delta}
        </div>
      )}
    </div>
  );
}

// ─── Sparkline (now monochrome, single stroke) ────────
export function Sparkline({ points = [0.4, 0.3, 0.55, 0.42, 0.65, 0.5, 0.8, 0.7, 0.95], width = 120, height = 32 }) {
  const max = Math.max(...points), min = Math.min(...points);
  const range = max - min || 1;
  const step = width / (points.length - 1);
  const coords = points.map((p, i) => [i * step, height - ((p - min) / range) * height * 0.9 - 2]);
  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <path d={line} stroke="#0A0A0A" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── List Row ─────────────────────────────────────────
// Editorial horizontal row — typography-led, hairline divider
export function ListRow({ icon, tone = 'default', title, subtitle, trailing, trailingSub, onClick, divider = true }) {
  const clickable = !!onClick;
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-4 px-6 py-4 ${divider ? 'border-b border-[rgba(10,10,10,0.06)] last:border-0' : ''} ${clickable ? 'cursor-pointer hover:bg-[#FBFAF7] transition-colors' : ''}`}
    >
      {icon && (
        typeof icon === 'string' || typeof icon === 'number'
          ? <IconPill tone={tone}><span className="text-[13px] font-medium">{icon}</span></IconPill>
          : <IconPill tone={tone}>{icon}</IconPill>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium text-[#0A0A0A] truncate tracking-[-0.01em]">{title}</p>
        {subtitle && <p className="text-[12.5px] text-[#6B6B6B] truncate mt-0.5 tracking-[-0.003em]">{subtitle}</p>}
      </div>
      {(trailing || trailingSub) && (
        <div className="text-right flex-shrink-0">
          {trailing && <p className="text-[14px] font-medium text-[#0A0A0A] tabular-nums tracking-[-0.015em]">{trailing}</p>}
          {trailingSub && <p className="text-[12px] text-[#6B6B6B] mt-0.5 tracking-[-0.003em]">{trailingSub}</p>}
        </div>
      )}
    </div>
  );
}

// ─── Section Title ────────────────────────────────────
export function SectionTitle({ children, action }) {
  return (
    <div className="px-6 pt-5 pb-3 flex items-center justify-between border-b border-[rgba(10,10,10,0.06)]">
      <h3 className="text-[13px] font-medium text-[#0A0A0A] tracking-[-0.01em]">{children}</h3>
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
        className="fixed inset-0 bg-[rgba(10,10,10,0.4)] backdrop-blur-[6px] z-40 animate-fade"
        onClick={onClose}
      />
      <div
        className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white z-50 w-[calc(100%-2rem)] ${maxWidth} max-h-[85vh] rounded-[18px] shadow-[0_24px_64px_-24px_rgba(10,10,10,0.35)] flex flex-col animate-scale border border-[rgba(10,10,10,0.08)] overflow-hidden`}
      >
        {(title || subtitle) && (
          <header className="px-7 pt-7 pb-5 flex items-start justify-between gap-4 border-b border-[rgba(10,10,10,0.06)]">
            <div>
              {title && <h2 className="text-[20px] font-medium text-[#0A0A0A] tracking-[-0.025em]">{title}</h2>}
              {subtitle && <p className="mt-1.5 text-[13px] text-[#6B6B6B] leading-relaxed max-w-md tracking-[-0.003em]">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center text-[#6B6B6B] hover:text-[#0A0A0A] hover:bg-[#F5F3EE] rounded-full transition-colors -mr-1.5 flex-shrink-0"
              aria-label="Fermer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </header>
        )}
        <div className="px-7 py-6 overflow-y-auto">{children}</div>
      </div>
    </>
  );
}

// ─── Empty state ──────────────────────────────────────
// Accepts either an illustration name (rendered via <Illustration />) or a custom icon
export function EmptyState({ title, description, action, icon, illustration }) {
  return (
    <div className="text-center py-20 px-6">
      {illustration ? (
        <div className="mx-auto w-[88px] h-[88px] flex items-center justify-center">
          <Illustration name={illustration} size={88} />
        </div>
      ) : icon ? (
        <div className="w-14 h-14 mx-auto rounded-full bg-[#F5F3EE] border border-[rgba(10,10,10,0.06)] flex items-center justify-center text-[#4A4A4A]">
          {icon}
        </div>
      ) : null}
      <p className="text-[16px] font-medium text-[#0A0A0A] tracking-[-0.015em] mt-6">{title}</p>
      {description && (
        <p className="text-[13.5px] text-[#6B6B6B] mt-2 max-w-sm mx-auto leading-relaxed tracking-[-0.003em]">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

// ─── Spinner ──────────────────────────────────────────
export function Spinner({ size = 'w-4 h-4' }) {
  return (
    <span
      className={`${size} inline-block border-[1.5px] border-[rgba(10,10,10,0.12)] border-t-[#0A0A0A] rounded-full animate-spin`}
    />
  );
}

// ─── Stat Cell ────────────────────────────────────────
// Thin horizontal strip cell — for secondary KPI rows inside a card
export function StatCell({ label, value, sub, className = '' }) {
  return (
    <div className={`px-6 py-5 ${className}`}>
      <p className="text-[12px] font-medium text-[#6B6B6B] tracking-[-0.003em]">{label}</p>
      <p className="mt-2 text-[22px] font-medium text-[#0A0A0A] tabular-nums tracking-[-0.025em] truncate leading-[1.15]">{value || '—'}</p>
      {sub && <p className="text-[12px] text-[#9B9B9B] mt-1 truncate tracking-[-0.003em]">{sub}</p>}
    </div>
  );
}

// ─── Action Button ────────────────────────────────────
// Circular icon button with label — Apple action tray style
export function ActionButton({ icon, label, onClick }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-2 group">
      <div className="w-11 h-11 rounded-full flex items-center justify-center bg-[#F5F3EE] border border-[rgba(10,10,10,0.06)] text-[#0A0A0A] group-hover:bg-[#EFECE4] transition-colors">
        {icon}
      </div>
      <span className="text-[11px] font-medium text-[#4A4A4A] group-hover:text-[#0A0A0A] transition-colors tracking-[-0.003em]">
        {label}
      </span>
    </button>
  );
}

// ─── Divider ──────────────────────────────────────────
export function Divider({ className = '' }) {
  return <div className={`h-px bg-[rgba(10,10,10,0.08)] ${className}`} />;
}

// ─── PageHeader ───────────────────────────────────────
// Editorial header — eyebrow + display title + description + trailing action
// Used at the top of every page for consistency
export function PageHeader({ eyebrow, title, accent, description, trailing, className = '' }) {
  return (
    <header className={`flex items-end justify-between gap-8 flex-wrap animate-slide-up ${className}`}>
      <div className="max-w-2xl min-w-0">
        {eyebrow && <p className="text-eyebrow">{eyebrow}</p>}
        <h1 className="display-lg text-[#0A0A0A] mt-3">
          {title}
          {accent && (
            <> <span className="font-display italic text-[#7C5E3C]">{accent}</span></>
          )}
        </h1>
        {description && (
          <p className="text-[15px] text-[#4A4A4A] mt-4 leading-relaxed max-w-xl tracking-[-0.006em]">
            {description}
          </p>
        )}
      </div>
      {trailing && (
        <div className="flex-shrink-0 animate-slide-up stagger-1">{trailing}</div>
      )}
    </header>
  );
}

// ─── StatusDot ────────────────────────────────────────
// Tiny pulsing indicator — "live sync", "connected"
export function StatusDot({ tone = 'success', label, className = '' }) {
  const tones = {
    success: { color: '#16A34A', pulse: 'status-pulse', text: '#166534' },
    bronze:  { color: '#7C5E3C', pulse: 'status-pulse-bronze', text: '#7C5E3C' },
    warning: { color: '#CA8A04', pulse: '', text: '#92400E' },
    error:   { color: '#DC2626', pulse: '', text: '#991B1B' },
    neutral: { color: '#9B9B9B', pulse: '', text: '#6B6B6B' },
  };
  const t = tones[tone] || tones.success;
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${t.pulse}`} style={{ background: t.color }} />
      {label && (
        <span className="text-[11px] font-medium tracking-[0.04em] uppercase" style={{ color: t.text }}>
          {label}
        </span>
      )}
    </span>
  );
}

// ─── UnderlineTabs ────────────────────────────────────
// Editorial underline tab navigation — matches the Layout pattern
export function UnderlineTabs({ tabs, active, onChange, className = '' }) {
  return (
    <div className={`border-b border-[rgba(10,10,10,0.08)] ${className}`}>
      <div className="flex items-center gap-0.5 overflow-x-auto">
        {tabs.map(t => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className={`relative h-11 px-4 text-[13px] font-medium whitespace-nowrap transition-colors tracking-[-0.01em] ${
                isActive ? 'text-[#0A0A0A]' : 'text-[#6B6B6B] hover:text-[#0A0A0A]'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                {t.label}
                {t.count != null && (
                  <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10.5px] font-medium tabular-nums ${
                    isActive
                      ? 'bg-[#0A0A0A] text-white'
                      : 'bg-[#F5F3EE] text-[#6B6B6B]'
                  }`}>
                    {t.count}
                  </span>
                )}
              </span>
              {isActive && (
                <span className="absolute left-4 right-4 -bottom-px h-[2px] bg-[#0A0A0A] rounded-t-full" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Table (editorial, hairline) ──────────────────────
export function Table({ headers, children, className = '' }) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full text-sm text-left border-collapse">
        <thead>
          <tr className="border-b border-[rgba(10,10,10,0.08)]">
            {headers.map((h, i) => {
              const label = typeof h === 'string' ? h : h.label;
              const right = typeof h === 'object' && h.right;
              return (
                <th
                  key={i}
                  className={`px-6 py-3.5 text-[10.5px] font-medium text-[#9B9B9B] tracking-[0.06em] uppercase ${right ? 'text-right' : ''}`}
                >
                  {label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export const tdCls = 'px-6 py-4 text-[13.5px] text-[#0A0A0A] tracking-[-0.006em]';
export const tdMuted = 'px-6 py-4 text-[12.5px] text-[#6B6B6B] tracking-[-0.003em]';
export const trCls = 'border-b border-[rgba(10,10,10,0.06)] hover:bg-[#FBFAF7] transition-colors';

// ─── Illustrations — monochrome, editorial ───────────
// Small refined SVGs for empty states & headers
export function Illustration({ name, size = 88 }) {
  const common = { width: size, height: size, viewBox: '0 0 88 88', fill: 'none', xmlns: 'http://www.w3.org/2000/svg' };
  const ink = '#0A0A0A';
  const bronze = '#7C5E3C';
  const paper = '#F5F3EE';

  switch (name) {
    case 'vault':
      return (
        <svg {...common}>
          <circle cx="44" cy="44" r="36" fill={paper} stroke="rgba(10,10,10,0.08)" />
          <circle cx="44" cy="44" r="26" fill="#FFFFFF" stroke="rgba(10,10,10,0.12)" />
          <circle cx="44" cy="44" r="18" fill="none" stroke={bronze} strokeWidth="1.2" strokeDasharray="2 3" />
          <circle cx="44" cy="44" r="4" fill={ink} />
          <line x1="44" y1="22" x2="44" y2="16" stroke={ink} strokeWidth="1.5" strokeLinecap="round" />
          <line x1="44" y1="66" x2="44" y2="72" stroke={ink} strokeWidth="1.5" strokeLinecap="round" />
          <line x1="22" y1="44" x2="16" y2="44" stroke={ink} strokeWidth="1.5" strokeLinecap="round" />
          <line x1="66" y1="44" x2="72" y2="44" stroke={ink} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case 'wallet':
      return (
        <svg {...common}>
          <rect x="14" y="22" width="60" height="44" rx="8" fill={paper} stroke="rgba(10,10,10,0.1)" />
          <rect x="14" y="22" width="60" height="10" rx="8" fill="#FFFFFF" stroke="rgba(10,10,10,0.08)" />
          <circle cx="58" cy="48" r="5" fill={bronze} />
          <circle cx="58" cy="48" r="2" fill="#FFFFFF" />
          <line x1="22" y1="42" x2="44" y2="42" stroke={ink} strokeWidth="1.2" strokeLinecap="round" opacity="0.35" />
          <line x1="22" y1="48" x2="38" y2="48" stroke={ink} strokeWidth="1.2" strokeLinecap="round" opacity="0.25" />
        </svg>
      );
    case 'shield':
      return (
        <svg {...common}>
          <path d="M44 14 L68 22 L68 46 C68 58 58 68 44 74 C30 68 20 58 20 46 L20 22 Z" fill={paper} stroke="rgba(10,10,10,0.12)" />
          <path d="M44 22 L60 28 L60 46 C60 55 52 63 44 66 C36 63 28 55 28 46 L28 28 Z" fill="#FFFFFF" stroke="rgba(10,10,10,0.08)" />
          <path d="M36 44 L42 50 L54 38" stroke={bronze} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
    case 'ledger':
      return (
        <svg {...common}>
          <rect x="16" y="16" width="56" height="56" rx="6" fill={paper} stroke="rgba(10,10,10,0.1)" />
          <rect x="22" y="22" width="44" height="44" rx="3" fill="#FFFFFF" stroke="rgba(10,10,10,0.08)" />
          <line x1="28" y1="32" x2="60" y2="32" stroke={ink} strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
          <line x1="28" y1="40" x2="54" y2="40" stroke={ink} strokeWidth="1.2" strokeLinecap="round" opacity="0.3" />
          <line x1="28" y1="48" x2="58" y2="48" stroke={ink} strokeWidth="1.2" strokeLinecap="round" opacity="0.3" />
          <line x1="28" y1="56" x2="44" y2="56" stroke={ink} strokeWidth="1.2" strokeLinecap="round" opacity="0.2" />
          <circle cx="58" cy="56" r="3" fill={bronze} />
        </svg>
      );
    case 'empty':
    default:
      return (
        <svg {...common}>
          <circle cx="44" cy="44" r="32" fill={paper} stroke="rgba(10,10,10,0.08)" />
          <circle cx="44" cy="44" r="22" fill="#FFFFFF" stroke="rgba(10,10,10,0.06)" />
          <line x1="36" y1="44" x2="52" y2="44" stroke={ink} strokeWidth="1.5" strokeLinecap="round" opacity="0.35" />
        </svg>
      );
  }
}

// ─── SectionCard ──────────────────────────────────────
// Card with refined header — title + caption + optional action + slot content
export function SectionCard({ title, caption, action, children, className = '', bodyClassName = '', noBodyPadding = false }) {
  return (
    <Card className={className}>
      {(title || caption || action) && (
        <div className="px-7 py-5 border-b border-[rgba(10,10,10,0.06)] flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            {title && <h3 className="text-[15px] font-medium text-[#0A0A0A] tracking-[-0.015em]">{title}</h3>}
            {caption && <p className="text-[12.5px] text-[#6B6B6B] mt-0.5 tracking-[-0.003em]">{caption}</p>}
          </div>
          {action && <div className="flex-shrink-0">{action}</div>}
        </div>
      )}
      <div className={`${noBodyPadding ? '' : 'px-7 py-6'} ${bodyClassName}`}>
        {children}
      </div>
    </Card>
  );
}

// ─── FooterDisclosure ─────────────────────────────────
// Editorial footer with regulatory disclosures — reused across pages
export function FooterDisclosure({ left = "SwissLife Banque Privée · Paris", right = "AMF · ACPR · Tracfin · MiCA Art. 60" }) {
  return (
    <footer className="pt-8 mt-14 border-t border-[rgba(10,10,10,0.06)] flex items-center justify-between text-[11px] text-[#9B9B9B] tracking-[0.02em] uppercase font-medium flex-wrap gap-4">
      <span>{left}</span>
      <span>{right}</span>
    </footer>
  );
}

// ─── Logo ─────────────────────────────────────────────
// Refined SL monogram — serif wordmark, editorial feel
export function Logo({ size = 'md', variant = 'full' }) {
  const sizes = {
    sm: { monogram: 28, title: 13, sub: 10 },
    md: { monogram: 32, title: 14, sub: 11 },
    lg: { monogram: 44, title: 18, sub: 12 },
  };
  const s = sizes[size] || sizes.md;
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex items-center justify-center rounded-[10px] bg-[#0A0A0A] text-white"
        style={{ width: s.monogram, height: s.monogram }}
      >
        <span className="font-display" style={{ fontSize: `${Math.round(s.monogram * 0.45)}px`, lineHeight: 1, letterSpacing: '-0.04em' }}>
          Sℓ
        </span>
      </div>
      {variant === 'full' && (
        <div className="flex flex-col leading-none">
          <span className="font-display text-[#0A0A0A]" style={{ fontSize: `${s.title}px`, letterSpacing: '-0.02em' }}>
            SwissLife
          </span>
          <span className="text-[#6B6B6B] font-medium mt-1" style={{ fontSize: `${s.sub}px`, letterSpacing: '0.02em' }}>
            Custody · Banque Privée
          </span>
        </div>
      )}
    </div>
  );
}
