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
// SALESFORCE FILES — Upload & Download proxy
// ============================================================
import multer from 'multer';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 52_428_800 } });

// List files for an Account
app.get('/api/sf-files/:accountId', async (req, res) => {
  if (!SF_CONFIGURED) return res.status(501).json({ error: 'Salesforce not configured' });
  try {
    const { accessToken, instanceUrl } = await getSalesforceToken();
    const soql = `SELECT ContentDocument.Id, ContentDocument.Title, ContentDocument.FileType, ContentDocument.ContentSize, ContentDocument.CreatedDate, ContentDocument.Description, ContentDocument.LatestPublishedVersionId FROM ContentDocumentLink WHERE LinkedEntityId = '${req.params.accountId}' ORDER BY ContentDocument.CreatedDate DESC`;
    const r = await fetch(`${instanceUrl}/services/data/v59.0/query/?q=${encodeURIComponent(soql)}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    const data = await r.json();
    const files = (data.records || []).map(r => ({
      id: r.ContentDocument.Id,
      title: r.ContentDocument.Title,
      fileType: r.ContentDocument.FileType,
      size: r.ContentDocument.ContentSize,
      createdDate: r.ContentDocument.CreatedDate,
      description: r.ContentDocument.Description,
      versionId: r.ContentDocument.LatestPublishedVersionId,
    }));
    res.json(files);
  } catch (err) {
    console.error('SF files list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Download / preview a file (proxy binary through server)
app.get('/api/sf-files/download/:versionId', async (req, res) => {
  if (!SF_CONFIGURED) return res.status(501).json({ error: 'Salesforce not configured' });
  try {
    const { accessToken, instanceUrl } = await getSalesforceToken();
    const r = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/ContentVersion/${req.params.versionId}/VersionData`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!r.ok) return res.status(r.status).json({ error: 'Download failed' });
    res.setHeader('Content-Type', r.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline`);
    const buffer = Buffer.from(await r.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    console.error('SF file download error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Upload a file to Salesforce and link it to an Account
app.post('/api/sf-files/upload/:accountId', upload.single('file'), async (req, res) => {
  if (!SF_CONFIGURED) return res.status(501).json({ error: 'Salesforce not configured' });
  if (!req.file) return res.status(400).json({ error: 'No file provided' });
  try {
    const { accessToken, instanceUrl } = await getSalesforceToken();
    const { title, description } = req.body;

    // 1. Create ContentVersion (multipart)
    const boundary = '----FormBoundary' + Date.now();
    const metadata = JSON.stringify({
      Title: title || req.file.originalname,
      PathOnClient: req.file.originalname,
      Description: description || '',
    });

    const parts = [];
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="entity_content"\r\nContent-Type: application/json\r\n\r\n${metadata}\r\n`);
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="VersionData"; filename="${req.file.originalname}"\r\nContent-Type: ${req.file.mimetype}\r\n\r\n`);
    const ending = `\r\n--${boundary}--\r\n`;

    const body = Buffer.concat([
      Buffer.from(parts[0]),
      Buffer.from(parts[1]),
      req.file.buffer,
      Buffer.from(ending),
    ]);

    const cvRes = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/ContentVersion`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    if (!cvRes.ok) {
      const err = await cvRes.json().catch(() => ({}));
      return res.status(cvRes.status).json({ error: err[0]?.message || 'Upload failed' });
    }

    const cvData = await cvRes.json();
    const contentVersionId = cvData.id;

    // 2. Get the ContentDocumentId
    const cvDetail = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/ContentVersion/${contentVersionId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    const cvInfo = await cvDetail.json();
    const contentDocumentId = cvInfo.ContentDocumentId;

    // 3. Create ContentDocumentLink to Account
    const linkRes = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/ContentDocumentLink`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ContentDocumentId: contentDocumentId,
        LinkedEntityId: req.params.accountId,
        ShareType: 'V',
        Visibility: 'AllUsers',
      }),
    });

    if (!linkRes.ok) {
      const err = await linkRes.json().catch(() => ({}));
      // If "already linked" error, that's fine (auto-link to owner)
      if (!err[0]?.message?.includes('already exists')) {
        return res.status(linkRes.status).json({ error: err[0]?.message || 'Link failed' });
      }
    }

    res.json({
      contentVersionId,
      contentDocumentId,
      title: title || req.file.originalname,
      size: req.file.size,
    });
  } catch (err) {
    console.error('SF file upload error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Delete a file from Salesforce
app.delete('/api/sf-files/:contentDocumentId', async (req, res) => {
  if (!SF_CONFIGURED) return res.status(501).json({ error: 'Salesforce not configured' });
  try {
    const { accessToken, instanceUrl } = await getSalesforceToken();
    const r = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/ContentDocument/${req.params.contentDocumentId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!r.ok && r.status !== 204) {
      return res.status(r.status).json({ error: 'Delete failed' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('SF file delete error:', err.message);
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
    // Sanitize body — DFNS only allows alphanumerics and _.:/+- in tags/name
    const body = { ...req.body };
    const sanitize = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_.:/+\-]/g, '');
    if (body.tags && Array.isArray(body.tags)) {
      body.tags = body.tags.map(sanitize).filter(t => t.length > 0);
    }
    if (body.name) {
      body.name = sanitize(body.name);
    }
    const data = await dfns.wallets.createWallet({ body });
    res.json(data);
  } catch (err) {
    console.error('createWallet error:', err.message);
    res.status((err.httpStatus > 99 && err.httpStatus < 1000) ? err.httpStatus : 500).json({ error: err.message, details: err.context || null });
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
