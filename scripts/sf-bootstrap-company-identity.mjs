// ============================================================
// Salesforce — Bootstrap des champs d'identité société / personne
// nécessaires pour un screening AML réel (ComplyCube)
// ============================================================
// Sans ces champs, le screening ComplyCube envoie uniquement le nom,
// ce qui génère un taux de faux positifs énorme (ex. "Jean Martin"
// peut matcher 2000 PEP dans la base Dow Jones).
//
// Champs créés sur Account (personne morale) :
//   · Custody_SIREN__c               (Text 14) — SIREN/SIRET français
//   · Custody_LEI__c                 (Text 20) — Legal Entity Identifier ISO
//   · Custody_Incorporation_Country__c (Text 2) — ISO 3166-1 alpha-2
//   · Custody_Entity_Type__c         (Picklist) — SA/SAS/SARL/SCI/etc.
//
// Champs créés sur Contact (personne physique) :
//   · Custody_Nationality__c         (Text 2) — ISO 3166-1 alpha-2
//     (Birthdate est déjà standard, pas besoin de le créer)
//
// Usage : node scripts/sf-bootstrap-company-identity.mjs
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
  // ── Account (personne morale) ────────────────────────────
  {
    fullName: 'Account.Custody_SIREN__c',
    label: 'Custody · SIREN / SIRET',
    type: 'Text',
    length: 14,
    description: 'Numéro SIREN (9 chiffres) ou SIRET (14 chiffres) pour les personnes morales françaises. Envoyé à ComplyCube comme registrationNumber pour un screening précis.',
  },
  {
    fullName: 'Account.Custody_LEI__c',
    label: 'Custody · LEI',
    type: 'Text',
    length: 20,
    description: 'Legal Entity Identifier ISO 17442 (20 caractères alphanumériques). Obligatoire pour les entités financières soumises à MiFID II / EMIR.',
  },
  {
    fullName: 'Account.Custody_Incorporation_Country__c',
    label: 'Custody · Pays d\'incorporation',
    type: 'Text',
    length: 2,
    description: 'Code pays ISO 3166-1 alpha-2 (ex: FR, DE, LU) du siège social. Utilisé pour le screening ComplyCube et le risk scoring FATF.',
  },
  {
    fullName: 'Account.Custody_Entity_Type__c',
    label: 'Custody · Forme juridique',
    type: 'Picklist',
    description: 'Type d\'entité juridique',
    valueSet: {
      valueSetDefinition: {
        sorted: false,
        value: [
          { valueName: 'SA',    label: 'SA — Société anonyme' },
          { valueName: 'SAS',   label: 'SAS — Société par actions simplifiée', default: true },
          { valueName: 'SARL',  label: 'SARL — Société à responsabilité limitée' },
          { valueName: 'SCI',   label: 'SCI — Société civile immobilière' },
          { valueName: 'SCA',   label: 'SCA — Société en commandite par actions' },
          { valueName: 'SNC',   label: 'SNC — Société en nom collectif' },
          { valueName: 'EURL',  label: 'EURL — Entreprise unipersonnelle à responsabilité limitée' },
          { valueName: 'GmbH',  label: 'GmbH (Allemagne)' },
          { valueName: 'Ltd',   label: 'Ltd (UK)' },
          { valueName: 'LLC',   label: 'LLC (US)' },
          { valueName: 'Other', label: 'Autre' },
        ],
      },
    },
  },

  // ── Contact (personne physique) ──────────────────────────
  {
    fullName: 'Contact.Custody_Nationality__c',
    label: 'Custody · Nationalité',
    type: 'Text',
    length: 2,
    description: 'Code pays ISO 3166-1 alpha-2 (ex: FR, DE, IT) de la nationalité. Envoyé à ComplyCube pour personDetails.nationality — réduit drastiquement les faux positifs PEP.',
  },
];

async function fieldExists(accessToken, instanceUrl, apiName) {
  const [parent, fieldName] = apiName.split('.');
  const devName = fieldName.replace('__c', '');
  const soql = encodeURIComponent(
    `SELECT Id, DeveloperName FROM CustomField WHERE TableEnumOrId = '${parent}' AND DeveloperName = '${devName}'`
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
  console.log(`  ✓ Connecté à ${instanceUrl}`);

  const created = [];
  const skipped = [];
  const failed = [];

  for (const field of FIELDS) {
    process.stdout.write(`  · ${field.fullName.padEnd(50)} `);
    try {
      if (await fieldExists(accessToken, instanceUrl, field.fullName)) {
        console.log('déjà présent');
        skipped.push(field.fullName);
        continue;
      }
      await createField(accessToken, instanceUrl, field);
      console.log('créé ✓');
      created.push(field.fullName);
    } catch (err) {
      console.log('ÉCHEC');
      console.log(`      → ${err.message}`);
      failed.push({ name: field.fullName, error: err.message });
    }
  }

  console.log('\n── Récap ──');
  console.log(`  créés         : ${created.length}`);
  console.log(`  déjà présents : ${skipped.length}`);
  console.log(`  échec         : ${failed.length}`);
  if (failed.length) failed.forEach(f => console.log(`    · ${f.name}: ${f.error}`));

  console.log('\n⚠ Prochaines étapes manuelles dans Salesforce Setup :');
  console.log('  1. Ajouter les 4 nouveaux fields Account au Page Layout "Custody" (ou re-run sf-deploy-layout-mdapi.mjs)');
  console.log('  2. Ajouter Custody_Nationality__c + Birthdate au Page Layout Contact');
  console.log('  3. Remplir les SIREN/LEI/Pays pour les Accounts test (demo)');
  console.log('  4. Remplir Birthdate + Nationalité sur les Contacts test');
}

main().catch(err => { console.error('Échec :', err.message); process.exit(1); });
