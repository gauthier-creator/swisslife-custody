// ============================================================
// Salesforce — Custom fields pour la répartition du patrimoine
// ============================================================
// Le "Patrimoine consolidé" affiché dans l'app était une fake
// dérivation (15%/65%/15%/5% de AnnualRevenue). Maintenant on lit
// 4 champs SFDC dédiés, remplissables par le banquier dans le CRM.
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
  if (!r.ok) throw new Error(JSON.stringify(d));
  return { accessToken: d.access_token, instanceUrl: d.instance_url };
}

const FIELDS = [
  {
    fullName: 'Account.Custody_AUM_Liquidity__c',
    label: 'Custody · Liquidités',
    type: 'Currency',
    precision: 18, scale: 2,
    description: 'Comptes courants et dépôts à vue',
  },
  {
    fullName: 'Account.Custody_AUM_Securities__c',
    label: 'Custody · Investissements',
    type: 'Currency',
    precision: 18, scale: 2,
    description: 'Actions, obligations, fonds, assurance-vie',
  },
  {
    fullName: 'Account.Custody_AUM_RealEstate__c',
    label: 'Custody · Immobilier',
    type: 'Currency',
    precision: 18, scale: 2,
    description: 'Immobilier direct (résidences) et indirect (SCPI, OPCI)',
  },
  {
    fullName: 'Account.Custody_AUM_Crypto_Target__c',
    label: 'Custody · Crypto (cible)',
    type: 'Currency',
    precision: 18, scale: 2,
    description: 'Allocation crypto cible du client — distinct du solde réel sur les wallets custody',
  },
];

async function fieldExists(accessToken, instanceUrl, apiName) {
  const devName = apiName.replace('Account.', '').replace('__c', '');
  const soql = encodeURIComponent(
    `SELECT Id FROM CustomField WHERE TableEnumOrId = 'Account' AND DeveloperName = '${devName}'`
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
      ...(field.precision != null ? { precision: field.precision } : {}),
      ...(field.scale != null ? { scale: field.scale } : {}),
    },
  };
  const r = await fetch(`${instanceUrl}/services/data/v59.0/tooling/sobjects/CustomField/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(JSON.stringify(d));
  return d;
}

async function grantFls(accessToken, instanceUrl, psName, fields) {
  const psQuery = await fetch(
    `${instanceUrl}/services/data/v59.0/query/?q=${encodeURIComponent(`SELECT Id FROM PermissionSet WHERE Name = '${psName}'`)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const psD = await psQuery.json();
  const psId = psD.records?.[0]?.Id;
  if (!psId) { console.log(`  ⚠ PS "${psName}" introuvable — skip`); return; }

  for (const f of fields) {
    const full = f.fullName;
    const fpRes = await fetch(
      `${instanceUrl}/services/data/v59.0/query/?q=${encodeURIComponent(`SELECT Id FROM FieldPermissions WHERE ParentId = '${psId}' AND Field = '${full}'`)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const fpD = await fpRes.json();
    const payload = {
      ParentId: psId, Field: full, SobjectType: 'Account',
      PermissionsRead: true, PermissionsEdit: true,
    };
    if (fpD.records?.length) {
      await fetch(`${instanceUrl}/services/data/v59.0/sobjects/FieldPermissions/${fpD.records[0].Id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ PermissionsRead: true, PermissionsEdit: true }),
      });
    } else {
      await fetch(`${instanceUrl}/services/data/v59.0/sobjects/FieldPermissions/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
  }
  console.log(`  · ${psName} → FLS grantée sur ${fields.length} champs`);
}

async function main() {
  console.log('→ Auth Salesforce…');
  const { accessToken, instanceUrl } = await getToken();

  console.log('\n→ Création des champs…');
  for (const f of FIELDS) {
    process.stdout.write(`  · ${f.fullName.padEnd(42)} `);
    try {
      if (await fieldExists(accessToken, instanceUrl, f.fullName)) {
        console.log('déjà présent');
        continue;
      }
      await createField(accessToken, instanceUrl, f);
      console.log('créé ✓');
    } catch (err) {
      console.log('ÉCHEC · ' + err.message.slice(0, 150));
    }
  }

  console.log('\n→ FLS…');
  await grantFls(accessToken, instanceUrl, 'Custody_Integration', FIELDS);
  await grantFls(accessToken, instanceUrl, 'Custody_Banquier', FIELDS);

  console.log('\n✓ Prêt — les 4 champs patrimoine sont éditables dans SFDC.');
}

main().catch(err => { console.error(err); process.exit(1); });
