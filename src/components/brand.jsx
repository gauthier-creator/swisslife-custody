/* ═══════════════════════════════════════════════════════
   SwissLife Custody — Brand identity primitives
   ───────────────────────────────────────────────────────
   Modern fintech language inspired by ElevenLabs, Revolut,
   Mercury, Ramp. Mesh gradients · conic rings · live halos
   · sparklines. Warm bronze palette preserved.
   ═══════════════════════════════════════════════════════ */

const BRONZE      = '#7C5E3C';
const BRONZE_2    = '#9A7A51';
const BRONZE_HI   = '#D4A574';

/* ───────────────────────────────────────────────────────
   BrandMark — modern conic ring loader
   Outer conic-gradient ring spinning inside a soft halo
   pulse · center is a dark disc with white italic Sℓ.
   Replaces the watch-dial loader.
   ─────────────────────────────────────────────────────── */
export function BrandMark({ size = 64, label }) {
  const inset = size * 0.18;
  const centerSize = size - inset * 2;
  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      role={label ? 'status' : undefined}
      aria-label={label || 'Chargement'}
    >
      {/* Halo pulse */}
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-full animate-halo-pulse"
        style={{
          background:
            'radial-gradient(circle, rgba(212,165,116,0.38) 0%, rgba(124,94,60,0.18) 45%, transparent 72%)',
        }}
      />
      {/* Conic gradient ring — masked to become a donut */}
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-full animate-ring-spin"
        style={{
          background:
            'conic-gradient(from 0deg, rgba(124,94,60,0) 0deg, rgba(212,165,116,0.1) 60deg, #D4A574 180deg, #7C5E3C 300deg, rgba(124,94,60,0) 360deg)',
          WebkitMask:
            'radial-gradient(circle, transparent 58%, black 60%)',
          mask:
            'radial-gradient(circle, transparent 58%, black 60%)',
        }}
      />
      {/* Center dark disc */}
      <span
        className="relative inline-flex items-center justify-center rounded-full"
        style={{
          width: centerSize,
          height: centerSize,
          background:
            'radial-gradient(circle at 34% 28%, #1A1A1A 0%, #0A0A0A 60%, #000 100%)',
          boxShadow:
            '0 1px 2px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)',
        }}
      >
        <span
          className="font-display italic text-white select-none"
          style={{
            fontSize: centerSize * 0.5,
            lineHeight: 1,
            letterSpacing: '-0.04em',
            transform: 'translateY(-1px)',
          }}
        >
          Sℓ
        </span>
      </span>
    </div>
  );
}

/* ───────────────────────────────────────────────────────
   HeroMesh — drifting aurora mesh backdrop
   Three blurred blobs slowly drifting behind page headers.
   Replaces the decorative watch dial. aria-hidden.
   ─────────────────────────────────────────────────────── */
export function HeroMesh({ size = 360, className = '', opacity = 1 }) {
  return (
    <div
      className={`relative ${className}`}
      style={{ width: size, height: size, pointerEvents: 'none', opacity }}
      aria-hidden="true"
    >
      {/* Blob 1 — warm cream, top-left */}
      <span
        className="absolute rounded-full aurora-drift-1"
        style={{
          left: '8%',
          top: '6%',
          width: size * 0.62,
          height: size * 0.62,
          background:
            'radial-gradient(circle, rgba(223,196,154,0.55) 0%, rgba(223,196,154,0) 62%)',
          filter: 'blur(34px)',
        }}
      />
      {/* Blob 2 — bronze, center */}
      <span
        className="absolute rounded-full aurora-drift-2"
        style={{
          left: '30%',
          top: '28%',
          width: size * 0.58,
          height: size * 0.58,
          background:
            'radial-gradient(circle, rgba(154,122,81,0.42) 0%, rgba(154,122,81,0) 60%)',
          filter: 'blur(40px)',
        }}
      />
      {/* Blob 3 — sandy highlight, right */}
      <span
        className="absolute rounded-full aurora-drift-3"
        style={{
          right: '4%',
          top: '18%',
          width: size * 0.54,
          height: size * 0.54,
          background:
            'radial-gradient(circle, rgba(212,165,116,0.48) 0%, rgba(212,165,116,0) 60%)',
          filter: 'blur(38px)',
        }}
      />
    </div>
  );
}

/* ───────────────────────────────────────────────────────
   VerifiedBadge — gradient ring · checkmark · halo
   Replaces the wax seal. Use for validated states
   (KYC validé, compliance clear, account verified).
   ─────────────────────────────────────────────────────── */
export function VerifiedBadge({ size = 56, label, className = '' }) {
  return (
    <div className={`inline-flex flex-col items-center gap-1.5 ${className}`}>
      <div
        className="relative inline-flex items-center justify-center verified-pop"
        style={{ width: size, height: size }}
      >
        {/* Halo */}
        <span
          aria-hidden="true"
          className="absolute rounded-full animate-halo-pulse"
          style={{
            inset: `-${Math.round(size * 0.16)}px`,
            background:
              'radial-gradient(circle, rgba(124,94,60,0.28) 0%, rgba(124,94,60,0) 62%)',
          }}
        />
        <svg
          width={size}
          height={size}
          viewBox="0 0 48 48"
          fill="none"
          className="relative"
        >
          <defs>
            <linearGradient id="vb-ring" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={BRONZE_HI} />
              <stop offset="50%" stopColor={BRONZE_2} />
              <stop offset="100%" stopColor={BRONZE} />
            </linearGradient>
            <radialGradient id="vb-fill" cx="34%" cy="28%" r="80%">
              <stop offset="0%" stopColor="#E9C79C" />
              <stop offset="45%" stopColor={BRONZE_2} />
              <stop offset="100%" stopColor={BRONZE} />
            </radialGradient>
          </defs>
          {/* Outer gradient ring */}
          <circle
            cx="24" cy="24" r="22"
            stroke="url(#vb-ring)"
            strokeWidth="2"
            fill="rgba(255,255,255,0.6)"
          />
          {/* Inner filled disc */}
          <circle cx="24" cy="24" r="17" fill="url(#vb-fill)" />
          {/* Specular highlight */}
          <ellipse cx="18" cy="16" rx="8" ry="5" fill="rgba(255,255,255,0.32)" />
          {/* Check */}
          <path
            d="M15 24 L21.5 30 L33 18"
            stroke="#FFFFFF"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
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
   GradientRule — modern divider
   Gradient hairline with a small bronze dot in the center.
   Replaces the fleuron ornament.
   ─────────────────────────────────────────────────────── */
export function GradientRule({ className = '' }) {
  return (
    <div
      className={`flex items-center gap-3 ${className}`}
      aria-hidden="true"
    >
      <span
        className="flex-1 h-px"
        style={{
          background:
            'linear-gradient(to right, transparent, rgba(124,94,60,0.35))',
        }}
      />
      <span className="relative inline-flex items-center justify-center" style={{ width: 10, height: 10 }}>
        <span
          className="absolute inset-0 rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(124,94,60,0.25) 0%, rgba(124,94,60,0) 70%)',
          }}
        />
        <span
          className="relative w-[6px] h-[6px] rounded-full"
          style={{
            background: `linear-gradient(135deg, ${BRONZE_HI}, ${BRONZE})`,
            boxShadow: '0 0 0 1px rgba(124,94,60,0.2)',
          }}
        />
      </span>
      <span
        className="flex-1 h-px"
        style={{
          background:
            'linear-gradient(to left, transparent, rgba(124,94,60,0.35))',
        }}
      />
    </div>
  );
}

/* ───────────────────────────────────────────────────────
   LiveIndicator — pulsing live dot
   Modern "live" signal with ping animation. Use for
   live data, real-time sync, active monitoring.
   ─────────────────────────────────────────────────────── */
const LIVE_TONES = {
  success: { dot: '#16A34A', ping: 'rgba(22,163,74,0.35)' },
  bronze:  { dot: BRONZE,    ping: 'rgba(124,94,60,0.35)' },
  info:    { dot: '#2563EB', ping: 'rgba(37,99,235,0.32)' },
  warning: { dot: '#CA8A04', ping: 'rgba(202,138,4,0.32)'  },
};
export function LiveIndicator({ tone = 'success', label, className = '' }) {
  const { dot, ping } = LIVE_TONES[tone] || LIVE_TONES.success;
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="relative inline-flex" style={{ width: 8, height: 8 }}>
        <span
          className="absolute inset-0 rounded-full animate-live-ping"
          style={{ background: ping }}
        />
        <span
          className="relative inline-block w-2 h-2 rounded-full"
          style={{ background: dot, boxShadow: `0 0 0 2px rgba(255,255,255,0.9)` }}
        />
      </span>
      {label && (
        <span className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-[#4A4A4A]">
          {label}
        </span>
      )}
    </span>
  );
}

/* ───────────────────────────────────────────────────────
   ChartLineBackdrop — decorative area chart
   SVG sparkline-ish curve as a hero ornament. Not data.
   ─────────────────────────────────────────────────────── */
export function ChartLineBackdrop({ className = '', width = 800, height = 200, opacity = 1 }) {
  return (
    <svg
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
      preserveAspectRatio="none"
      style={{ opacity }}
    >
      <defs>
        <linearGradient id="cl-area" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"  stopColor="rgba(212,165,116,0.38)" />
          <stop offset="70%" stopColor="rgba(212,165,116,0.04)" />
          <stop offset="100%" stopColor="rgba(212,165,116,0)" />
        </linearGradient>
        <linearGradient id="cl-stroke" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"  stopColor="rgba(124,94,60,0)" />
          <stop offset="35%" stopColor="rgba(154,122,81,0.9)" />
          <stop offset="75%" stopColor="rgba(212,165,116,1)" />
          <stop offset="100%" stopColor="rgba(124,94,60,0)" />
        </linearGradient>
      </defs>
      <path
        d="M0 140 C 80 110, 140 60, 220 80 S 340 170, 420 120 S 540 50, 620 80 S 740 160, 800 100 L800 200 L0 200 Z"
        fill="url(#cl-area)"
      />
      <path
        d="M0 140 C 80 110, 140 60, 220 80 S 340 170, 420 120 S 540 50, 620 80 S 740 160, 800 100"
        stroke="url(#cl-stroke)"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/* ───────────────────────────────────────────────────────
   SparklineBadge — tiny area spark for metric tiles
   ─────────────────────────────────────────────────────── */
export function SparklineBadge({
  points = [14, 18, 12, 22, 19, 26, 24, 30, 28, 34],
  width = 72,
  height = 22,
  tone = 'bronze',
  className = '',
}) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = width / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = i * step;
    const y = height - 2 - ((p - min) / range) * (height - 4);
    return [x, y];
  });
  const linePath = coords
    .map(([x, y], i) => (i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`))
    .join(' ');
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;
  const stroke = tone === 'success' ? '#16A34A' : BRONZE;
  const fillTop =
    tone === 'success' ? 'rgba(22,163,74,0.22)' : 'rgba(212,165,116,0.32)';
  const last = coords[coords.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient id={`spark-${tone}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"  stopColor={fillTop} />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#spark-${tone})`} />
      <path
        d={linePath}
        stroke={stroke}
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx={last[0]} cy={last[1]} r="1.8" fill={stroke} />
      <circle cx={last[0]} cy={last[1]} r="3.2" fill={stroke} opacity="0.22" />
    </svg>
  );
}
