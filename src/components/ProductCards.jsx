import { useRef, useState, useEffect } from 'react';

/* ═══════════════════════════════════════════════════════
   ProductCards — Ramify-style editorial product tiles
   Warm marble hero image · uppercase pill · Fraunces title
   Horizontal carousel with chevron navigation
   ═══════════════════════════════════════════════════════ */

/* ─── Abstract SVG scenes (no real photography) ─────── */

/* A minimal vault door floating on warm marble — "Conservation" */
export function SceneVault() {
  return (
    <svg viewBox="0 0 400 240" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id="vault-light" cx="55%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
          <stop offset="60%" stopColor="#F7EAD0" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#E9CFA0" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="vault-body" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F4E3BF" />
          <stop offset="55%" stopColor="#E7C78F" />
          <stop offset="100%" stopColor="#C89E5A" />
        </linearGradient>
        <linearGradient id="vault-rim" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FCF3DD" />
          <stop offset="100%" stopColor="#B88A48" />
        </linearGradient>
        <filter id="vault-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="6" />
          <feOffset dy="6" result="o" />
          <feComponentTransfer result="s"><feFuncA type="linear" slope="0.25" /></feComponentTransfer>
          <feMerge><feMergeNode in="s" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {/* warm halo */}
      <rect width="400" height="240" fill="url(#vault-light)" />
      {/* horizon shadow */}
      <ellipse cx="200" cy="210" rx="140" ry="10" fill="#9A7A51" fillOpacity="0.18" />
      {/* vault body */}
      <g filter="url(#vault-shadow)">
        <rect x="130" y="70" width="140" height="130" rx="14" fill="url(#vault-body)" stroke="url(#vault-rim)" strokeWidth="2" />
        {/* inner plate */}
        <rect x="142" y="82" width="116" height="106" rx="10" fill="none" stroke="#7C5E3C" strokeOpacity="0.4" strokeWidth="1" />
        {/* dial */}
        <circle cx="200" cy="135" r="30" fill="#F4E3BF" stroke="#7C5E3C" strokeWidth="1.5" />
        <circle cx="200" cy="135" r="22" fill="none" stroke="#7C5E3C" strokeOpacity="0.5" strokeWidth="0.8" />
        <circle cx="200" cy="135" r="3" fill="#7C5E3C" />
        {/* tick marks */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map(a => {
          const rad = (a * Math.PI) / 180;
          const x1 = 200 + Math.cos(rad) * 26;
          const y1 = 135 + Math.sin(rad) * 26;
          const x2 = 200 + Math.cos(rad) * 29;
          const y2 = 135 + Math.sin(rad) * 29;
          return <line key={a} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#7C5E3C" strokeWidth="1" />;
        })}
        {/* handle */}
        <line x1="200" y1="135" x2="218" y2="117" stroke="#7C5E3C" strokeWidth="2.5" strokeLinecap="round" />
        {/* hinges */}
        <circle cx="142" cy="95" r="3" fill="#7C5E3C" />
        <circle cx="142" cy="175" r="3" fill="#7C5E3C" />
      </g>
      {/* light beam from top */}
      <path d="M 200 0 L 260 70 L 140 70 Z" fill="#FFFFFF" fillOpacity="0.12" />
    </svg>
  );
}

/* Architectural arch — "Gouvernance / Policies" */
export function SceneArch() {
  return (
    <svg viewBox="0 0 400 240" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="arch-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FCF4E1" />
          <stop offset="50%" stopColor="#F3E0B3" />
          <stop offset="100%" stopColor="#E3C17C" />
        </linearGradient>
        <linearGradient id="arch-column" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FBF1D8" />
          <stop offset="100%" stopColor="#D4A574" />
        </linearGradient>
        <radialGradient id="arch-glow" cx="50%" cy="85%" r="50%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="240" fill="url(#arch-bg)" />
      {/* back columns — perspective suggestion */}
      <g opacity="0.35">
        <rect x="40" y="50" width="14" height="180" fill="url(#arch-column)" />
        <rect x="346" y="50" width="14" height="180" fill="url(#arch-column)" />
      </g>
      <g opacity="0.55">
        <rect x="80" y="40" width="18" height="190" fill="url(#arch-column)" />
        <rect x="302" y="40" width="18" height="190" fill="url(#arch-column)" />
      </g>
      {/* main arch */}
      <g>
        <path
          d="M 130 240 L 130 130 Q 130 60, 200 60 Q 270 60, 270 130 L 270 240"
          fill="none"
          stroke="#B88A48"
          strokeWidth="3"
        />
        <path
          d="M 140 240 L 140 130 Q 140 70, 200 70 Q 260 70, 260 130 L 260 240"
          fill="none"
          stroke="#7C5E3C"
          strokeOpacity="0.5"
          strokeWidth="1.5"
        />
        {/* columns */}
        <rect x="122" y="120" width="16" height="120" fill="url(#arch-column)" stroke="#7C5E3C" strokeOpacity="0.35" strokeWidth="1" />
        <rect x="262" y="120" width="16" height="120" fill="url(#arch-column)" stroke="#7C5E3C" strokeOpacity="0.35" strokeWidth="1" />
        {/* capitals */}
        <rect x="116" y="116" width="28" height="6" fill="#9A7A51" />
        <rect x="256" y="116" width="28" height="6" fill="#9A7A51" />
        {/* keystone */}
        <path d="M 193 65 L 207 65 L 210 78 L 190 78 Z" fill="#9A7A51" />
      </g>
      {/* floor glow */}
      <rect width="400" height="240" fill="url(#arch-glow)" />
    </svg>
  );
}

/* Soft waveform / chart — "Compliance surveillance" */
export function SceneWaves() {
  return (
    <svg viewBox="0 0 400 240" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="waves-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FDF4DE" />
          <stop offset="60%" stopColor="#F6E4B8" />
          <stop offset="100%" stopColor="#E6C687" />
        </linearGradient>
        <linearGradient id="waves-line" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#B88A48" stopOpacity="0.2" />
          <stop offset="50%" stopColor="#7C5E3C" stopOpacity="1" />
          <stop offset="100%" stopColor="#B88A48" stopOpacity="0.2" />
        </linearGradient>
        <filter id="waves-blur"><feGaussianBlur stdDeviation="3" /></filter>
      </defs>
      <rect width="400" height="240" fill="url(#waves-bg)" />
      {/* grid */}
      <g opacity="0.12">
        {[0, 60, 120, 180, 240].map(y => (
          <line key={y} x1="0" y1={y} x2="400" y2={y} stroke="#7C5E3C" strokeWidth="1" />
        ))}
        {[0, 80, 160, 240, 320, 400].map(x => (
          <line key={x} x1={x} y1="0" x2={x} y2="240" stroke="#7C5E3C" strokeWidth="1" />
        ))}
      </g>
      {/* back wave (blurred glow) */}
      <path
        d="M 0 160 Q 50 100, 100 130 T 200 110 T 300 140 T 400 90"
        stroke="#FFFFFF"
        strokeOpacity="0.5"
        strokeWidth="6"
        fill="none"
        filter="url(#waves-blur)"
      />
      {/* main wave */}
      <path
        d="M 0 160 Q 50 100, 100 130 T 200 110 T 300 140 T 400 90"
        stroke="url(#waves-line)"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      {/* dots on wave */}
      {[
        { x: 0, y: 160 },
        { x: 100, y: 130 },
        { x: 200, y: 110 },
        { x: 300, y: 140 },
        { x: 400, y: 90 },
      ].map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="8" fill="#FFFFFF" fillOpacity="0.6" />
          <circle cx={p.x} cy={p.y} r="4" fill="#7C5E3C" />
        </g>
      ))}
      {/* subtle bottom wave */}
      <path
        d="M 0 200 Q 80 180, 160 200 T 320 200 T 400 180"
        stroke="#7C5E3C"
        strokeOpacity="0.25"
        strokeWidth="2"
        fill="none"
      />
    </svg>
  );
}

/* Document with wax seal — "Mandats / Reporting" */
export function SceneDocument() {
  return (
    <svg viewBox="0 0 400 240" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="doc-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FCF3DD" />
          <stop offset="100%" stopColor="#E9CFA0" />
        </linearGradient>
        <linearGradient id="doc-paper" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#F7ECD0" />
        </linearGradient>
        <radialGradient id="doc-seal" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#D4A574" />
          <stop offset="60%" stopColor="#9A5A1A" />
          <stop offset="100%" stopColor="#5A3410" />
        </radialGradient>
        <filter id="doc-shadow"><feGaussianBlur stdDeviation="5" /></filter>
      </defs>
      <rect width="400" height="240" fill="url(#doc-bg)" />
      {/* shadow pool */}
      <ellipse cx="200" cy="215" rx="130" ry="8" fill="#7C5E3C" fillOpacity="0.18" filter="url(#doc-shadow)" />
      {/* back document (rotated) */}
      <g transform="rotate(-5 200 130)">
        <rect x="125" y="55" width="160" height="160" rx="4" fill="url(#doc-paper)" stroke="#B88A48" strokeOpacity="0.3" strokeWidth="1" />
      </g>
      {/* front document */}
      <g transform="rotate(3 200 130)">
        <rect x="130" y="50" width="155" height="160" rx="4" fill="url(#doc-paper)" stroke="#B88A48" strokeWidth="1.2" />
        {/* text lines */}
        <g stroke="#7C5E3C" strokeOpacity="0.35" strokeWidth="1.2" strokeLinecap="round">
          <line x1="145" y1="75" x2="230" y2="75" />
          <line x1="145" y1="88" x2="260" y2="88" />
          <line x1="145" y1="108" x2="265" y2="108" />
          <line x1="145" y1="120" x2="240" y2="120" />
          <line x1="145" y1="132" x2="260" y2="132" />
          <line x1="145" y1="150" x2="260" y2="150" />
          <line x1="145" y1="162" x2="230" y2="162" />
        </g>
        {/* signature line */}
        <line x1="145" y1="185" x2="220" y2="185" stroke="#7C5E3C" strokeOpacity="0.6" strokeWidth="1" />
        <path d="M 150 183 Q 160 175, 170 182 T 195 180" stroke="#0A0A0A" strokeWidth="1.3" strokeLinecap="round" fill="none" />
      </g>
      {/* wax seal */}
      <g transform="translate(262 158)">
        <circle r="22" fill="url(#doc-seal)" />
        <circle r="17" fill="none" stroke="#FCF3DD" strokeOpacity="0.5" strokeWidth="0.8" />
        {/* monogram Sℓ */}
        <text
          x="0"
          y="6"
          textAnchor="middle"
          fontFamily="Fraunces, Georgia, serif"
          fontSize="19"
          fontWeight="500"
          fill="#FCF3DD"
          fillOpacity="0.85"
        >Sℓ</text>
      </g>
    </svg>
  );
}

/* Vault / key bunch — "Multi-chain" */
export function SceneKeys() {
  return (
    <svg viewBox="0 0 400 240" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="keys-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FDF4DE" />
          <stop offset="100%" stopColor="#EDD09A" />
        </linearGradient>
        <linearGradient id="key-metal" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FBE9C1" />
          <stop offset="50%" stopColor="#D4A574" />
          <stop offset="100%" stopColor="#7C5E3C" />
        </linearGradient>
      </defs>
      <rect width="400" height="240" fill="url(#keys-bg)" />
      <ellipse cx="200" cy="215" rx="120" ry="8" fill="#7C5E3C" fillOpacity="0.16" />
      {/* ring */}
      <circle cx="200" cy="80" r="18" fill="none" stroke="url(#key-metal)" strokeWidth="6" />
      {/* three keys */}
      {[
        { rot: -30, len: 100 },
        { rot: 0, len: 120 },
        { rot: 30, len: 100 },
      ].map((k, i) => (
        <g key={i} transform={`translate(200 98) rotate(${k.rot})`}>
          <rect x="-3" y="0" width="6" height={k.len} rx="3" fill="url(#key-metal)" />
          {/* teeth */}
          <rect x="3" y={k.len - 20} width="8" height="4" fill="url(#key-metal)" />
          <rect x="3" y={k.len - 10} width="5" height="3" fill="url(#key-metal)" />
          {/* key head */}
          <circle cx="0" cy={k.len + 12} r="12" fill="none" stroke="url(#key-metal)" strokeWidth="4" />
          <circle cx="0" cy={k.len + 12} r="4" fill="#7C5E3C" fillOpacity="0.4" />
        </g>
      ))}
    </svg>
  );
}

/* ─── ProductCard ──────────────────────────────────── */
export function ProductCard({
  category,
  categoryIcon,
  title,
  description,
  scene,
  onClick,
  className = '',
}) {
  return (
    <article
      onClick={onClick}
      className={`
        group relative flex-shrink-0 w-[340px] snap-start cursor-pointer
        rounded-[22px] overflow-hidden
        bg-gradient-to-b from-[#FDFBF4] to-[#F7ECD0]
        border border-[rgba(124,94,60,0.14)]
        shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_1px_2px_rgba(10,10,10,0.04),0_12px_28px_-14px_rgba(124,94,60,0.25)]
        hover:-translate-y-[2px] hover:shadow-[0_1px_0_rgba(255,255,255,0.95)_inset,0_2px_4px_rgba(10,10,10,0.06),0_24px_48px_-20px_rgba(124,94,60,0.36)]
        transition-all duration-300
        ${className}
      `}
    >
      {/* Illustration area */}
      <div className="relative h-[220px] overflow-hidden">
        {scene}
        {/* subtle vignette */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(180deg, transparent 60%, rgba(252,243,221,0.5) 100%)',
          }}
        />
      </div>

      {/* Content */}
      <div className="relative px-6 pt-5 pb-7 bg-[#FDFBF4]">
        {/* Category pill */}
        <span className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-white border border-[rgba(124,94,60,0.18)] shadow-[0_1px_2px_rgba(124,94,60,0.08)]">
          {categoryIcon && (
            <span className="text-[#7C5E3C] flex items-center">{categoryIcon}</span>
          )}
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#2A1F12]">
            {category}
          </span>
        </span>

        {/* Title */}
        <h3
          className="mt-4 font-display text-[21px] text-[#0A0A0A] leading-[1.15]"
          style={{ letterSpacing: '-0.022em' }}
        >
          {title}
        </h3>

        {/* Description */}
        <p className="mt-2.5 text-[13px] text-[#6B6B6B] leading-[1.55] tracking-[-0.003em] line-clamp-2">
          {description}
        </p>

        {/* Arrow that appears on hover */}
        <span
          className="absolute right-6 bottom-7 w-8 h-8 rounded-full bg-[#0A0A0A] text-white
                     flex items-center justify-center
                     opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0
                     transition-all duration-300"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </span>
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
    scrollerRef.current?.scrollBy({ left: dir * 380, behavior: 'smooth' });
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
        className="flex gap-5 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-2 -mx-10 px-10"
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
