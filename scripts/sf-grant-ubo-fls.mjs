// Grant FLS sur les Contact.Custody_* aux PermissionSets existants :
//   · Custody_Integration (user OAuth du serveur) → Read+Edit
//   · Custody_Banquier (tous banquiers)           → Read+Edit
import 'dotenv/config';

const LOGIN_URL = process.env.SF_LOGIN_URL || 'https://login.salesforce.com';
const UBO_FIELDS = [
  'Custody_Is_UBO__c',
  'Custody_UBO_Ownership_Pct__c',
  'Custody_UBO_Control_Type__c',
  'Custody_UBO_Document_Type__c',
  'Custody_UBO_Document_Ref__c',
  'Custody_UBO_Nationality__c',
  'Custody_UBO_Verified__c',
  'Custody_UBO_Verified_By__c',
  'Custody_UBO_Verified_At__c',
  'Custody_UBO_Notes__c',
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
  return r.json();
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
  return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
}

const { access_token: accessToken, instance_url: instanceUrl } = await getToken();

for (const psName of ['Custody_Integration', 'Custody_Banquier']) {
  const existing = await sfQuery(accessToken, instanceUrl,
    `SELECT Id FROM PermissionSet WHERE Name = '${psName}'`);
  if (!existing.length) {
    console.log(`⚠ PermissionSet "${psName}" introuvable — skip`);
    continue;
  }
  const psId = existing[0].Id;
  console.log(`\n→ PermissionSet "${psName}" (${psId})`);

  for (const field of UBO_FIELDS) {
    const full = `Contact.${field}`;
    const fp = await sfQuery(accessToken, instanceUrl,
      `SELECT Id FROM FieldPermissions WHERE ParentId = '${psId}' AND Field = '${full}'`);
    if (fp.length) {
      await fetch(`${instanceUrl}/services/data/v59.0/sobjects/FieldPermissions/${fp[0].Id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ PermissionsRead: true, PermissionsEdit: true }),
      });
      console.log(`  · ${field.padEnd(34)} update OK`);
      continue;
    }
    const res = await sfPost(accessToken, instanceUrl, '/services/data/v59.0/sobjects/FieldPermissions/', {
      ParentId: psId,
      Field: full,
      SobjectType: 'Contact',
      PermissionsRead: true,
      PermissionsEdit: true,
    });
    console.log(`  · ${field.padEnd(34)} ${res.ok ? 'grant OK' : 'KO ' + JSON.stringify(res.data).slice(0, 100)}`);
  }
}
console.log('\n✓ FLS grantée');
