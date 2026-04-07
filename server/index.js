import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { DfnsApiClient } from '@dfns/sdk';
import { AsymmetricKeySigner } from '@dfns/sdk-keysigner';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
  : ['http://localhost:5174', 'http://localhost:5173'];
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// ============================================================
// SALESFORCE — OAuth username-password flow (server-side)
// ============================================================
let sfAccessToken = null;
let sfInstanceUrl = null;
let sfTokenExpiry = 0;

const SF_CONFIGURED = !!(process.env.SF_CLIENT_ID && process.env.SF_USERNAME);

async function getSalesforceToken() {
  // Cache token for 1h
  if (sfAccessToken && Date.now() < sfTokenExpiry) {
    return { accessToken: sfAccessToken, instanceUrl: sfInstanceUrl };
  }

  const loginUrl = process.env.SF_LOGIN_URL || 'https://login.salesforce.com';
  const params = new URLSearchParams({
    grant_type: 'password',
    client_id: process.env.SF_CLIENT_ID,
    client_secret: process.env.SF_CLIENT_SECRET,
    username: process.env.SF_USERNAME,
    password: `${process.env.SF_PASSWORD}${process.env.SF_SECURITY_TOKEN || ''}`,
  });

  const res = await fetch(`${loginUrl}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error_description || `Salesforce OAuth failed: ${res.status}`);
  }

  const data = await res.json();
  sfAccessToken = data.access_token;
  sfInstanceUrl = data.instance_url;
  sfTokenExpiry = Date.now() + 3600_000; // 1h
  console.log(`Salesforce connected: ${sfInstanceUrl}`);
  return { accessToken: sfAccessToken, instanceUrl: sfInstanceUrl };
}

// SF status endpoint
app.get('/api/salesforce/status', (req, res) => {
  res.json({
    configured: SF_CONFIGURED,
    connected: !!sfAccessToken,
    instanceUrl: sfInstanceUrl,
  });
});

// SF proxy — server handles auth
app.use('/api/salesforce', async (req, res) => {
  if (!SF_CONFIGURED) {
    return res.status(501).json({ error: 'Salesforce not configured', mock: true });
  }

  try {
    const { accessToken, instanceUrl } = await getSalesforceToken();
    const url = new URL(req.url, instanceUrl);

    const response = await fetch(url.toString(), {
      method: req.method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      ...(req.method !== 'GET' && req.method !== 'HEAD' ? { body: JSON.stringify(req.body) } : {}),
    });

    // Token expired — refresh and retry once
    if (response.status === 401) {
      sfAccessToken = null;
      sfTokenExpiry = 0;
      const fresh = await getSalesforceToken();
      const retry = await fetch(new URL(req.url, fresh.instanceUrl).toString(), {
        method: req.method,
        headers: {
          'Authorization': `Bearer ${fresh.accessToken}`,
          'Content-Type': 'application/json',
        },
        ...(req.method !== 'GET' && req.method !== 'HEAD' ? { body: JSON.stringify(req.body) } : {}),
      });
      const data = await retry.json();
      return res.status(retry.status).json(data);
    }

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error('Salesforce proxy error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// DFNS — SDK with User Action Signing
// ============================================================
let privateKey;
if (process.env.DFNS_PRIVATE_KEY) {
  privateKey = process.env.DFNS_PRIVATE_KEY.replace(/\\n/g, '\n');
} else {
  privateKey = fs.readFileSync(path.join(__dirname, '..', 'dfns-private-key.pem'), 'utf8');
}

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

// Wallets
app.get('/api/dfns/wallets', async (req, res) => {
  try {
    const data = await dfns.wallets.listWallets({ query: { limit: req.query.limit || '200' } });
    res.json(data);
  } catch (err) {
    console.error('listWallets error:', err.message);
    res.status((err.httpStatus > 99 && err.httpStatus < 1000) ? err.httpStatus : 500).json({ error: err.message });
  }
});

app.post('/api/dfns/wallets', async (req, res) => {
  try {
    const data = await dfns.wallets.createWallet({ body: req.body });
    res.json(data);
  } catch (err) {
    console.error('createWallet error:', err.message);
    res.status((err.httpStatus > 99 && err.httpStatus < 1000) ? err.httpStatus : 500).json({ error: err.message });
  }
});

app.get('/api/dfns/wallets/:walletId', async (req, res) => {
  try {
    const data = await dfns.wallets.getWallet({ walletId: req.params.walletId });
    res.json(data);
  } catch (err) {
    console.error('getWallet error:', err.message);
    res.status((err.httpStatus > 99 && err.httpStatus < 1000) ? err.httpStatus : 500).json({ error: err.message });
  }
});

app.get('/api/dfns/wallets/:walletId/assets', async (req, res) => {
  try {
    const data = await dfns.wallets.getWalletAssets({ walletId: req.params.walletId });
    res.json(data);
  } catch (err) {
    console.error('getWalletAssets error:', err.message);
    res.status((err.httpStatus > 99 && err.httpStatus < 1000) ? err.httpStatus : 500).json({ error: err.message });
  }
});

app.get('/api/dfns/wallets/:walletId/history', async (req, res) => {
  try {
    const data = await dfns.wallets.getWalletHistory({ walletId: req.params.walletId, query: { limit: '50' } });
    res.json(data);
  } catch (err) {
    console.error('getWalletHistory error:', err.message);
    res.status((err.httpStatus > 99 && err.httpStatus < 1000) ? err.httpStatus : 500).json({ error: err.message });
  }
});

app.post('/api/dfns/wallets/:walletId/transfers', async (req, res) => {
  try {
    const data = await dfns.wallets.transferAsset({ walletId: req.params.walletId, body: req.body });
    res.json(data);
  } catch (err) {
    console.error('transferAsset error:', err.message);
    res.status((err.httpStatus > 99 && err.httpStatus < 1000) ? err.httpStatus : 500).json({ error: err.message });
  }
});

// Policies
app.get('/api/dfns/policies', async (req, res) => {
  try {
    const data = await dfns.policies.listPolicies({});
    res.json(data);
  } catch (err) {
    console.error('listPolicies error:', err.message);
    res.status((err.httpStatus > 99 && err.httpStatus < 1000) ? err.httpStatus : 500).json({ error: err.message });
  }
});

app.post('/api/dfns/policies', async (req, res) => {
  try {
    const data = await dfns.policies.createPolicy({ body: req.body });
    res.json(data);
  } catch (err) {
    console.error('createPolicy error:', err.message);
    res.status((err.httpStatus > 99 && err.httpStatus < 1000) ? err.httpStatus : 500).json({ error: err.message });
  }
});

// Test Dfns
app.get('/api/dfns/test', async (req, res) => {
  try {
    await dfns.wallets.listWallets({ query: { limit: '1' } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Serve static frontend in production
const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) {
      res.sendFile(path.join(distPath, 'index.html'));
    } else {
      next();
    }
  });
}

const PORT = process.env.PORT || 3002;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Custody server running on port ${PORT}`);
  console.log(`Salesforce: ${SF_CONFIGURED ? 'configured' : 'mock mode'}`);
  console.log(`Dfns: configured`);
});
