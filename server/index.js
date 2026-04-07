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

// Allow all origins in production, specific ones in dev
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
  : ['http://localhost:5174', 'http://localhost:5173'];
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// Load private key: env variable first, fallback to PEM file
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

// Salesforce proxy
app.use('/api/salesforce', async (req, res) => {
  const sfUrl = req.headers['x-sf-instance-url'];
  const sfToken = req.headers['x-sf-access-token'];
  if (!sfUrl || !sfToken) return res.status(401).json({ error: 'Salesforce credentials missing' });

  const url = new URL(req.url, sfUrl);

  try {
    const response = await fetch(url.toString(), {
      method: req.method,
      headers: {
        'Authorization': `Bearer ${sfToken}`,
        'Content-Type': 'application/json',
      },
      ...(req.method !== 'GET' && req.method !== 'HEAD' ? { body: JSON.stringify(req.body) } : {}),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === Dfns SDK routes ===

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

// Policies (v2)
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

// Test connection (simple read)
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
  // SPA fallback — Express 5 needs a named param, not bare *
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) {
      res.sendFile(path.join(distPath, 'index.html'));
    } else {
      next();
    }
  });
}

const PORT = process.env.PORT || 3002;
app.listen(PORT, '0.0.0.0', () => console.log(`Custody server running on port ${PORT}`));
