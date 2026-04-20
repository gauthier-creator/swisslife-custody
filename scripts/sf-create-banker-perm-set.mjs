// Crée le Permission Set "Custody_Banquier" avec Read+Edit sur les
// 9 champs Custody_* éditables (le 10e, Custody_Eligible__c, est une
// formula field, seulement Read). Usage : assigné aux profils banquier
// (manuel, ou via API PermissionSetAssignment pour chaque User).
import 'dotenv/config';

const LOGIN_URL = process.env.SF_LOGIN_URL || 'https://login.salesforce.com';
const PS_NAME = 'Custody_Banquier';
const PS_LABEL = 'Custody · Banquier (KYC edit)';

const CUSTODY_FIELDS = [
  { field: 'Custody_KYC_Status__c',          edit: true },
  { field: 'Custody_Risk_Level__c',          edit: true },
  { field: 'Custody_Sanctions_Clear__c',     edit: true },
  { field: 'Custody_Adequacy_Done__c',       edit: true },
  { field: 'Custody_Contract_Signed__c',     edit: true },
  { field: 'Custody_Eligible__c',            edit: false },   // formula → Read only
  { field: 'Custody_KYC_Validated_At__c',    edit: true },
  { field: 'Custody_KYC_Validated_By__c',    edit: true },
  { field: 'Custody_KYC_Provider__c',        edit: true },
  { field: 'Custody_KYC_Notes__c',           edit: true },
];

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

async function sfQuery(accessToken, instanceUrl, soql) {
  const r = await fetch(`${instanceUrl}/services/data/v59.0/query/?q=${encodeURIComponent(soql)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const d = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(d));
  return d.records || [];
}

async function sfPost(accessToken, instanceUrl, path, body) {
  const r = await fetch(`${instanceUrl}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data: d };
}

const { accessToken, instanceUrl } = await getToken();

console.log(`→ Création/Récupération du PermissionSet "${PS_NAME}"…`);
let psId;
const existing = await sfQuery(accessToken, instanceUrl, `SELECT Id FROM PermissionSet WHERE Name = '${PS_NAME}'`);
if (existing.length) {
  psId = existing[0].Id;
  console.log(`  · Trouvé : ${psId}`);
} else {
  const res = await sfPost(accessToken, instanceUrl, '/services/data/v59.0/sobjects/PermissionSet/', {
    Name: PS_NAME,
    Label: PS_LABEL,
    Description: 'Accès lecture + modification aux champs Custody_* sur Account (banquier privé)',
  });
  if (!res.ok) throw new Error(`Création PS : ${JSON.stringify(res.data)}`);
  psId = res.data.id;
  console.log(`  · Créé : ${psId}`);
}

console.log('\n→ FieldPermissions…');
for (const f of CUSTODY_FIELDS) {
  const fullField = `Account.${f.field}`;
  const existing = await sfQuery(accessToken, instanceUrl,
    `SELECT Id FROM FieldPermissions WHERE ParentId = '${psId}' AND Field = '${fullField}'`
  );
  if (existing.length) {
    await fetch(`${instanceUrl}/services/data/v59.0/sobjects/FieldPermissions/${existing[0].Id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ PermissionsRead: true, PermissionsEdit: f.edit }),
    });
    console.log(`  · ${f.field.padEnd(40)} (déjà présent · ${f.edit ? 'Read+Edit' : 'Read only'})`);
    continue;
  }
  const res = await sfPost(accessToken, instanceUrl, '/services/data/v59.0/sobjects/FieldPermissions/', {
    ParentId: psId,
    Field: fullField,
    SobjectType: 'Account',
    PermissionsRead: true,
    PermissionsEdit: f.edit,
  });
  console.log(`  · ${f.field.padEnd(40)} ${res.ok ? 'OK' : 'ÉCHEC · ' + JSON.stringify(res.data).slice(0, 120)}`);
}

console.log('\n→ Assignation aux utilisateurs actifs (profil Standard User)…');
const users = await sfQuery(accessToken, instanceUrl,
  `SELECT Id, Email, Profile.Name FROM User WHERE IsActive = true`
);
console.log(`  ${users.length} utilisateur(s) actif(s)`);
for (const u of users) {
  const existing = await sfQuery(accessToken, instanceUrl,
    `SELECT Id FROM PermissionSetAssignment WHERE AssigneeId = '${u.Id}' AND PermissionSetId = '${psId}'`
  );
  if (existing.length) {
    console.log(`  · ${u.Email || u.Id}  (déjà assigné)`);
    continue;
  }
  const res = await sfPost(accessToken, instanceUrl, '/services/data/v59.0/sobjects/PermissionSetAssignment/', {
    AssigneeId: u.Id,
    PermissionSetId: psId,
  });
  console.log(`  · ${u.Email || u.Id}  ${res.ok ? 'assigné' : 'échec · ' + JSON.stringify(res.data).slice(0, 120)}`);
}

console.log('\n✓ Prêt — tous les utilisateurs actifs peuvent lire/éditer les champs Custody_* sur Account.');
