// One-shot cleanup script — archive a DFNS policy by ID.
// Usage: node scripts/archive-policy.mjs <policyId>
// Requires DFNS_* env vars (same ones the server uses).
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DfnsApiClient } from '@dfns/sdk';
import { AsymmetricKeySigner } from '@dfns/sdk-keysigner';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const policyId = process.argv[2];
if (!policyId) {
  console.error('Usage: node scripts/archive-policy.mjs <policyId>');
  process.exit(1);
}

const privateKey = process.env.DFNS_PRIVATE_KEY
  ? process.env.DFNS_PRIVATE_KEY.replace(/\\n/g, '\n')
  : fs.readFileSync(path.join(__dirname, '..', 'dfns-private-key.pem'), 'utf8');

const signer = new AsymmetricKeySigner({
  credId: process.env.DFNS_CRED_ID,
  privateKey,
  appOrigin: process.env.APP_ORIGIN || 'http://localhost:5174',
});

const dfns = new DfnsApiClient({
  baseUrl: process.env.DFNS_API_URL || 'https://api.dfns.io',
  appId: process.env.DFNS_APP_ID,
  authToken: process.env.DFNS_API_TOKEN,
  signer,
});

console.log(`Archiving DFNS policy ${policyId}...`);
try {
  const before = await dfns.policies.getPolicy({ policyId });
  console.log('Before:', JSON.stringify({ id: before.id, name: before.name, status: before.status, action: before.action, rule: before.rule }, null, 2));
  const result = await dfns.policies.archivePolicy({ policyId });
  console.log('Archive result:', JSON.stringify(result, null, 2));
  const after = await dfns.policies.getPolicy({ policyId }).catch(() => null);
  if (after) console.log('After status:', after.status);
} catch (err) {
  console.error('Failed:', err.message);
  if (err.context) console.error('Context:', JSON.stringify(err.context, null, 2));
  process.exit(1);
}
