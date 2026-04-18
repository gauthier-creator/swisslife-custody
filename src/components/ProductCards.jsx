import { useRef, useState, useEffect } from 'react';

/* ═══════════════════════════════════════════════════════
   ProductCards — Ramify-style editorial product tiles
   Warm marble hero image · uppercase pill · Fraunces title
   Horizontal carousel with chevron navigation
   ═══════════════════════════════════════════════════════ */

/* ─── Abstract SVG scenes (no real photography) ─────── */

/* A minimal vault door floating on warm marble — "Conservation" */
/* ─── Marble surfaces — Ramify product-card hero backgrounds ──
   Pure CSS radial + linear gradients. Each scene is a single div
   that fills the 168px hero area. No central motif — the visual
   interest is the veining + warmth, with the category icon badge
   (added by ProductCard) sitting top-left. */
function MarbleSurface({ variant = 'peach' }) {
  const v = {
    peach:   'marble-peach',
    cream:   'marble-cream',
    sand:    'marble-sand',
    mist:    'marble-mist',
  }[variant] || 'marble-peach';
  return (
    <div className={`absolute inset-0 ${v}`}>
      {/* Hairline veining — subtle marble vein */}
      <svg viewBox="0 0 400 168" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <path d="M -10 52 Q 120 28, 220 72 T 420 48" stroke="rgba(124,94,60,0.08)" strokeWidth="1" fill="none" />
        <path d="M -10 120 Q 100 96, 240 132 T 420 108" stroke="rgba(124,94,60,0.05)" strokeWidth="1" fill="none" />
      </svg>
    </div>
  );
}

export function SceneVault()    { return <MarbleSurface variant="peach" />; }
export function SceneArch()     { return <MarbleSurface variant="sand" />; }
export function SceneWaves()    { return <MarbleSurface variant="mist" />; }
export function SceneDocument() { return <MarbleSurface variant="cream" />; }
export function SceneKeys()     { return <MarbleSurface variant="peach" />; }

/* ─── ProductCard — Ramify layout ──────────────────────
   Top: marble hero (168px) with small icon badge + rate chip.
   Bottom: white body — title, subtitle, two buttons (Détails/CTA).
   Clicking the whole card fires primary CTA.
   Optional: `rateChip` (e.g. "JUSQU'À 4,6 %") · `cta` (default "Souscrire")
   -------------------------------------------------------- */
export function ProductCard({
  category,
  categoryIcon,
  title,
  description,
  scene,
  onClick,
  rateChip,
  cta = 'Détails',
  className = '',
}) {
  return (
    <article
      className={`
        group relative flex-shrink-0 w-[304px] snap-start
        rounded-[12px] overflow-hidden flex flex-col
        bg-white border border-[#E9E4D9]
        transition-colors duration-200
        hover:border-[#C8BEA4]
        ${className}
      `}
    >
      {/* Marble hero area — 168px, with absolute icon top-left, rate chip top-right */}
      <div className="relative h-[168px] overflow-hidden">
        {scene}
        {/* Small square icon badge top-left (Ramify pattern) */}
        <span
          className="absolute top-3.5 left-3.5 w-8 h-8 rounded-[6px] bg-white/90 border border-[rgba(10,10,10,0.06)] backdrop-blur-sm
                     flex items-center justify-center text-[#1E1E1E] shadow-[0_1px_2px_rgba(10,10,10,0.04)]"
        >
          {categoryIcon}
        </span>
        {/* Rate / price chip top-right */}
        {rateChip && (
          <span className="absolute top-3.5 right-3.5 inline-flex items-center h-[22px] px-2.5 rounded-[4px] bg-[#F5E5CE]/95 text-[#7C5E3C] text-[10.5px] font-semibold uppercase tracking-[0.06em] tabular-nums backdrop-blur-sm">
            {rateChip}
          </span>
        )}
      </div>

      {/* Body — category eyebrow + title + subtitle + 2 CTAs */}
      <div className="flex-1 flex flex-col px-5 py-5">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#8A8278]">
          {category}
        </span>
        <h3
          className="mt-1.5 text-[16px] font-semibold text-[#1E1E1E] leading-[1.3] line-clamp-2"
        >
          {title}
        </h3>
        <p className="mt-1.5 text-[13px] text-[#5D5D5D] leading-[1.45] line-clamp-2 flex-1">
          {description}
        </p>

        {/* Actions — Ramify: Détails (outlined) + CTA (black solid) */}
        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); }}
            className="cta-secondary flex-1"
          >
            Détails
          </button>
          <button
            onClick={onClick}
            className="cta-primary flex-1"
          >
            {cta}
          </button>
        </div>
      </div>
    </article>
  );
}

/* ─── ProductCarousel ──────────────────────────────── */
export function ProductCarousel({ title, eyebrow, children, className = '' }) {
  const scrollerRef = useRef(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);

  const update = () => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 8);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  };

  useEffect(() => {
    update();
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  const scroll = (dir) => {
    scrollerRef.current?.scrollBy({ left: dir * 320, behavior: 'smooth' });
  };

  return (
    <section className={`${className}`}>
      <div className="flex items-end justify-between gap-6 mb-6">
        <div>
          {eyebrow && (
            <p className="text-[10.5px] font-medium text-[#7C5E3C] uppercase tracking-[0.12em] mb-1.5">
              {eyebrow}
            </p>
          )}
          <h2
            className="font-display text-[24px] text-[#0A0A0A] leading-[1.15]"
            style={{ letterSpacing: '-0.022em' }}
          >
            {title}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <CarouselNav direction="left" disabled={!canLeft} onClick={() => scroll(-1)} />
          <CarouselNav direction="right" disabled={!canRight} onClick={() => scroll(1)} />
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-2 pr-12 -mr-12"
        style={{ scrollbarWidth: 'none' }}
      >
        {children}
      </div>
    </section>
  );
}

function CarouselNav({ direction, disabled, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === 'left' ? 'Précédent' : 'Suivant'}
      className={`
        w-10 h-10 rounded-full bg-white border border-[rgba(10,10,10,0.08)]
        shadow-[0_1px_0_rgba(255,255,255,0.95)_inset,0_1px_2px_rgba(10,10,10,0.05),0_4px_10px_-4px_rgba(10,10,10,0.12)]
        flex items-center justify-center text-[#2A2A2A]
        disabled:opacity-30 disabled:cursor-not-allowed
        hover:border-[rgba(10,10,10,0.2)] hover:shadow-[0_1px_0_rgba(255,255,255,1)_inset,0_2px_4px_rgba(10,10,10,0.08),0_8px_18px_-6px_rgba(10,10,10,0.18)]
        active:scale-95
        transition-all duration-200
      `}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
        {direction === 'left'
          ? <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          : <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />}
      </svg>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════
   MarbleTexture — realistic marble SVG background
   feTurbulence + manually ruled bronze veins + warm halo
   ═══════════════════════════════════════════════════════ */

// helper: hex to 0..1 R/G/B channel for feColorMatrix rows
function hexC(hex, idx) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return [r, g, b][idx].toFixed(3);
}

export function MarbleTexture({ variant = 'ivory', seed = 3, className = '' }) {
  // Four warm marbling palettes — all ivory-biased, bronze-veined.
  const palette = {
    ivory:   { base: '#FBF6EA', mid: '#F1E6CE', deep: '#E3D2A8', vein: '#8E6B3D' },
    peach:   { base: '#FDF3E3', mid: '#F6E0C2', deep: '#E9C696', vein: '#9A6B33' },
    pearl:   { base: '#F7F4EC', mid: '#E9E1CE', deep: '#D6C8A4', vein: '#6F5733' },
    bronze:  { base: '#F4E6C8', mid: '#E2C88B', deep: '#B98844', vein: '#5E4220' },
  }[variant] || { base: '#FBF6EA', mid: '#F1E6CE', deep: '#E3D2A8', vein: '#8E6B3D' };

  const id = `mb-${variant}-${seed}`;

  return (
    <svg
      viewBox="0 0 400 240"
      className={`absolute inset-0 w-full h-full ${className}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        {/* Warm radial cream base */}
        <radialGradient id={`${id}-base`} cx="58%" cy="38%" r="95%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
          <stop offset="28%" stopColor={palette.base} />
          <stop offset="68%" stopColor={palette.mid} />
          <stop offset="100%" stopColor={palette.deep} />
        </radialGradient>

        {/* Turbulent marble field — organic veining pattern */}
        <filter id={`${id}-turb`} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="turbulence" baseFrequency="0.012 0.028" numOctaves="3" seed={seed} />
          <feColorMatrix
            type="matrix"
            values={`0 0 0 0 ${hexC(palette.vein, 0)} 0 0 0 0 ${hexC(palette.vein, 1)} 0 0 0 0 ${hexC(palette.vein, 2)} 0 0 0 -1.2 1`}
          />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>

        {/* Subtle grain overlay — hand-printed paper feel */}
        <filter id={`${id}-grain`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={seed + 1} />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.06 0"
          />
        </filter>

        {/* Vein gradient — bronze fades */}
        <linearGradient id={`${id}-veinGrad`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={palette.vein} stopOpacity="0" />
          <stop offset="30%" stopColor={palette.vein} stopOpacity="0.45" />
          <stop offset="70%" stopColor={palette.vein} stopOpacity="0.55" />
          <stop offset="100%" stopColor={palette.vein} stopOpacity="0" />
        </linearGradient>

        {/* Top-left highlight */}
        <radialGradient id={`${id}-hl`} cx="25%" cy="18%" r="60%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.75" />
          <stop offset="60%" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Layer 1 — radial cream base */}
      <rect width="400" height="240" fill={`url(#${id}-base)`} />

      {/* Layer 2 — turbulent marble field (low opacity, multiply feel) */}
      <rect width="400" height="240" fill={palette.vein} filter={`url(#${id}-turb)`} opacity="0.28" />

      {/* Layer 3 — hand-drawn bronze veins (the Ramify signature move) */}
      <g stroke={`url(#${id}-veinGrad)`} fill="none" strokeLinecap="round">
        <path d="M -20 90 C 80 60, 160 140, 240 100 S 380 130, 420 80" strokeWidth="1.4" opacity="0.75" />
        <path d="M 40 200 C 110 160, 180 220, 260 170 S 360 200, 410 160" strokeWidth="0.9" opacity="0.6" />
        <path d="M 10 50 C 80 30, 130 80, 200 50" strokeWidth="0.5" opacity="0.5" />
        <path d="M 220 20 C 280 50, 330 30, 400 60" strokeWidth="0.4" opacity="0.45" />
        <path d="M 0 180 C 60 200, 100 170, 150 190" strokeWidth="0.5" opacity="0.5" />
        <path d="M 280 210 C 320 200, 360 220, 400 205" strokeWidth="0.4" opacity="0.4" />
      </g>

      {/* Layer 4 — specular highlight top-left */}
      <rect width="400" height="240" fill={`url(#${id}-hl)`} />

      {/* Layer 5 — grain */}
      <rect width="400" height="240" filter={`url(#${id}-grain)`} />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════
   MandatCard — Ramify portfolio tile (Essential / Flagship)
   Marble hero · serif label · asset-class pills · détails CTA
   ═══════════════════════════════════════════════════════ */
export function MandatCard({
  label = 'Privilège',
  marble = 'ivory',
  seed = 3,
  assetClasses = ['Actions', 'Obligations', 'Fonds Euros'],
  cta = 'Détails',
  onClick,
  disabled = [],
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex-shrink-0 w-[280px] snap-start text-left rounded-[20px] border border-[rgba(10,10,10,0.1)] bg-white p-4 transition-all duration-300 hover:-translate-y-[2px] hover:border-[rgba(10,10,10,0.2)]"
      style={{
        boxShadow:
          '0 1px 0 rgba(255,255,255,0.95) inset, 0 1px 2px rgba(10,10,10,0.05), 0 8px 24px -12px rgba(124,94,60,0.25)',
      }}
    >
      {/* Marble hero */}
      <div
        className="relative h-[200px] rounded-[14px] overflow-hidden border border-[rgba(124,94,60,0.18)]"
        style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8), inset 0 -12px 30px -10px rgba(124,94,60,0.18)' }}
      >
        <MarbleTexture variant={marble} seed={seed} />

        {/* Serif label — centered, letterpress feel */}
        <div className="absolute inset-x-0 top-5 flex flex-col items-center gap-1.5 pointer-events-none">
          <span className="text-[8.5px] font-medium uppercase tracking-[0.22em] text-[#7C5E3C] opacity-80">
            Portefeuille
          </span>
          <span className="w-5 h-px bg-[#7C5E3C] opacity-50" />
          <span
            className="font-display text-[22px] text-[#2A1F12]"
            style={{ letterSpacing: '-0.02em', textShadow: '0 1px 0 rgba(255,255,255,0.6)' }}
          >
            {label}
          </span>
        </div>

        {/* Asset-class pills — stacked, centered */}
        <div className="absolute inset-x-0 bottom-4 flex flex-wrap items-center justify-center gap-1.5 px-4">
          {assetClasses.map((ac, i) => {
            const isDisabled = disabled.includes(ac);
            return (
              <span
                key={i}
                className={`inline-flex items-center gap-1 h-[22px] px-2.5 rounded-full text-[9.5px] font-medium uppercase tracking-[0.06em] border transition-colors ${
                  isDisabled
                    ? 'bg-white/40 border-[rgba(124,94,60,0.15)] text-[#9B8970]'
                    : 'bg-white/90 border-[rgba(124,94,60,0.22)] text-[#4A3A22]'
                }`}
                style={isDisabled ? {} : { boxShadow: '0 1px 0 rgba(255,255,255,0.9) inset, 0 1px 2px rgba(124,94,60,0.1)' }}
              >
                {isDisabled ? (
                  <svg className="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <circle cx="12" cy="12" r="10" />
                    <path strokeLinecap="round" d="M5 12h14" />
                  </svg>
                ) : (
                  <span className="w-1 h-1 rounded-full bg-[#7C5E3C]" />
                )}
                {ac}
              </span>
            );
          })}
        </div>
      </div>

      {/* CTA button */}
      <div className="mt-3 mx-1">
        <span
          className="inline-flex items-center justify-center gap-1.5 w-full h-10 rounded-[10px] bg-white border border-[rgba(10,10,10,0.1)] text-[12.5px] font-medium text-[#0A0A0A] tracking-[-0.006em] transition-all group-hover:bg-[#0A0A0A] group-hover:text-white group-hover:border-[#0A0A0A]"
          style={{ boxShadow: '0 1px 0 rgba(255,255,255,0.9) inset, 0 1px 2px rgba(10,10,10,0.05)' }}
        >
          {cta}
          <svg className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </span>
      </div>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════
   MarbleHero — editorial hero with marble identity
   Left-aligned: eyebrow · serif title · description · CTAs
   Right: Sℓ monogram seal watermark (identity cue)
   ═══════════════════════════════════════════════════════ */
export function MarbleHero({
  eyebrow,
  title,
  description,
  marble = 'peach',
  seed = 7,
  primaryCta,        // { label, icon, onClick }
  secondaryCta,      // { label, onClick }
  meta,              // optional array of small caption strings shown under CTAs
  className = '',
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[22px] border border-[rgba(124,94,60,0.22)] ${className}`}
      style={{
        boxShadow:
          '0 1px 0 rgba(255,255,255,0.9) inset, 0 1px 2px rgba(10,10,10,0.04), 0 24px 56px -24px rgba(124,94,60,0.35), 0 12px 24px -14px rgba(10,10,10,0.1)',
      }}
    >
      {/* Marble background */}
      <div className="absolute inset-0 rounded-[22px] overflow-hidden">
        <MarbleTexture variant={marble} seed={seed} />
      </div>

      {/* Inner specular highlight (top-left) */}
      <div
        className="absolute inset-0 pointer-events-none rounded-[22px]"
        style={{ background: 'radial-gradient(ellipse 70% 50% at 28% 0%, rgba(255,255,255,0.55), transparent 62%)' }}
      />

      {/* Monogram seal watermark — right side, very subtle */}
      <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none hidden md:block" style={{ width: 340, height: 340, marginRight: -40 }}>
        <svg viewBox="0 0 340 340" className="w-full h-full">
          <defs>
            <linearGradient id="seal-ring" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#C8924B" stopOpacity="0.45" />
              <stop offset="50%" stopColor="#9A7A51" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#C8924B" stopOpacity="0.45" />
            </linearGradient>
          </defs>
          {/* Concentric rings */}
          <circle cx="170" cy="170" r="148" fill="none" stroke="url(#seal-ring)" strokeWidth="0.8" />
          <circle cx="170" cy="170" r="138" fill="none" stroke="#9A7A51" strokeOpacity="0.16" strokeWidth="0.6" />
          <circle cx="170" cy="170" r="116" fill="none" stroke="#9A7A51" strokeOpacity="0.22" strokeWidth="0.6" strokeDasharray="1 6" />
          {/* Ornamental ticks at cardinal points */}
          {[0, 90, 180, 270].map((deg) => (
            <line
              key={deg}
              x1="170"
              y1="22"
              x2="170"
              y2="32"
              stroke="#9A7A51"
              strokeOpacity="0.4"
              strokeWidth="0.8"
              transform={`rotate(${deg} 170 170)`}
            />
          ))}
          {/* Central monogram Sℓ */}
          <text
            x="170"
            y="204"
            textAnchor="middle"
            fontSize="132"
            fontFamily="var(--font-display, 'Fraunces'), serif"
            fontStyle="italic"
            fill="#2A1F12"
            fillOpacity="0.08"
            letterSpacing="-6"
          >
            Sℓ
          </text>
          {/* Fine bronze rule beneath monogram */}
          <line x1="118" y1="224" x2="222" y2="224" stroke="#9A7A51" strokeOpacity="0.32" strokeWidth="0.7" />
          <text
            x="170"
            y="244"
            textAnchor="middle"
            fontSize="9"
            fontFamily="var(--font-display, 'Fraunces'), serif"
            fontStyle="italic"
            fill="#7C5E3C"
            fillOpacity="0.7"
            letterSpacing="2"
          >
            EST · MMXXVI
          </text>
        </svg>
      </div>

      {/* Content */}
      <div className="relative px-10 py-11 max-w-[58ch]">
        {eyebrow && (
          <p className="text-[10.5px] font-medium text-[#7C5E3C] uppercase tracking-[0.16em] mb-5 flex items-center gap-2">
            <span className="w-1 h-1 rounded-full bg-[#C8924B]" />
            {eyebrow}
          </p>
        )}
        {title && (
          <h2
            className="font-display text-[36px] md:text-[38px] text-[#2A1F12] leading-[1.04]"
            style={{ letterSpacing: '-0.028em', textShadow: '0 1px 0 rgba(255,255,255,0.4)' }}
          >
            {title}
          </h2>
        )}
        {description && (
          <p className="mt-4 text-[14px] text-[#5C4A34] leading-[1.62] tracking-[-0.003em] max-w-[48ch]">
            {description}
          </p>
        )}

        {(primaryCta || secondaryCta) && (
          <div className="mt-7 flex items-center gap-2.5 flex-wrap">
            {primaryCta && (
              <button
                onClick={primaryCta.onClick}
                className="group/cta inline-flex items-center gap-2 h-10 px-[18px] rounded-full bg-[#0A0A0A] text-white text-[12.5px] font-medium tracking-[-0.003em] transition-all duration-200 hover:bg-[#1F1F1F] hover:-translate-y-px active:translate-y-0 active:scale-[0.98]"
                style={{ boxShadow: '0 1px 0 rgba(255,255,255,0.12) inset, 0 1px 2px rgba(10,10,10,0.22), 0 8px 20px -8px rgba(10,10,10,0.45)' }}
              >
                {primaryCta.icon}
                {primaryCta.label}
              </button>
            )}
            {secondaryCta && (
              <button
                onClick={secondaryCta.onClick}
                className="inline-flex items-center gap-2 h-10 px-[18px] rounded-full bg-white/75 backdrop-blur border border-[rgba(124,94,60,0.24)] text-[#2A1F12] text-[12.5px] font-medium tracking-[-0.003em] transition-all duration-200 hover:bg-white hover:border-[rgba(124,94,60,0.4)] hover:-translate-y-px active:translate-y-0"
              >
                {secondaryCta.label}
              </button>
            )}
          </div>
        )}

        {meta && meta.length > 0 && (
          <div className="mt-5 flex items-center gap-3 flex-wrap">
            {meta.map((m, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 text-[10.5px] font-medium text-[#7C5E3C] tracking-[0.06em] uppercase"
              >
                {i > 0 && <span className="w-[3px] h-[3px] rounded-full bg-[#C8924B]" />}
                {m}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MandatCarousel — horizontal snap scroller for MandatCards
   ═══════════════════════════════════════════════════════ */
export function MandatCarousel({ title, eyebrow, children, trailing, className = '' }) {
  const scrollerRef = useRef(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);

  const update = () => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 8);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  };

  useEffect(() => {
    update();
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  const scroll = (dir) => {
    scrollerRef.current?.scrollBy({ left: dir * 300, behavior: 'smooth' });
  };

  return (
    <section className={`${className}`}>
      <div className="flex items-end justify-between gap-6 mb-6">
        <div>
          {eyebrow && (
            <p className="text-[10.5px] font-medium text-[#7C5E3C] uppercase tracking-[0.12em] mb-1.5 flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-[#C8924B]" />
              {eyebrow}
            </p>
          )}
          <h2
            className="font-display text-[24px] text-[#0A0A0A] leading-[1.15]"
            style={{ letterSpacing: '-0.022em' }}
          >
            {title}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {trailing}
          <CarouselNav direction="left" disabled={!canLeft} onClick={() => scroll(-1)} />
          <CarouselNav direction="right" disabled={!canRight} onClick={() => scroll(1)} />
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-2 pr-12 -mr-12"
        style={{ scrollbarWidth: 'none' }}
      >
        {children}
      </div>
    </section>
  );
}
