// Vérifier si un simple GET→PATCH du Metadata fonctionne sans modif.
// Si oui, notre édition est le problème. Si non, Tooling API ne supporte
// pas le round-trip pour ce Layout et il faut passer par Metadata API.
import 'dotenv/config';

const LOGIN_URL = process.env.SF_LOGIN_URL || 'https://login.salesforce.com';
const layoutId = '00hgK00000DJ9q5QAD';

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

const { accessToken, instanceUrl } = await getToken();

const r = await fetch(`${instanceUrl}/services/data/v59.0/tooling/sobjects/Layout/${layoutId}`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
const d = await r.json();
console.log('Layout top-level keys :', Object.keys(d));
console.log('Metadata top-level keys :', Object.keys(d.Metadata || {}));
console.log('layoutSections count :', (d.Metadata?.layoutSections || []).length);
console.log('First section sample :', JSON.stringify(d.Metadata.layoutSections[0], null, 2).slice(0, 500));
