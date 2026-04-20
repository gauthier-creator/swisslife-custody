// ============================================================
// Salesforce — Ajoute une section "Custody · Conformité KYC"
// au Page Layout Account, avec les 10 champs Custody_*.
// ============================================================
// Utilise la Tooling API (GET/PATCH sur Layout) pour manipuler
// le XML de présentation sans passer par la vieille UI Aloha
// (iframe drag-drop non automatisable).
//
// Usage : node scripts/sf-add-custody-section.mjs [layoutId]
//   layoutId optionnel — défaut: le Account Layout principal
// ============================================================

import 'dotenv/config';

const LOGIN_URL = process.env.SF_LOGIN_URL || 'https://login.salesforce.com';

async function getToken() {
  const params = new URLSearchParams({
    grant_type: 'password',
    client_id: process.env.SF_CLIENT_ID,
    client_secret: process.env.SF_CLIENT_SECRET,
    username: process.env.SF_USERNAME,
    password: `${process.env.SF_PASSWORD}${process.env.SF_SECURITY_TOKEN || ''}`,
  });
  const r = await fetch(`${LOGIN_URL}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`Auth: ${JSON.stringify(d)}`);
  return { accessToken: d.access_token, instanceUrl: d.instance_url };
}

async function findLayoutId(accessToken, instanceUrl) {
  // Tooling API — chercher le layout Account (Sales) Layout
  const soql = encodeURIComponent(
    `SELECT Id, Name, TableEnumOrId FROM Layout WHERE TableEnumOrId = 'Account'`
  );
  const r = await fetch(`${instanceUrl}/services/data/v59.0/tooling/query/?q=${soql}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const d = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(d));
  console.log('  Layouts disponibles :');
  (d.records || []).forEach(l => console.log(`   · ${l.Id}  ${l.Name}`));
  // Prefer "Account (Sales) Layout", sinon le 1er
  const preferred = (d.records || []).find(l => /Account.*Sales.*Layout/i.test(l.Name || ''))
    || (d.records || []).find(l => /Account.*Layout/i.test(l.Name || ''))
    || d.records?.[0];
  return preferred?.Id;
}

async function getLayout(accessToken, instanceUrl, layoutId) {
  const r = await fetch(`${instanceUrl}/services/data/v59.0/tooling/sobjects/Layout/${layoutId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const d = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(d));
  return d;
}

async function patchLayout(accessToken, instanceUrl, layoutId, metadata) {
  const r = await fetch(`${instanceUrl}/services/data/v59.0/tooling/sobjects/Layout/${layoutId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ Metadata: metadata }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`PATCH Layout ${r.status}: ${body.slice(0, 500)}`);
  }
  return r.status === 204 ? {} : r.json().catch(() => ({}));
}

const CUSTODY_FIELDS = [
  { behavior: 'Edit',     field: 'Custody_KYC_Status__c' },
  { behavior: 'Edit',     field: 'Custody_Risk_Level__c' },
  { behavior: 'Edit',     field: 'Custody_Sanctions_Clear__c' },
  { behavior: 'Edit',     field: 'Custody_Adequacy_Done__c' },
  { behavior: 'Edit',     field: 'Custody_Contract_Signed__c' },
  { behavior: 'Readonly', field: 'Custody_Eligible__c' },       // formula field
  { behavior: 'Edit',     field: 'Custody_KYC_Validated_At__c' },
  { behavior: 'Edit',     field: 'Custody_KYC_Validated_By__c' },
  { behavior: 'Edit',     field: 'Custody_KYC_Provider__c' },
  { behavior: 'Edit',     field: 'Custody_KYC_Notes__c' },
];

// Force chaque layoutItem à respecter la shape complète que Salesforce
// retourne (tous les champs nullable présents). Sinon PATCH retourne
// "complexvalue de VALUE_STRING / un champ manquant".
function layoutItem(behavior, fieldApi) {
  return {
    analyticsCloudComponent: null,
    behavior,
    canvas: null,
    component: null,
    customLink: null,
    emptySpace: null,
    field: fieldApi,
    height: null,
    page: null,
    reportChartComponent: null,
    scontrol: null,
    showLabel: null,
    showScrollbars: null,
    width: null,
  };
}

function buildCustodySection() {
  const fields = CUSTODY_FIELDS;
  const mid = Math.ceil(fields.length / 2);
  const leftCol = fields.slice(0, mid).map(f => layoutItem(f.behavior, f.field));
  const rightCol = fields.slice(mid).map(f => layoutItem(f.behavior, f.field));
  return {
    customLabel: true,
    detailHeading: true,
    editHeading: true,
    label: 'Custody · Conformité KYC',
    style: 'TwoColumnsTopToBottom',
    layoutColumns: [
      { layoutItems: leftCol, reserved: null },
      { layoutItems: rightCol, reserved: null },
    ],
  };
}

async function main() {
  const cliLayoutId = process.argv[2];

  console.log('→ Auth Salesforce…');
  const { accessToken, instanceUrl } = await getToken();

  console.log('→ Recherche du Page Layout Account…');
  const layoutId = cliLayoutId || await findLayoutId(accessToken, instanceUrl);
  if (!layoutId) throw new Error('Aucun Layout Account trouvé');
  console.log(`  → Layout ciblé : ${layoutId}`);

  console.log('→ Lecture du Layout actuel…');
  const current = await getLayout(accessToken, instanceUrl, layoutId);
  const metadata = current.Metadata;
  if (!metadata) throw new Error('Metadata absente de la réponse');

  // Vérifier si la section existe déjà
  const existingSection = (metadata.layoutSections || []).find(s => s.label === 'Custody · Conformité KYC');

  const newSection = buildCustodySection();

  const nextSections = existingSection
    ? metadata.layoutSections.map(s => s.label === 'Custody · Conformité KYC' ? newSection : s)
    : [...(metadata.layoutSections || []), newSection];

  const nextMetadata = { ...metadata, layoutSections: nextSections };

  console.log(existingSection
    ? '→ Section "Custody" existante — mise à jour…'
    : '→ Ajout de la section "Custody · Conformité KYC"…'
  );
  await patchLayout(accessToken, instanceUrl, layoutId, nextMetadata);

  console.log('✓ Layout patché. Les 10 champs Custody_* sont maintenant visibles sur la fiche Account.');
  console.log(`\nVérifie visuellement : ${instanceUrl}/lightning/setup/ObjectManager/Account/PageLayouts/${layoutId}/view`);
}

main().catch((err) => { console.error('Échec :', err.message); process.exit(1); });
