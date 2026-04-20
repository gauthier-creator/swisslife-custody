// ============================================================
// Salesforce — Custom fields pour les UBO (Bénéficiaires Effectifs)
// ============================================================
// Les UBO sont stockés comme Contacts liés à l'Account, avec le flag
// Custody_Is_UBO__c = true. Avantage : on réutilise la PII standard
// Contact (nom, date naissance, adresse, nationalité) et on ajoute
// uniquement les champs propres à la qualité de bénéficiaire effectif.
//
// Base légale : Art. L.561-2-2 CMF · AMLD5 Art. 30 (obligation
// d'identification des bénéficiaires effectifs >25%).
//
// Idempotent. Après exécution :
//   1. Ajouter les champs au page layout Contact (manuel Setup)
//   2. Grant FLS via Permission Sets (Custody_Integration + Banquier)
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

const FIELDS = [
  {
    fullName: 'Contact.Custody_Is_UBO__c',
    label: 'Custody · Bénéficiaire effectif',
    type: 'Checkbox',
    description: 'Ce contact est un bénéficiaire effectif (UBO) du compte parent',
    defaultValue: 'false',
  },
  {
    fullName: 'Contact.Custody_UBO_Ownership_Pct__c',
    label: 'Custody · % de détention',
    type: 'Percent',
    description: 'Pourcentage du capital détenu (seuil réglementaire : 25%)',
    precision: 5,
    scale: 2,
  },
  {
    fullName: 'Contact.Custody_UBO_Control_Type__c',
    label: 'Custody · Type de contrôle',
    type: 'Picklist',
    description: 'Nature du contrôle exercé sur l\'entité',
    valueSet: {
      valueSetDefinition: {
        sorted: false,
        value: [
          { valueName: 'Capital',        default: true,  label: 'Détention du capital' },
          { valueName: 'Voting rights',  default: false, label: 'Droits de vote' },
          { valueName: 'Both',           default: false, label: 'Capital et droits de vote' },
          { valueName: 'Other',          default: false, label: 'Autre contrôle effectif' },
        ],
      },
    },
  },
  {
    fullName: 'Contact.Custody_UBO_Document_Type__c',
    label: 'Custody · Type de pièce',
    type: 'Picklist',
    description: 'Type de pièce d\'identité fournie',
    valueSet: {
      valueSetDefinition: {
        sorted: false,
        value: [
          { valueName: 'Passport',   default: true,  label: 'Passeport' },
          { valueName: 'ID Card',    default: false, label: 'Carte d\'identité' },
          { valueName: 'Driver License', default: false, label: 'Permis de conduire' },
          { valueName: 'Other',      default: false, label: 'Autre' },
        ],
      },
    },
  },
  {
    fullName: 'Contact.Custody_UBO_Document_Ref__c',
    label: 'Custody · Numéro de pièce',
    type: 'Text',
    length: 80,
    description: 'Numéro de la pièce d\'identité',
  },
  {
    fullName: 'Contact.Custody_UBO_Nationality__c',
    label: 'Custody · Nationalité',
    type: 'Text',
    length: 60,
    description: 'Nationalité déclarée du bénéficiaire effectif',
  },
  {
    fullName: 'Contact.Custody_UBO_Verified__c',
    label: 'Custody · Vérifié',
    type: 'Checkbox',
    description: 'Bénéficiaire effectif vérifié par l\'admin LCB-FT',
    defaultValue: 'false',
  },
  {
    fullName: 'Contact.Custody_UBO_Verified_By__c',
    label: 'Custody · Vérifié par',
    type: 'Text',
    length: 120,
    description: 'Email de l\'admin ayant vérifié le bénéficiaire',
  },
  {
    fullName: 'Contact.Custody_UBO_Verified_At__c',
    label: 'Custody · Vérifié le',
    type: 'DateTime',
    description: 'Horodatage de la vérification du bénéficiaire',
  },
  {
    fullName: 'Contact.Custody_UBO_Notes__c',
    label: 'Custody · Notes UBO',
    type: 'LongTextArea',
    length: 32000,
    visibleLines: 4,
    description: 'Notes internes sur le bénéficiaire effectif (contexte, documentation)',
  },
];

async function fieldExists(accessToken, instanceUrl, apiName) {
  const devName = apiName.replace('Contact.', '').replace('__c', '');
  const soql = encodeURIComponent(
    `SELECT Id FROM CustomField WHERE TableEnumOrId = 'Contact' AND DeveloperName = '${devName}'`
  );
  const r = await fetch(`${instanceUrl}/services/data/v59.0/tooling/query/?q=${soql}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const d = await r.json();
  return !!(d.records && d.records.length);
}

async function createField(accessToken, instanceUrl, field) {
  const body = {
    FullName: field.fullName,
    Metadata: {
      label: field.label,
      type: field.type,
      description: field.description,
      inlineHelpText: field.description,
      required: false,
      ...(field.length != null ? { length: field.length } : {}),
      ...(field.visibleLines != null ? { visibleLines: field.visibleLines } : {}),
      ...(field.precision != null ? { precision: field.precision } : {}),
      ...(field.scale != null ? { scale: field.scale } : {}),
      ...(field.defaultValue != null ? { defaultValue: field.defaultValue } : {}),
      ...(field.valueSet ? { valueSet: field.valueSet } : {}),
    },
  };
  const r = await fetch(`${instanceUrl}/services/data/v59.0/tooling/sobjects/CustomField/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${field.fullName}: ${JSON.stringify(d)}`);
  return d;
}

async function main() {
  console.log('→ Auth Salesforce…');
  const { accessToken, instanceUrl } = await getToken();

  const created = [], skipped = [], failed = [];
  for (const f of FIELDS) {
    process.stdout.write(`  · ${f.fullName.padEnd(44)} `);
    try {
      if (await fieldExists(accessToken, instanceUrl, f.fullName)) {
        console.log('déjà présent');
        skipped.push(f.fullName);
        continue;
      }
      await createField(accessToken, instanceUrl, f);
      console.log('créé ✓');
      created.push(f.fullName);
    } catch (err) {
      console.log('ÉCHEC');
      console.log(`      → ${err.message.slice(0, 200)}`);
      failed.push(f.fullName);
    }
  }

  console.log('\n── Récap ──');
  console.log(`  créés         : ${created.length}`);
  console.log(`  déjà présents : ${skipped.length}`);
  console.log(`  en échec      : ${failed.length}`);
}

main().catch(err => { console.error(err); process.exit(1); });
