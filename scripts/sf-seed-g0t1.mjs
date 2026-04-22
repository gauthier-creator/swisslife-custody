// ============================================================
// Seed Salesforce — compte test "G0T1" avec ses vraies données INSEE
// ============================================================
// Données réelles récupérées via recherche-entreprises.api.gouv.fr
//   · SIREN 944354372, siège 1 rue des Prouvaires 75001 Paris
//   · Forme juridique 5499 (autre SARL / SAS-like)
//   · Créée 2025-04-30, NAF 66.30Z (gestion de fonds)
//   · Gérant : ALEXANDRIAN Gauthier (né 2001-12)
//
// Crée (ou met à jour) :
//   - Un Account "G0T1" avec tous les Custody_* remplis
//   - Un Contact Gauthier ALEXANDRIAN lié, Gérant, avec DOB + nationalité
//
// Usage : node scripts/sf-seed-g0t1.mjs
// ============================================================

import 'dotenv/config';

const LOGIN_URL = process.env.SF_LOGIN_URL || 'https://login.salesforce.com';

const ACCOUNT = {
  Name: 'G0T1',
  Type: 'Institutional',
  BillingStreet: '1 rue des Prouvaires',
  BillingCity: 'Paris',
  BillingPostalCode: '75001',
  BillingCountry: 'France',
  Phone: null,
  Website: null,
  Industry: 'Financial Services',
  Description: 'Gestion de fonds · code NAF 66.30Z · créée le 30 avril 2025',
  AnnualRevenue: 12000000,                      // AUM placeholder pour démo
  // Custody custom fields
  Custody_SIREN__c: '944354372',
  Custody_LEI__c: null,                         // non disponible côté INSEE, à renseigner si publié
  Custody_Incorporation_Country__c: 'FR',
  Custody_Entity_Type__c: 'Other',              // 5499 INSEE = "Autre SARL"
  Custody_KYC_Status__c: 'En cours',
  Custody_Risk_Level__c: 'Moyen',
};

const CONTACT = {
  FirstName: 'Gauthier',
  LastName: 'ALEXANDRIAN',
  Email: 'gauthier@pecule.co',
  Title: 'Gérant',
  Birthdate: '2001-12-01',                      // jour approximé (INSEE publique ne donne que AAAA-MM)
  Custody_Nationality__c: 'FR',
};

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

async function sfQuery(accessToken, instanceUrl, soql) {
  const r = await fetch(`${instanceUrl}/services/data/v59.0/query/?q=${encodeURIComponent(soql)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const d = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(d));
  return d.records || [];
}

async function sfInsert(accessToken, instanceUrl, obj, payload) {
  const r = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/${obj}/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`INSERT ${obj}: ${JSON.stringify(d)}`);
  return d;
}

async function sfPatch(accessToken, instanceUrl, obj, id, payload) {
  const r = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/${obj}/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok && r.status !== 204) {
    const d = await r.text();
    throw new Error(`PATCH ${obj} ${id}: ${r.status} ${d.slice(0, 200)}`);
  }
}

const { accessToken, instanceUrl } = await getToken();
console.log('✓ Auth OK');

// ── Account ──────────────────────────────────────────────
console.log('\n→ Recherche Account "G0T1"…');
const existingAccounts = await sfQuery(accessToken, instanceUrl,
  `SELECT Id, Name FROM Account WHERE Name = 'G0T1' LIMIT 1`
);
let accountId;
if (existingAccounts.length) {
  accountId = existingAccounts[0].Id;
  console.log(`  · Account existant : ${accountId} — mise à jour`);
  await sfPatch(accessToken, instanceUrl, 'Account', accountId, ACCOUNT);
} else {
  const r = await sfInsert(accessToken, instanceUrl, 'Account', ACCOUNT);
  accountId = r.id;
  console.log(`  · Account créé : ${accountId}`);
}

// ── Contact ──────────────────────────────────────────────
console.log('\n→ Recherche Contact "Gauthier ALEXANDRIAN" sur cet Account…');
const existingContacts = await sfQuery(accessToken, instanceUrl,
  `SELECT Id, FirstName, LastName FROM Contact WHERE AccountId = '${accountId}' AND LastName = 'ALEXANDRIAN' LIMIT 1`
);
const contactPayload = { ...CONTACT, AccountId: accountId };
let contactId;
if (existingContacts.length) {
  contactId = existingContacts[0].Id;
  console.log(`  · Contact existant : ${contactId} — mise à jour`);
  await sfPatch(accessToken, instanceUrl, 'Contact', contactId, contactPayload);
} else {
  const r = await sfInsert(accessToken, instanceUrl, 'Contact', contactPayload);
  contactId = r.id;
  console.log(`  · Contact créé : ${contactId}`);
}

console.log('\n✓ Seed terminé\n');
console.log(`  Account G0T1       : ${accountId}`);
console.log(`  Contact Gauthier   : ${contactId}`);
console.log(`\n  Fiche app  : http://localhost:5174/  →  Clients  →  G0T1`);
console.log(`  Fiche SFDC : ${instanceUrl}/lightning/r/Account/${accountId}/view`);
