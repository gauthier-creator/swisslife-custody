/* ═══════════════════════════════════════════════════════
   SwissLife Custody — Brand identity primitives
   ───────────────────────────────────────────────────────
   Horological language: watch dial, bronze seal, fleuron
   ornaments. Used across the app to create a coherent
   visual identity that's distinctly SwissLife Custody,
   not an off-the-shelf component library.
   ═══════════════════════════════════════════════════════ */

const INK    = '#0A0A0A';
const BRONZE = '#7C5E3C';

/* ───────────────────────────────────────────────────────
   BrandMark — animated monogram loader
   A 12-o'clock sweep hand rotates around a ticked dial
   with the SL monogram at the center. Replaces Spinner
   in page-level loading moments.
   ─────────────────────────────────────────────────────── */
export function BrandMark({ size = 64, label }) {
  const cx = 32, cy = 32;
  // 60 tick marks around the perimeter
  const ticks = Array.from({ length: 60 }).map((_, i) => {
    const angle = ((i * 6 - 90) * Math.PI) / 180;
    const isHour = i % 5 === 0;
    const rOuter = 28;
    const rInner = isHour ? 22.5 : 25.6;
    return (
      <line
        key={i}
        x1={cx + Math.cos(angle) * rOuter}
        y1={cy + Math.sin(angle) * rOuter}
        x2={cx + Math.cos(angle) * rInner}
        y2={cy + Math.sin(angle) * rInner}
        stroke={isHour ? 'rgba(10,10,10,0.55)' : 'rgba(10,10,10,0.22)'}
        strokeWidth={isHour ? 1.3 : 0.7}
        strokeLinecap="round"
      />
    );
  });

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      role={label ? 'status' : undefined}
      aria-label={label || 'Chargement'}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        className="absolute inset-0"
      >
        {/* outer hairline bezel */}
        <circle cx={cx} cy={cy} r={29.5} stroke="rgba(10,10,10,0.08)" />
        <circle cx={cx} cy={cy} r={27.4} stroke="rgba(10,10,10,0.05)" />
        {ticks}
        {/* rotating sweep hand */}
        <g className="brand-dial-rotate" style={{ transformOrigin: '32px 32px' }}>
          <line
            x1={cx}
            y1={cy}
            x2={cx}
            y2={cy - 22}
            stroke={BRONZE}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <circle cx={cx} cy={cy - 22} r="1.8" fill={BRONZE} />
        </g>
        {/* center cap */}
        <circle cx={cx} cy={cy} r="2.4" fill={INK} />
        <circle cx={cx} cy={cy} r="1" fill="#FFFFFF" opacity="0.8" />
      </svg>
    </div>
  );
}

/* ───────────────────────────────────────────────────────
   HeroDial — decorative watch-dial backdrop
   Sits absolute-positioned behind PageHeader titles to
   give a subtle "this product is crafted" feel.
   Always aria-hidden, pointer-events-none.
   ─────────────────────────────────────────────────────── */
export function HeroDial({ size = 360, className = '', strokeOpacity = 0.08 }) {
  const half = size / 2;
  const rBezel = size * 0.48;
  const rTrack = size * 0.40;
  const rHour  = size * 0.45;
  const rHourInner = size * 0.42;
  const rMin   = size * 0.435;
  const rMinInner = size * 0.425;

  const hourTicks = Array.from({ length: 12 }).map((_, i) => {
    const a = ((i * 30 - 90) * Math.PI) / 180;
    return (
      <line
        key={`h${i}`}
        x1={half + Math.cos(a) * rHour}
        y1={half + Math.sin(a) * rHour}
        x2={half + Math.cos(a) * rHourInner}
        y2={half + Math.sin(a) * rHourInner}
        stroke={BRONZE}
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity={strokeOpacity * 5}
      />
    );
  });

  const minuteTicks = Array.from({ length: 60 }).map((_, i) => {
    if (i % 5 === 0) return null;
    const a = ((i * 6 - 90) * Math.PI) / 180;
    return (
      <line
        key={`m${i}`}
        x1={half + Math.cos(a) * rMin}
        y1={half + Math.sin(a) * rMin}
        x2={half + Math.cos(a) * rMinInner}
        y2={half + Math.sin(a) * rMinInner}
        stroke={INK}
        strokeWidth="0.7"
        opacity={strokeOpacity * 2.2}
      />
    );
  });

  const numeralFS = Math.round(size * 0.055);
  const numeralR = size * 0.37;
  const numerals = [
    ['XII', 0],
    ['III', 90],
    ['VI',  180],
    ['IX',  270],
  ].map(([label, deg]) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return (
      <text
        key={label}
        x={half + Math.cos(a) * numeralR}
        y={half + Math.sin(a) * numeralR + numeralFS * 0.36}
        textAnchor="middle"
        fontFamily="Fraunces, ui-serif, Georgia, serif"
        fontSize={numeralFS}
        fontStyle="italic"
        fill={BRONZE}
        opacity={strokeOpacity * 5}
      >
        {label}
      </text>
    );
  });

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      aria-hidden="true"
    >
      {/* faint outer halo */}
      <circle cx={half} cy={half} r={rBezel} stroke={INK} strokeWidth="0.8" opacity={strokeOpacity} />
      <circle cx={half} cy={half} r={rBezel - 3} stroke={INK} strokeWidth="0.4" opacity={strokeOpacity * 0.8} />
      {/* dashed inner track (engraving feel) */}
      <circle
        cx={half}
        cy={half}
        r={rTrack}
        stroke={BRONZE}
        strokeWidth="1"
        strokeDasharray="2 5"
        opacity={strokeOpacity * 2.6}
      />
      {minuteTicks}
      {hourTicks}
      {numerals}
      {/* monogram center */}
      <text
        x={half}
        y={half + size * 0.08}
        textAnchor="middle"
        fontFamily="Fraunces, ui-serif, Georgia, serif"
        fontSize={size * 0.26}
        fontStyle="italic"
        fill={INK}
        opacity={strokeOpacity * 0.7}
      >
        Sℓ
      </text>
    </svg>
  );
}

/* ───────────────────────────────────────────────────────
   WaxSeal — bronze foil medallion
   Displays an embossed SL monogram surrounded by tiny
   engraving marks. Use to mark validated states:
   KYC validé · Contrat signé · Compliance clear.
   ─────────────────────────────────────────────────────── */
export function WaxSeal({ size = 56, label, tilt = -4, className = '' }) {
  const cx = 32, cy = 32;
  const engraving = Array.from({ length: 36 }).map((_, i) => {
    const a = ((i * 10 - 90) * Math.PI) / 180;
    const long = i % 3 === 0;
    const r1 = 23.8;
    const r2 = long ? 21.6 : 22.8;
    return (
      <line
        key={i}
        x1={cx + Math.cos(a) * r1}
        y1={cy + Math.sin(a) * r1}
        x2={cx + Math.cos(a) * r2}
        y2={cy + Math.sin(a) * r2}
        stroke="rgba(255,236,206,0.55)"
        strokeWidth={long ? 0.9 : 0.6}
        strokeLinecap="round"
      />
    );
  });

  return (
    <div className={`inline-flex flex-col items-center gap-1.5 ${className}`}>
      <div
        className="relative inline-flex items-center justify-center wax-seal"
        style={{ width: size, height: size, transform: `rotate(${tilt}deg)` }}
      >
        <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
          <defs>
            <radialGradient id="ws-grad" cx="32%" cy="28%" r="78%">
              <stop offset="0%"   stopColor="#D4A574" />
              <stop offset="38%"  stopColor="#9A7A51" />
              <stop offset="78%"  stopColor="#6A4F30" />
              <stop offset="100%" stopColor="#4A3520" />
            </radialGradient>
            <radialGradient id="ws-high" cx="30%" cy="25%" r="36%">
              <stop offset="0%"   stopColor="rgba(255,255,255,0.45)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </radialGradient>
            <filter id="ws-drop" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="1.6" />
            </filter>
          </defs>
          {/* cast shadow */}
          <ellipse cx="33" cy="36" rx="26" ry="25" fill="rgba(10,10,10,0.32)" filter="url(#ws-drop)" />
          {/* medallion body */}
          <circle cx={cx} cy={cy} r="26" fill="url(#ws-grad)" />
          {/* pressed rim */}
          <circle cx={cx} cy={cy} r="23.5" fill="none" stroke="rgba(255,236,206,0.35)" strokeWidth="0.6" />
          <circle cx={cx} cy={cy} r="20.5" fill="none" stroke="rgba(10,10,10,0.22)" strokeWidth="0.4" />
          {engraving}
          {/* specular highlight */}
          <circle cx="24" cy="22" r="10" fill="url(#ws-high)" />
        </svg>
        {/* embossed monogram */}
        <span
          className="absolute font-display italic select-none pointer-events-none"
          style={{
            fontSize: size * 0.50,
            lineHeight: 1,
            color: '#FBE7C4',
            textShadow:
              '0 1px 0 rgba(0,0,0,0.4), 0 -0.5px 0 rgba(255,255,255,0.35), 0 0 10px rgba(124,94,60,0.35)',
            letterSpacing: '-0.04em',
            transform: 'translateY(-1px)',
          }}
        >
          Sℓ
        </span>
      </div>
      {label && (
        <span className="text-[9.5px] font-medium uppercase tracking-[0.12em] text-[#7C5E3C]">
          {label}
        </span>
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────
   Ornament — horizontal fleuron rule
   Editorial divider used above eyebrows, in modals,
   and between sections. Bronze diamond flanked by fading
   hairlines and two dot accents.
   ─────────────────────────────────────────────────────── */
export function Ornament({ className = '', width = 'auto', tone = 'bronze' }) {
  const color = tone === 'ink' ? INK : BRONZE;
  return (
    <div
      className={`flex items-center gap-3 ${className}`}
      style={{ width }}
      aria-hidden="true"
    >
      <span
        className="flex-1 h-px"
        style={{ background: `linear-gradient(to right, transparent, ${color}66)` }}
      />
      <svg width="30" height="10" viewBox="0 0 30 10" fill="none">
        <circle cx="3" cy="5" r="1" fill={color} opacity="0.7" />
        <path d="M10 5 L15 1 L20 5 L15 9 Z" fill={color} opacity="0.9" />
        <circle cx="27" cy="5" r="1" fill={color} opacity="0.7" />
      </svg>
      <span
        className="flex-1 h-px"
        style={{ background: `linear-gradient(to left, transparent, ${color}66)` }}
      />
    </div>
  );
}

/* ───────────────────────────────────────────────────────
   ArchivalStamp — passport-style corner mark
   Small rotated stamp used to mark archived / confidential
   states. Think "SPÉCIMEN" on old bank documents.
   ─────────────────────────────────────────────────────── */
export function ArchivalStamp({ label = 'Confidentiel', className = '', rotate = -8 }) {
  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1 border-2 border-[#7C5E3C] rounded-[4px] ${className}`}
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      <span className="w-1 h-1 rounded-full bg-[#7C5E3C]" />
      <span className="text-[10.5px] font-medium uppercase tracking-[0.18em] text-[#7C5E3C] font-display italic">
        {label}
      </span>
      <span className="w-1 h-1 rounded-full bg-[#7C5E3C]" />
    </div>
  );
}

/* ───────────────────────────────────────────────────────
   CornerFleuron — engraved corner ornament
   Sits in the top-right of premium cards as a tiny badge.
   ─────────────────────────────────────────────────────── */
export function CornerFleuron({ size = 28, className = '' }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2 2 H14 M2 2 V14"
        stroke={BRONZE}
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M6 2 H12 M2 6 V12"
        stroke={BRONZE}
        strokeWidth="0.6"
        strokeLinecap="round"
        opacity="0.35"
      />
      <circle cx="2" cy="2" r="1.4" fill={BRONZE} opacity="0.7" />
      <path d="M8 8 L10 6 L12 8 L10 10 Z" fill={BRONZE} opacity="0.4" />
    </svg>
  );
}
