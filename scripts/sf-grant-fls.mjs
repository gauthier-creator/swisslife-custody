// ============================================================
// Salesforce — Grant FLS on Custody_* fields
// ============================================================
// Les custom fields existent mais l'utilisateur OAuth (serveur)
// n'y a pas accès car sa FLS est bloquée. Ce script :
//   1. Crée (ou trouve) un Permission Set "Custody_Integration"
//   2. Y ajoute Read/Edit sur tous les Custody_* fields
//   3. L'assigne à l'utilisateur OAuth (SF_USERNAME)
//
// Usage : node scripts/sf-grant-fls.mjs
// ============================================================

import 'dotenv/config';

const LOGIN_URL = process.env.SF_LOGIN_URL || 'https://login.salesforce.com';
const PS_NAME = 'Custody_Integration';
const PS_LABEL = 'Custody · Integration (FLS)';

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
  return { accessToken: d.access_token, instanceUrl: d.instance_url, userId: d.id.split('/').pop() };
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

async function ensurePermissionSet(accessToken, instanceUrl) {
  const existing = await sfQuery(accessToken, instanceUrl, `SELECT Id, Name FROM PermissionSet WHERE Name = '${PS_NAME}'`);
  if (existing.length) {
    console.log(`  · PermissionSet "${PS_NAME}" trouvé : ${existing[0].Id}`);
    return existing[0].Id;
  }
  const res = await sfPost(accessToken, instanceUrl, '/services/data/v59.0/sobjects/PermissionSet/', {
    Name: PS_NAME,
    Label: PS_LABEL,
    Description: 'Grant FLS on Account.Custody_* fields for the integration user',
  });
  if (!res.ok) throw new Error(`Create PS: ${JSON.stringify(res.data)}`);
  console.log(`  · PermissionSet "${PS_NAME}" créé : ${res.data.id}`);
  return res.data.id;
}

async function grantFieldPermissions(accessToken, instanceUrl, permSetId) {
  // Pour chaque field, créer un FieldPermissions record (s'il n'existe pas déjà)
  const custodyFields = [
    'Custody_KYC_Status__c',
    'Custody_Risk_Level__c',
    'Custody_Sanctions_Clear__c',
    'Custody_Adequacy_Done__c',
    'Custody_Contract_Signed__c',
    'Custody_Eligible__c',
    'Custody_KYC_Validated_At__c',
    'Custody_KYC_Validated_By__c',
    'Custody_KYC_Provider__c',
    'Custody_KYC_Notes__c',
  ];

  let granted = 0;
  let skipped = 0;
  let failed = 0;

  for (const fieldApi of custodyFields) {
    const fullField = `Account.${fieldApi}`;
    const existing = await sfQuery(accessToken, instanceUrl,
      `SELECT Id FROM FieldPermissions WHERE ParentId = '${permSetId}' AND Field = '${fullField}'`
    );
    if (existing.length) {
      // Ensure Edit + Read are set
      const fpId = existing[0].Id;
      const r = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/FieldPermissions/${fpId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ PermissionsRead: true, PermissionsEdit: true }),
      });
      if (r.ok || r.status === 204) { skipped++; }
      else { failed++; }
      process.stdout.write(`  · ${fieldApi.padEnd(40)} déjà présent · update ${r.ok || r.status === 204 ? 'OK' : 'KO'}\n`);
      continue;
    }
    let res = await sfPost(accessToken, instanceUrl, '/services/data/v59.0/sobjects/FieldPermissions/', {
      ParentId: permSetId,
      Field: fullField,
      SobjectType: 'Account',
      PermissionsRead: true,
      PermissionsEdit: true,
    });
    // Formula/rollup fields are read-only and reject PermissionsEdit.
    // Retry with Read-only perms when we hit that specific error.
    if (!res.ok && Array.isArray(res.data) && res.data[0]?.errorCode === 'FIELD_INTEGRITY_EXCEPTION') {
      res = await sfPost(accessToken, instanceUrl, '/services/data/v59.0/sobjects/FieldPermissions/', {
        ParentId: permSetId,
        Field: fullField,
        SobjectType: 'Account',
        PermissionsRead: true,
      });
    }
    if (res.ok) {
      granted++;
      process.stdout.write(`  · ${fieldApi.padEnd(40)} grant OK\n`);
    } else {
      failed++;
      process.stdout.write(`  · ${fieldApi.padEnd(40)} grant ÉCHEC · ${JSON.stringify(res.data).slice(0, 140)}\n`);
    }
  }
  return { granted, skipped, failed };
}

async function assignToUser(accessToken, instanceUrl, permSetId, userId) {
  const existing = await sfQuery(accessToken, instanceUrl,
    `SELECT Id FROM PermissionSetAssignment WHERE PermissionSetId = '${permSetId}' AND AssigneeId = '${userId}'`
  );
  if (existing.length) {
    console.log('  · PermissionSetAssignment déjà présent');
    return;
  }
  const res = await sfPost(accessToken, instanceUrl, '/services/data/v59.0/sobjects/PermissionSetAssignment/', {
    PermissionSetId: permSetId,
    AssigneeId: userId,
  });
  if (!res.ok) throw new Error(`Assign: ${JSON.stringify(res.data)}`);
  console.log(`  · PermissionSetAssignment créé : ${res.data.id}`);
}

async function main() {
  console.log('→ Authentification…');
  const { accessToken, instanceUrl, userId } = await getToken();
  console.log(`  ✓ User OAuth : ${userId}`);

  console.log('\n→ Permission Set…');
  const permSetId = await ensurePermissionSet(accessToken, instanceUrl);

  console.log('\n→ FieldPermissions sur Custody_* …');
  const stats = await grantFieldPermissions(accessToken, instanceUrl, permSetId);

  console.log('\n→ Assignation à l\'utilisateur OAuth…');
  await assignToUser(accessToken, instanceUrl, permSetId, userId);

  console.log('\n── Récap ──');
  console.log(`  nouveaux grants : ${stats.granted}`);
  console.log(`  déjà grantés    : ${stats.skipped}`);
  console.log(`  en échec        : ${stats.failed}`);
  console.log('\n✓ Teste avec :');
  console.log(`  curl ${instanceUrl}/services/data/v59.0/query/?q=SELECT+Custody_KYC_Status__c+FROM+Account+LIMIT+1 -H "Authorization: Bearer <token>"`);
}

main().catch((err) => { console.error('Échec :', err.message); process.exit(1); });
