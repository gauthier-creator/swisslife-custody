/* ═══════════════════════════════════════════════════════
   SwissLife Custody — Bespoke Icon System
   Generated with Google Stitch (Gemini 3.1 Pro), post-edited
   for consistency: 24×24 viewBox, 1.6px stroke, currentColor.

   Philosophy: "Miniature seals" — each glyph is a crafted emblem
   matching Ramify's monochrome sidebar DNA. No generic Material
   or Feather icons. Tiny bronze accent dot is optional (opt-in
   via the `accent` prop).
   ═══════════════════════════════════════════════════════ */

function Icon({ children, size = 22, accent = false, className = '', ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      {children}
      {accent && <circle cx="20" cy="4" r="1.2" fill="#7C5E3C" stroke="none" />}
    </svg>
  );
}

/* 1. Clients — three overlapping figures */
export function IconClients(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="7" r="3" />
      <path d="M12 14c-3 0-5 2-5 4v1h10v-1c0-2-2-4-5-4z" />
      <path d="M5 8a2 2 0 0 0 0 4" opacity="0.55" />
      <path d="M19 8a2 2 0 0 1 0 4" opacity="0.55" />
    </Icon>
  );
}

/* 2. Wallets — vault door with dial */
export function IconWallets(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="8" x2="12" y2="9" />
      <line x1="16" y1="12" x2="15" y2="12" />
      <line x1="12" y1="16" x2="12" y2="15" />
      <line x1="8"  y1="12" x2="9"  y2="12" />
    </Icon>
  );
}

/* 3. Compliance — shield with checkmark */
export function IconCompliance(props) {
  return (
    <Icon {...props}>
      <path d="M12 2 4 5v6c0 5.5 3.5 10.5 8 12 4.5-1.5 8-6.5 8-12V5l-8-3z" />
      <path d="M9 12l2 2 4-4" />
    </Icon>
  );
}

/* 4. Policies — scales of justice */
export function IconPolicies(props) {
  return (
    <Icon {...props}>
      <line x1="12" y1="3" x2="12" y2="21" />
      <line x1="7"  y1="7" x2="17" y2="7" />
      <path d="M7 7c0 4 2 6 5 6s5-2 5-6" />
      <path d="M5 21h14" />
    </Icon>
  );
}

/* 5. Configuration — gear with inner circle */
export function IconConfig(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2.5M12 19.5V22M4.22 4.22l1.77 1.77M18.01 18.01l1.77 1.77M2 12h2.5M19.5 12H22M4.22 19.78l1.77-1.77M18.01 5.99l1.77-1.77" />
    </Icon>
  );
}

/* 6. Reporting — document with chart bars */
export function IconReporting(props) {
  return (
    <Icon {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8"  y1="13" x2="8"  y2="17" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <line x1="16" y1="14" x2="16" y2="17" />
    </Icon>
  );
}

/* 7. Transfers — dual-direction arrows */
export function IconTransfers(props) {
  return (
    <Icon {...props}>
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </Icon>
  );
}

/* 8. Mandate — rolled scroll with ribbon */
export function IconMandate(props) {
  return (
    <Icon {...props}>
      <path d="M7 20h10" />
      <path d="M6 18V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v14" />
      <path d="M6 18c0 1.1.9 2 2 2s2-.9 2-2V6" />
      <path d="M15 22l1-4h3l1 4" />
    </Icon>
  );
}

/* 9. KYC — ID card with portrait silhouette */
export function IconKYC(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="M5 16c0-2 2-3 4-3s4 1 4 3" />
      <line x1="15" y1="8"  x2="18" y2="8"  />
      <line x1="15" y1="12" x2="18" y2="12" />
      <line x1="15" y1="16" x2="17" y2="16" />
    </Icon>
  );
}

/* 10. Audit — magnifier over document */
export function IconAudit(props) {
  return (
    <Icon {...props}>
      <circle cx="10" cy="10" r="6" />
      <line x1="21" y1="21" x2="15" y2="15" />
      <path d="M7 8h6" />
      <path d="M7 12h3" />
    </Icon>
  );
}

/* 11. Custody — hexagonal medallion with lock */
export function IconCustody(props) {
  return (
    <Icon {...props}>
      <path d="M12 2l9 4.5v11L12 22l-9-4.5v-11L12 2z" />
      <rect x="9" y="10" width="6" height="5" rx="1" />
      <path d="M10 10V8a2 2 0 1 1 4 0v2" />
    </Icon>
  );
}

/* 12. Salesforce sync — two connected circles + arrow */
export function IconSalesforceSync(props) {
  return (
    <Icon {...props}>
      <circle cx="6"  cy="12" r="3" />
      <circle cx="18" cy="12" r="3" />
      <path d="M9 12h6" />
      <polyline points="12 9 15 12 12 15" />
    </Icon>
  );
}

/* Utility UI icons (Ramify "secondary" layer — no medallion, muted) */

export function IconSearch({ size = 16, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-5.2-5.2" />
    </svg>
  );
}

export function IconBell({ size = 17, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M6 9a6 6 0 0 1 12 0v3.5c0 1.6.5 3 1.5 4.5H4.5c1-1.5 1.5-2.9 1.5-4.5z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function IconChat({ size = 17, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M21 15a3 3 0 0 1-3 3H8l-5 4V7a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3z" />
    </svg>
  );
}

export function IconLogout({ size = 16, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    </svg>
  );
}

export function IconChevron({ size = 12, className = '', direction = 'left' }) {
  const rotate = direction === 'right' ? 'rotate(180 12 12)' : '';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M15.75 19.5 8.25 12l7.5-7.5" transform={rotate} />
    </svg>
  );
}
