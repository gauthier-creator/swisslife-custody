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
