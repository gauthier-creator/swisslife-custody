/* ═══════════════════════════════════════════════════════
   BrandGlyphs — small monochrome identity marks
   -------------------------------------------------------
   Inspired by private-banking print marks (Patek hallmarks,
   Hermès cachets, Coutts watermarks). Each glyph is a solid
   filled shape, 24×24 viewBox, `currentColor` so it inherits
   from the parent text colour. Tiny by default (14px) — meant
   to be used as:
     · decorative seals on sections / dividers
     · empty-state markers
     · watermark dots on cards
     · bullets in eyebrow strips
   ═══════════════════════════════════════════════════════ */

const SIZE = 24;

const paths = {
  /* Four-point compass rose with a pinpoint centre (signature SwissLife mark) */
  compass: (
    <g fill="currentColor">
      <path d="M12 2 L13.2 10.8 L22 12 L13.2 13.2 L12 22 L10.8 13.2 L2 12 L10.8 10.8 Z" />
      <circle cx="12" cy="12" r="1.3" fill="#FFFFFF" />
    </g>
  ),

  /* Phosphor-style fleur — 4 lobes, gentle curves */
  fleur: (
    <path
      d="M12 2 C 12 7.5, 12 7.5, 17.5 8.5 C 22 9.2, 22 9.2, 22 12 C 22 14.8, 22 14.8, 17.5 15.5 C 12 16.5, 12 16.5, 12 22 C 12 16.5, 12 16.5, 6.5 15.5 C 2 14.8, 2 14.8, 2 12 C 2 9.2, 2 9.2, 6.5 8.5 C 12 7.5, 12 7.5, 12 2 Z"
      fill="currentColor"
    />
  ),

  /* Circular seal with inner ring + centre dot — "sealed / authenticated" */
  seal: (
    <g fill="currentColor">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="6.5" fill="#FFFFFF" />
      <circle cx="12" cy="12" r="3.5" />
    </g>
  ),

  /* Two vertical pillars with a lintel — institutional / "colonne" */
  pillars: (
    <g fill="currentColor">
      <rect x="3" y="4" width="18" height="2.2" rx="0.5" />
      <rect x="5" y="7" width="2.8" height="13" rx="0.4" />
      <rect x="16.2" y="7" width="2.8" height="13" rx="0.4" />
      <rect x="10.6" y="7" width="2.8" height="13" rx="0.4" />
      <rect x="3" y="20" width="18" height="2.2" rx="0.5" />
    </g>
  ),

  /* Upward chevron — growth / ascension */
  chevron: (
    <path
      d="M12 4 L22 18 L19 20 L12 10 L5 20 L2 18 Z"
      fill="currentColor"
    />
  ),

  /* Six-point asterisk — ornamental accent, used as bullet */
  asterisk: (
    <g fill="currentColor" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <line x1="12" y1="3" x2="12" y2="21" />
      <line x1="4.2" y1="7.5" x2="19.8" y2="16.5" />
      <line x1="4.2" y1="16.5" x2="19.8" y2="7.5" />
    </g>
  ),

  /* Tilted diamond — mark of quality / engraving */
  diamond: (
    <g fill="currentColor">
      <path d="M12 2 L22 12 L12 22 L2 12 Z" />
      <path d="M12 6 L18 12 L12 18 L6 12 Z" fill="#FFFFFF" />
    </g>
  ),

  /* Half-arc over a rule — "sous sceau notarié" */
  arc: (
    <g fill="currentColor">
      <path d="M3 15 A 9 9 0 0 1 21 15 L 21 17 L 3 17 Z" />
      <circle cx="12" cy="13.5" r="1.3" fill="#FFFFFF" />
    </g>
  ),

  /* Key silhouette — custody */
  key: (
    <g fill="currentColor">
      <circle cx="7.5" cy="12" r="4.5" />
      <circle cx="7.5" cy="12" r="1.5" fill="#FFFFFF" />
      <rect x="11.5" y="11" width="10" height="2" />
      <rect x="18" y="11" width="2" height="4.5" />
      <rect x="15" y="11" width="2" height="3.5" />
    </g>
  ),

  /* Laurel-leaf mark — trust / heritage */
  laurel: (
    <g fill="currentColor">
      <path d="M12 3 C 8 6, 7 10, 8 14 C 9 11, 10.5 9, 12 8 Z" />
      <path d="M12 3 C 16 6, 17 10, 16 14 C 15 11, 13.5 9, 12 8 Z" />
      <path d="M7 11 C 5 14, 5 17, 7 20 C 8 18, 9 16, 10 14.5 Z" />
      <path d="M17 11 C 19 14, 19 17, 17 20 C 16 18, 15 16, 14 14.5 Z" />
      <rect x="11.2" y="7" width="1.6" height="14" rx="0.6" />
    </g>
  ),

  /* Crest — heraldic shield with diagonal bar */
  crest: (
    <g fill="currentColor">
      <path d="M12 3 L 20 5 L 20 12 C 20 17, 16.5 20, 12 21 C 7.5 20, 4 17, 4 12 L 4 5 Z" />
      <path d="M7 8 L 17 14" stroke="#FFFFFF" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </g>
  ),

  /* Hexagon — geometry of the vault */
  hex: (
    <g fill="currentColor">
      <path d="M12 2 L21 7 L21 17 L12 22 L3 17 L3 7 Z" />
      <path d="M12 6 L18 9 L18 15 L12 18 L6 15 L6 9 Z" fill="#FFFFFF" />
    </g>
  ),

  /* Sun — 12-ray radiance, stamped like a cachet */
  sun: (
    <g fill="currentColor">
      <circle cx="12" cy="12" r="4" />
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i * 30 * Math.PI) / 180;
        const x1 = 12 + Math.cos(a) * 7.2;
        const y1 = 12 + Math.sin(a) * 7.2;
        const x2 = 12 + Math.cos(a) * 10.2;
        const y2 = 12 + Math.sin(a) * 10.2;
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />;
      })}
    </g>
  ),

  /* Crescent moon — balanced C-shape, lunar calendar feel */
  moon: (
    <path
      d="M18 4 C 14 4, 10 8, 10 12 C 10 16, 14 20, 18 20 C 12 20, 6 17, 6 12 C 6 7, 12 4, 18 4 Z"
      fill="currentColor"
    />
  ),

  /* Spiral — logarithmic curve, 2.5 turns */
  spiral: (
    <path
      d="M12 12 m -1 0 a 1 1 0 1 0 2 0 a 1 1 0 1 0 -2 0 m -2 0 a 3 3 0 1 0 6 0 a 3 3 0 1 0 -6 0 m -2 0 a 5 5 0 1 0 10 0 a 5 5 0 1 0 -10 0 m -2 0 a 7 7 0 1 0 14 0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  ),

  /* Scroll — rolled parchment, horizontal */
  scroll: (
    <g fill="currentColor">
      <rect x="4" y="9" width="16" height="6" rx="1.2" />
      <circle cx="4" cy="12" r="2.5" fill="#FFFFFF" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="20" cy="12" r="2.5" fill="#FFFFFF" stroke="currentColor" strokeWidth="1.6" />
      <line x1="8.5" y1="11.5" x2="15.5" y2="11.5" stroke="#FFFFFF" strokeWidth="0.8" />
      <line x1="8.5" y1="13" x2="13" y2="13" stroke="#FFFFFF" strokeWidth="0.8" />
    </g>
  ),

  /* Flame — tongue of fire, single blade */
  flame: (
    <path
      d="M12 2 C 10 6, 7 8, 7 13 C 7 17, 9.5 21, 12 21 C 14.5 21, 17 17, 17 13 C 17 11, 16 9, 14 8 C 14 10, 13 11, 12 11 C 12 8, 13 5, 12 2 Z"
      fill="currentColor"
    />
  ),

  /* Anchor — maritime trust mark */
  anchor: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="2.2" fill="currentColor" />
      <line x1="12" y1="7.2" x2="12" y2="20" />
      <line x1="8" y1="10" x2="16" y2="10" />
      <path d="M4 14 C 4 18, 7.5 20, 12 20 C 16.5 20, 20 18, 20 14" />
    </g>
  ),

  /* Mountain — triangulated peaks, steady ground */
  mountain: (
    <g fill="currentColor">
      <path d="M2 20 L 9 9 L 13 15 L 17 10 L 22 20 Z" />
      <circle cx="17" cy="6" r="1.4" />
    </g>
  ),

  /* Droplet — water mark, financial liquidity */
  droplet: (
    <g fill="currentColor">
      <path d="M12 3 C 8 9, 5 13, 5 16 C 5 19.8, 8.2 22, 12 22 C 15.8 22, 19 19.8, 19 16 C 19 13, 16 9, 12 3 Z" />
      <ellipse cx="10" cy="15" rx="1.4" ry="2.2" fill="#FFFFFF" opacity="0.6" />
    </g>
  ),

  /* Feather — quill mark, Ramify-inspired but denser */
  feather: (
    <g fill="currentColor">
      <path d="M19 4 C 12 5, 7 10, 6 17 C 6 18, 7 19, 8 19 L 11 19 L 20 10 C 21 8, 21 5, 19 4 Z" />
      <line x1="8" y1="20" x2="15" y2="13" stroke="#FFFFFF" strokeWidth="1.2" />
    </g>
  ),

  /* Eye — institutional surveillance / trust */
  eye: (
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12 C 5 6, 8.5 5, 12 5 C 15.5 5, 19 6, 22 12 C 19 18, 15.5 19, 12 19 C 8.5 19, 5 18, 2 12 Z" />
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
      <circle cx="13" cy="11" r="0.8" fill="#FFFFFF" stroke="none" />
    </g>
  ),

  /* Infinity — continuous ledger */
  infinity: (
    <path
      d="M7 12 C 7 9, 9 7, 11 9 L 13 12 L 15 15 C 17 17, 19 15, 19 12 C 19 9, 17 7, 15 9 L 13 12 L 11 15 C 9 17, 7 15, 7 12 Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  ),

  /* Triangle — upward pointing with interior dot (alchemical "air") */
  triangle: (
    <g fill="currentColor">
      <path d="M12 3 L 22 20 L 2 20 Z" />
      <circle cx="12" cy="15" r="1.6" fill="#FFFFFF" />
    </g>
  ),

  /* Keystone — architectural arch keystone */
  keystone: (
    <g fill="currentColor">
      <path d="M8 4 L 16 4 L 19 20 L 5 20 Z" />
      <path d="M10 7 L 14 7 L 15.5 17 L 8.5 17 Z" fill="#FFFFFF" />
    </g>
  ),

  /* Cross-hatch — fine filigree, premium bullet */
  hatch: (
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <line x1="5" y1="5" x2="19" y2="19" />
      <line x1="19" y1="5" x2="5" y2="19" />
      <circle cx="12" cy="12" r="2.2" fill="currentColor" />
    </g>
  ),

  /* Ring — plain double-ringed seal */
  ring: (
    <g fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
    </g>
  ),
};

/* ─── BrandGlyph — single mark renderer ──────────────── */
export function BrandGlyph({ name = 'fleur', size = 14, className = '', style }) {
  const shape = paths[name] || paths.fleur;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      fill="none"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {shape}
    </svg>
  );
}

/* ─── BrandGlyphRule — hairline with a centered glyph ─ */
export function BrandGlyphRule({ name = 'fleur', size = 12, className = '', glyphClassName = 'text-[#8A8278]' }) {
  return (
    <div className={`flex items-center gap-3 ${className}`} aria-hidden="true">
      <span className="flex-1 h-px bg-[#E7E7E7]" />
      <span className={glyphClassName}>
        <BrandGlyph name={name} size={size} />
      </span>
      <span className="flex-1 h-px bg-[#E7E7E7]" />
    </div>
  );
}

/* ─── List of all glyph names (for showcase / iteration) ─ */
export const BRAND_GLYPHS = Object.keys(paths);
