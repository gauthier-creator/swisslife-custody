import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { DfnsApiClient } from '@dfns/sdk';
import { AsymmetricKeySigner } from '@dfns/sdk-keysigner';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
  : ['http://localhost:5174', 'http://localhost:5173'];
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// ============================================================
// SUPABASE — Admin client for audit logging & compliance
// ============================================================
const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function logAudit({ userId, userEmail, userRole, action, category, entityType, entityId, clientName, salesforceAccountId, details, severity = 'info', req }) {
  try {
    await supabaseAdmin.from('audit_log').insert({
      user_id: userId || null,
      user_email: userEmail || 'system',
      user_role: userRole || 'system',
      action,
      category,
      entity_type: entityType || null,
      entity_id: entityId || null,
      client_name: clientName || null,
      salesforce_account_id: salesforceAccountId || null,
      details: details || {},
      ip_address: req?.ip || req?.headers?.['x-forwarded-for'] || null,
      severity,
    });
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
}

// ============================================================
// AUTH MIDDLEWARE — Verify Supabase JWT & extract role
// ============================================================
async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    req.user = null;
    return next();
  }
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      req.user = null;
      return next();
    }
    // Use a user-scoped client to respect RLS on custody_profiles
    const userClient = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.VITE_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const { data: profile } = await userClient
      .from('custody_profiles')
      .select('role, email, full_name')
      .eq('id', user.id)
      .single();
    req.user = {
      id: user.id,
      email: user.email,
      role: profile?.role || 'banquier',
      fullName: profile?.full_name || '',
    };
    next();
  } catch {
    req.user = null;
    next();
  }
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin role required' });
  next();
}

// Apply auth middleware globally
app.use(authMiddleware);

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

// SF Account PATCH — update custom fields (requires auth)
app.patch('/api/salesforce/account/:accountId', requireAuth, async (req, res) => {
  if (!SF_CONFIGURED) {
    return res.status(501).json({ error: 'Salesforce not configured' });
  }
  try {
    const { accessToken, instanceUrl } = await getSalesforceToken();
    const response = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/Account/${req.params.accountId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    if (response.status === 204) {
      // Log the update
      await logAudit({
        userId: req.user?.id,
        userEmail: req.user?.email,
        userRole: req.user?.role,
        action: 'salesforce_account_update',
        category: 'custody',
        entityType: 'Account',
        entityId: req.params.accountId,
        details: { updatedFields: Object.keys(req.body) },
        req,
      });
      return res.json({ success: true });
    }
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error('Salesforce account PATCH error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// SF proxy — server handles auth
app.use('/api/salesforce', async (req, res) => {
  if (!SF_CONFIGURED) {
    return res.status(501).json({ error: 'Salesforce not configured' });
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

app.post('/api/dfns/wallets', requireAuth, async (req, res) => {
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

    // Audit log: wallet creation
    await logAudit({
      action: 'wallet.created',
      category: 'wallet',
      entityType: 'wallet',
      entityId: data.id,
      clientName: req.body.name || null,
      salesforceAccountId: req.body.salesforceAccountId || null,
      details: { network: req.body.network, name: req.body.name, tags: req.body.tags },
      severity: 'info',
      req,
    });

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

// List transfers for a wallet (with compliance status)
app.get('/api/dfns/wallets/:walletId/transfers', async (req, res) => {
  try {
    const data = await dfns.wallets.listTransfers({
      walletId: req.params.walletId,
      query: { limit: req.query.limit || '50' }
    });
    res.json(data);
  } catch (err) {
    console.error('listTransfers error:', err.message);
    res.status((err.httpStatus > 99 && err.httpStatus < 1000) ? err.httpStatus : 500).json({ error: err.message });
  }
});

// Get single transfer details (includes policy/compliance status)
app.get('/api/dfns/wallets/:walletId/transfers/:transferId', async (req, res) => {
  try {
    const data = await dfns.wallets.getTransfer({
      walletId: req.params.walletId,
      transferId: req.params.transferId
    });
    res.json(data);
  } catch (err) {
    console.error('getTransfer error:', err.message);
    res.status((err.httpStatus > 99 && err.httpStatus < 1000) ? err.httpStatus : 500).json({ error: err.message });
  }
});

app.post('/api/dfns/wallets/:walletId/transfers', requireAuth, async (req, res) => {
  try {
    // Audit log: transfer attempt
    await logAudit({
      action: 'transfer.initiated',
      category: 'transfer',
      entityType: 'wallet',
      entityId: req.params.walletId,
      details: { walletId: req.params.walletId, ...req.body },
      severity: 'info',
      req,
    });

    const data = await dfns.wallets.transferAsset({ walletId: req.params.walletId, body: req.body });

    // Audit log: transfer success
    await logAudit({
      action: 'transfer.completed',
      category: 'transfer',
      entityType: 'wallet',
      entityId: req.params.walletId,
      details: { walletId: req.params.walletId, transferId: data.id, ...req.body },
      severity: 'info',
      req,
    });

    res.json(data);
  } catch (err) {
    // Audit log: transfer failure
    await logAudit({
      action: 'transfer.failed',
      category: 'transfer',
      entityType: 'wallet',
      entityId: req.params.walletId,
      details: { walletId: req.params.walletId, error: err.message, ...req.body },
      severity: 'warning',
      req,
    });

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

// ============================================================
// COMPLIANCE — Audit, Approvals, Whitelist, Risk
// ============================================================

// ---------- Audit Log ----------

// GET /api/compliance/audit-log — List audit entries with filters
app.get('/api/compliance/audit-log', async (req, res) => {
  try {
    const { category, salesforce_account_id, severity, limit = '50', offset = '0' } = req.query;
    let query = supabaseAdmin
      .from('audit_log')
      .select('*')
      .order('timestamp', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (category) query = query.eq('category', category);
    if (salesforce_account_id) query = query.eq('salesforce_account_id', salesforce_account_id);
    if (severity) query = query.eq('severity', severity);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data, count: data?.length || 0 });
  } catch (err) {
    console.error('audit-log list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/compliance/audit-log/stats — Counts by category and severity
app.get('/api/compliance/audit-log/stats', async (req, res) => {
  try {
    // Get counts by category
    const { data: allLogs, error } = await supabaseAdmin
      .from('audit_log')
      .select('category, severity');
    if (error) throw error;

    const byCategory = {};
    const bySeverity = {};
    for (const row of (allLogs || [])) {
      byCategory[row.category] = (byCategory[row.category] || 0) + 1;
      bySeverity[row.severity] = (bySeverity[row.severity] || 0) + 1;
    }

    res.json({ byCategory, bySeverity, total: allLogs?.length || 0 });
  } catch (err) {
    console.error('audit-log stats error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/audit-log — Create audit entry from frontend
app.post('/api/audit-log', requireAuth, async (req, res) => {
  try {
    const { action, category, entityType, entityId, clientName, salesforceAccountId, details } = req.body;
    await logAudit({
      userId: req.user?.id,
      userEmail: req.user?.email,
      userRole: req.user?.role,
      action,
      category,
      entityType,
      entityId,
      clientName,
      salesforceAccountId,
      details,
      req,
    });
    res.json({ success: true });
  } catch (err) {
    console.error('audit-log create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------- Transfer Approvals ----------

// GET /api/compliance/approvals — List approvals
app.get('/api/compliance/approvals', async (req, res) => {
  try {
    const { status, limit = '50', offset = '0' } = req.query;
    let query = supabaseAdmin
      .from('transfer_approvals')
      .select('*')
      .order('requested_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('approvals list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/compliance/approvals — Create a new transfer approval request
app.post('/api/compliance/approvals', requireAuth, async (req, res) => {
  try {
    const {
      walletId, to, amount, assetSymbol, network, note,
      requestedBy, requestedByEmail, clientName, salesforceAccountId,
    } = req.body;

    if (!walletId || !to || !amount) {
      return res.status(400).json({ error: 'walletId, to, and amount are required' });
    }

    const { data, error } = await supabaseAdmin.from('transfer_approvals').insert({
      wallet_id: walletId,
      to_address: to,
      amount,
      asset_symbol: assetSymbol || null,
      network: network || null,
      note: note || null,
      requested_by: requestedBy || null,
      requested_by_email: requestedByEmail || null,
      client_name: clientName || null,
      salesforce_account_id: salesforceAccountId || null,
      status: 'pending',
    }).select().single();

    if (error) throw error;

    await logAudit({
      userId: requestedBy,
      userEmail: requestedByEmail,
      action: 'approval.requested',
      category: 'approval',
      entityType: 'transfer_approval',
      entityId: data.id,
      clientName,
      salesforceAccountId,
      details: { walletId, to, amount, assetSymbol, network },
      severity: 'info',
      req,
    });

    res.json(data);
  } catch (err) {
    console.error('approval create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/compliance/approvals/:id/approve — Approve a transfer
app.patch('/api/compliance/approvals/:id/approve', requireAdmin, async (req, res) => {
  try {
    const { approvedBy, approvedByEmail, reviewedByEmail } = req.body;
    const emailToUse = approvedByEmail || reviewedByEmail;

    // Fetch the approval
    const { data: approval, error: fetchErr } = await supabaseAdmin
      .from('transfer_approvals')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (fetchErr || !approval) {
      return res.status(404).json({ error: 'Approval not found' });
    }

    if (approval.status !== 'pending') {
      return res.status(400).json({ error: `Cannot approve: status is '${approval.status}'` });
    }

    // Must be different user than requester
    if (approvedBy && approvedBy === approval.requested_by) {
      return res.status(403).json({ error: 'Approver must be a different user than the requester' });
    }

    const { data, error } = await supabaseAdmin
      .from('transfer_approvals')
      .update({
        status: 'approved',
        approved_by: approvedBy || null,
        approved_by_email: emailToUse || null,
        approved_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    await logAudit({
      userId: approvedBy,
      userEmail: emailToUse,
      action: 'approval.approved',
      category: 'approval',
      entityType: 'transfer_approval',
      entityId: data.id,
      clientName: data.client_name,
      salesforceAccountId: data.salesforce_account_id,
      details: { walletId: data.wallet_id, amount: data.amount, to: data.to_address },
      severity: 'info',
      req,
    });

    res.json(data);
  } catch (err) {
    console.error('approval approve error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/compliance/approvals/:id/reject — Reject with reason
app.patch('/api/compliance/approvals/:id/reject', requireAdmin, async (req, res) => {
  try {
    const { rejectedBy, rejectedByEmail, reviewedByEmail, reason, rejectionReason } = req.body;
    const emailToUse = rejectedByEmail || reviewedByEmail;
    const reasonToUse = reason || rejectionReason;

    const { data: approval, error: fetchErr } = await supabaseAdmin
      .from('transfer_approvals')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (fetchErr || !approval) {
      return res.status(404).json({ error: 'Approval not found' });
    }

    if (approval.status !== 'pending') {
      return res.status(400).json({ error: `Cannot reject: status is '${approval.status}'` });
    }

    const { data, error } = await supabaseAdmin
      .from('transfer_approvals')
      .update({
        status: 'rejected',
        rejected_by: rejectedBy || null,
        rejected_by_email: emailToUse || null,
        rejection_reason: reasonToUse || null,
        rejected_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    await logAudit({
      userId: rejectedBy,
      userEmail: emailToUse,
      action: 'approval.rejected',
      category: 'approval',
      entityType: 'transfer_approval',
      entityId: data.id,
      clientName: data.client_name,
      salesforceAccountId: data.salesforce_account_id,
      details: { walletId: data.wallet_id, amount: data.amount, reason: reasonToUse },
      severity: 'warning',
      req,
    });

    res.json(data);
  } catch (err) {
    console.error('approval reject error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/compliance/approvals/:id/execute — Execute an approved transfer via DFNS
app.post('/api/compliance/approvals/:id/execute', requireAdmin, async (req, res) => {
  try {
    // 1. Fetch and check status
    const { data: approval, error: fetchErr } = await supabaseAdmin
      .from('transfer_approvals')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (fetchErr || !approval) {
      return res.status(404).json({ error: 'Approval not found' });
    }

    if (approval.status !== 'approved') {
      return res.status(400).json({ error: `Cannot execute: status is '${approval.status}', must be 'approved'` });
    }

    // 2. Call DFNS to execute the transfer
    const transferBody = {
      to: approval.to_address,
      amount: approval.amount,
    };
    if (approval.asset_symbol) transferBody.assetSymbol = approval.asset_symbol;

    const transferResult = await dfns.wallets.transferAsset({
      walletId: approval.wallet_id,
      body: transferBody,
    });

    // 3. Update status to executed with tx_hash
    const { data, error } = await supabaseAdmin
      .from('transfer_approvals')
      .update({
        status: 'executed',
        tx_hash: transferResult.txHash || transferResult.id || null,
        executed_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    // 4. Audit log
    await logAudit({
      action: 'approval.executed',
      category: 'transfer',
      entityType: 'transfer_approval',
      entityId: data.id,
      clientName: data.client_name,
      salesforceAccountId: data.salesforce_account_id,
      details: {
        walletId: data.wallet_id,
        amount: data.amount,
        to: data.to_address,
        txHash: transferResult.txHash || transferResult.id,
        dfnsTransferId: transferResult.id,
      },
      severity: 'info',
      req,
    });

    res.json({ approval: data, transfer: transferResult });
  } catch (err) {
    console.error('approval execute error:', err.message);

    // Log failed execution
    await logAudit({
      action: 'approval.execution_failed',
      category: 'transfer',
      entityType: 'transfer_approval',
      entityId: req.params.id,
      details: { error: err.message },
      severity: 'critical',
      req,
    });

    res.status((err.httpStatus > 99 && err.httpStatus < 1000) ? err.httpStatus : 500).json({ error: err.message });
  }
});

// ---------- Whitelist ----------

// GET /api/compliance/whitelist/:accountId — List whitelisted addresses for a client
app.get('/api/compliance/whitelist/:accountId', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('address_whitelist')
      .select('*')
      .eq('salesforce_account_id', req.params.accountId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('whitelist list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/compliance/whitelist — Add address (status: pending)
app.post('/api/compliance/whitelist', async (req, res) => {
  try {
    const { address, network, label, salesforceAccountId, clientName, addedBy, addedByEmail } = req.body;

    if (!address || !network || !salesforceAccountId) {
      return res.status(400).json({ error: 'address, network, and salesforceAccountId are required' });
    }

    const { data, error } = await supabaseAdmin.from('address_whitelist').insert({
      address,
      network,
      label: label || null,
      salesforce_account_id: salesforceAccountId,
      client_name: clientName || null,
      added_by: addedBy || null,
      added_by_email: addedByEmail || null,
      status: 'pending',
    }).select().single();

    if (error) throw error;

    await logAudit({
      userId: addedBy,
      userEmail: addedByEmail,
      action: 'whitelist.address_added',
      category: 'whitelist',
      entityType: 'whitelist_address',
      entityId: data.id,
      clientName,
      salesforceAccountId,
      details: { address, network, label },
      severity: 'info',
      req,
    });

    res.json(data);
  } catch (err) {
    console.error('whitelist add error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/compliance/whitelist/:id/approve — Approve address (admin only)
app.patch('/api/compliance/whitelist/:id/approve', requireAdmin, async (req, res) => {
  try {
    const { approvedBy, approvedByEmail } = req.body;

    const { data, error } = await supabaseAdmin
      .from('address_whitelist')
      .update({
        status: 'approved',
        approved_by: approvedBy || null,
        approved_by_email: approvedByEmail || null,
        approved_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .eq('status', 'pending')
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'Address not found or not in pending status' });
    }

    await logAudit({
      userId: approvedBy,
      userEmail: approvedByEmail,
      action: 'whitelist.address_approved',
      category: 'whitelist',
      entityType: 'whitelist_address',
      entityId: data.id,
      clientName: data.client_name,
      salesforceAccountId: data.salesforce_account_id,
      details: { address: data.address, network: data.network },
      severity: 'info',
      req,
    });

    res.json(data);
  } catch (err) {
    console.error('whitelist approve error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/compliance/whitelist/:id/revoke — Revoke address
app.patch('/api/compliance/whitelist/:id/revoke', requireAdmin, async (req, res) => {
  try {
    const { revokedBy, revokedByEmail, reason } = req.body;

    const { data, error } = await supabaseAdmin
      .from('address_whitelist')
      .update({
        status: 'revoked',
        revoked_by: revokedBy || null,
        revoked_by_email: revokedByEmail || null,
        revoked_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'Address not found' });
    }

    await logAudit({
      userId: revokedBy,
      userEmail: revokedByEmail,
      action: 'whitelist.address_revoked',
      category: 'whitelist',
      entityType: 'whitelist_address',
      entityId: data.id,
      clientName: data.client_name,
      salesforceAccountId: data.salesforce_account_id,
      details: { address: data.address, network: data.network, reason },
      severity: 'warning',
      req,
    });

    res.json(data);
  } catch (err) {
    console.error('whitelist revoke error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/compliance/whitelist/check — Check if address+network is whitelisted
app.get('/api/compliance/whitelist/check', async (req, res) => {
  try {
    const { address, network, accountId } = req.query;

    if (!address || !network || !accountId) {
      return res.status(400).json({ error: 'address, network, and accountId query params are required' });
    }

    const { data, error } = await supabaseAdmin
      .from('address_whitelist')
      .select('id, address, network, label, status')
      .eq('salesforce_account_id', accountId)
      .eq('address', address)
      .eq('network', network)
      .eq('status', 'approved')
      .limit(1);

    if (error) throw error;

    const whitelisted = data && data.length > 0;
    res.json({ whitelisted, match: whitelisted ? data[0] : null });
  } catch (err) {
    console.error('whitelist check error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------- Risk Config ----------

// GET /api/compliance/risk/:accountId — Get risk config for client
app.get('/api/compliance/risk/:accountId', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('client_risk_config')
      .select('*')
      .eq('salesforce_account_id', req.params.accountId)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows

    res.json({ data: data || null });
  } catch (err) {
    console.error('risk config get error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/compliance/risk/:accountId — Create/update risk config (upsert)
app.put('/api/compliance/risk/:accountId', async (req, res) => {
  try {
    const {
      dailyTransferLimit, singleTransferLimit, requireWhitelist,
      requireApprovalAbove, allowedNetworks, riskLevel,
      updatedBy, updatedByEmail,
    } = req.body;

    const { data, error } = await supabaseAdmin
      .from('client_risk_config')
      .upsert({
        salesforce_account_id: req.params.accountId,
        daily_transfer_limit: dailyTransferLimit ?? null,
        single_transfer_limit: singleTransferLimit ?? null,
        require_whitelist: requireWhitelist ?? true,
        require_approval_above: requireApprovalAbove ?? null,
        allowed_networks: allowedNetworks || null,
        risk_level: riskLevel || 'standard',
        updated_by: updatedBy || null,
        updated_by_email: updatedByEmail || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'salesforce_account_id' })
      .select()
      .single();

    if (error) throw error;

    await logAudit({
      userId: updatedBy,
      userEmail: updatedByEmail,
      action: 'risk.config_updated',
      category: 'risk',
      entityType: 'risk_config',
      entityId: data.id,
      salesforceAccountId: req.params.accountId,
      details: { dailyTransferLimit, singleTransferLimit, requireWhitelist, requireApprovalAbove, riskLevel },
      severity: 'info',
      req,
    });

    res.json(data);
  } catch (err) {
    console.error('risk config update error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ADMIN SETTINGS — Feature toggles
// ============================================================
app.get('/api/admin/settings', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('admin_settings')
      .select('*')
      .single();
    if (error && error.code === 'PGRST116') {
      // No row exists yet, return defaults
      return res.json({ kyc_module_enabled: false, filing_authority: 'tracfin' });
    }
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('admin settings get error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/settings', requireAdmin, async (req, res) => {
  try {
    const updates = {};
    if (req.body.kyc_module_enabled !== undefined) updates.kyc_module_enabled = req.body.kyc_module_enabled;
    if (req.body.filing_authority !== undefined) updates.filing_authority = req.body.filing_authority;
    updates.updated_at = new Date().toISOString();

    // Upsert — try update first, insert if not exists
    const { data: existing } = await supabaseAdmin.from('admin_settings').select('id').limit(1);
    let result;
    if (existing && existing.length > 0) {
      const { data, error } = await supabaseAdmin
        .from('admin_settings')
        .update(updates)
        .eq('id', existing[0].id)
        .select()
        .single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabaseAdmin
        .from('admin_settings')
        .insert({ ...updates, kyc_module_enabled: updates.kyc_module_enabled ?? false, filing_authority: updates.filing_authority ?? 'tracfin' })
        .select()
        .single();
      if (error) throw error;
      result = data;
    }

    await logAudit({
      userEmail: req.user?.email,
      action: 'admin.settings_updated',
      category: 'admin',
      entityType: 'settings',
      details: updates,
      severity: 'info',
      req,
    });

    res.json(result);
  } catch (err) {
    console.error('admin settings update error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/compliance/risk/check-transfer — Pre-flight check
app.post('/api/compliance/risk/check-transfer', async (req, res) => {
  try {
    const { salesforceAccountId, to, amount, network } = req.body;

    if (!salesforceAccountId || !to || !amount) {
      return res.status(400).json({ error: 'salesforceAccountId, to, and amount are required' });
    }

    const warnings = [];
    const blocks = [];

    // 1. Load risk config
    const { data: config } = await supabaseAdmin
      .from('client_risk_config')
      .select('*')
      .eq('salesforce_account_id', salesforceAccountId)
      .single();

    if (!config) {
      warnings.push('No risk configuration found for this account — using defaults');
    }

    const numAmount = Number(amount);

    // 2. Check single transfer limit
    if (config?.single_transfer_limit && numAmount > Number(config.single_transfer_limit)) {
      blocks.push(`Amount ${amount} exceeds single transfer limit of ${config.single_transfer_limit}`);
    }

    // 3. Check daily transfer limit (sum today's executed transfers)
    if (config?.daily_transfer_limit) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data: todayTransfers } = await supabaseAdmin
        .from('transfer_approvals')
        .select('amount')
        .eq('salesforce_account_id', salesforceAccountId)
        .eq('status', 'executed')
        .gte('executed_at', todayStart.toISOString());

      const dailyTotal = (todayTransfers || []).reduce((sum, t) => sum + Number(t.amount || 0), 0);
      if (dailyTotal + numAmount > Number(config.daily_transfer_limit)) {
        blocks.push(`Daily total would be ${dailyTotal + numAmount}, exceeding daily limit of ${config.daily_transfer_limit}`);
      }
    }

    // 4. Check whitelist
    if (config?.require_whitelist !== false) {
      const { data: wlMatch } = await supabaseAdmin
        .from('address_whitelist')
        .select('id')
        .eq('salesforce_account_id', salesforceAccountId)
        .eq('address', to)
        .eq('status', 'approved')
        .limit(1);

      if (!wlMatch || wlMatch.length === 0) {
        blocks.push(`Destination address ${to} is not on the approved whitelist`);
      }
    }

    // 5. Check allowed networks
    if (config?.allowed_networks && network) {
      const allowed = Array.isArray(config.allowed_networks)
        ? config.allowed_networks
        : [];
      if (allowed.length > 0 && !allowed.includes(network)) {
        blocks.push(`Network '${network}' is not in allowed networks: ${allowed.join(', ')}`);
      }
    }

    // 6. Check if approval is required
    if (config?.require_approval_above && numAmount > Number(config.require_approval_above)) {
      warnings.push(`Amount exceeds ${config.require_approval_above} — manual approval required`);
    }

    const allowed = blocks.length === 0;

    // Audit the check
    await logAudit({
      action: 'risk.transfer_check',
      category: 'risk',
      entityType: 'transfer_check',
      salesforceAccountId,
      details: { to, amount, network, allowed, warnings, blocks },
      severity: allowed ? 'info' : 'warning',
      req,
    });

    res.json({ allowed, warnings, blocks });
  } catch (err) {
    console.error('risk check error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------- Alerts ----------

// GET /api/compliance/alerts — List alerts
app.get('/api/compliance/alerts', async (req, res) => {
  try {
    const { status, severity, limit = '50', offset = '0' } = req.query;
    let query = supabaseAdmin
      .from('compliance_alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (status) query = query.eq('status', status);
    if (severity) query = query.eq('severity', severity);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('alerts list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/compliance/alerts/stats — Count open alerts by severity
app.get('/api/compliance/alerts/stats', async (req, res) => {
  try {
    const { data: openAlerts, error } = await supabaseAdmin
      .from('compliance_alerts')
      .select('severity')
      .eq('status', 'open');

    if (error) throw error;

    const bySeverity = {};
    for (const row of (openAlerts || [])) {
      bySeverity[row.severity] = (bySeverity[row.severity] || 0) + 1;
    }

    res.json({ bySeverity, totalOpen: openAlerts?.length || 0 });
  } catch (err) {
    console.error('alerts stats error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/compliance/alerts/:id/acknowledge — Acknowledge alert
app.patch('/api/compliance/alerts/:id/acknowledge', async (req, res) => {
  try {
    const { acknowledgedBy, acknowledgedByEmail } = req.body;

    const { data, error } = await supabaseAdmin
      .from('compliance_alerts')
      .update({
        status: 'acknowledged',
        acknowledged_by: acknowledgedBy || null,
        acknowledged_by_email: acknowledgedByEmail || null,
        acknowledged_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    await logAudit({
      userId: acknowledgedBy,
      userEmail: acknowledgedByEmail,
      action: 'alert.acknowledged',
      category: 'alert',
      entityType: 'compliance_alert',
      entityId: data.id,
      details: { alertType: data.alert_type, severity: data.severity },
      severity: 'info',
      req,
    });

    res.json(data);
  } catch (err) {
    console.error('alert acknowledge error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/compliance/alerts/:id/resolve — Resolve alert with notes
app.patch('/api/compliance/alerts/:id/resolve', async (req, res) => {
  try {
    const { resolvedBy, resolvedByEmail, notes } = req.body;

    const { data, error } = await supabaseAdmin
      .from('compliance_alerts')
      .update({
        status: 'resolved',
        resolved_by: resolvedBy || null,
        resolved_by_email: resolvedByEmail || null,
        resolution_notes: notes || null,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    await logAudit({
      userId: resolvedBy,
      userEmail: resolvedByEmail,
      action: 'alert.resolved',
      category: 'alert',
      entityType: 'compliance_alert',
      entityId: data.id,
      details: { alertType: data.alert_type, severity: data.severity, notes },
      severity: 'info',
      req,
    });

    res.json(data);
  } catch (err) {
    console.error('alert resolve error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// KYC / KYB — ComplyCube integration
// ============================================================
const COMPLYCUBE_BASE = 'https://api.complycube.com/v1';
const COMPLYCUBE_KEY = process.env.COMPLYCUBE_API_KEY || '';

// Helper: ComplyCube API call
async function complyCubeRequest(method, path, body = null) {
  const opts = {
    method,
    headers: {
      'Authorization': COMPLYCUBE_KEY,
      'Content-Type': 'application/json',
    },
  };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);
  const res = await fetch(`${COMPLYCUBE_BASE}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `ComplyCube error: ${res.status}`);
  }
  return res.json();
}

// POST /api/kyc/upload-document — Upload doc & create verification check
app.post('/api/kyc/upload-document', upload.single('file'), async (req, res) => {
  try {
    const { salesforceAccountId, clientName, documentType, initiatedByEmail } = req.body;

    if (!salesforceAccountId || !documentType || !req.file) {
      return res.status(400).json({ error: 'salesforceAccountId, documentType, and file are required' });
    }

    if (!COMPLYCUBE_KEY) {
      return res.status(503).json({ error: 'ComplyCube API key not configured' });
    }

    let checkResult;

    {
      // ComplyCube flow
      // 1. Check if client exists, create if not
      let { data: existingChecks } = await supabaseAdmin
        .from('kyc_checks')
        .select('complycube_client_id')
        .eq('salesforce_account_id', salesforceAccountId)
        .not('complycube_client_id', 'is', null)
        .limit(1);

      let complyCubeClientId = existingChecks?.[0]?.complycube_client_id;

      if (!complyCubeClientId) {
        const ccClient = await complyCubeRequest('POST', '/clients', {
          type: 'person',
          email: initiatedByEmail || `${salesforceAccountId}@custody.swisslife.com`,
          personDetails: {
            firstName: clientName?.split(' ')[0] || 'Client',
            lastName: clientName?.split(' ').slice(1).join(' ') || salesforceAccountId,
          },
        });
        complyCubeClientId = ccClient.id;
      }

      // 2. Upload document
      const docUpload = await complyCubeRequest('POST', '/documents', {
        clientId: complyCubeClientId,
        type: documentType === 'passport' ? 'passport' :
              documentType === 'id_card' ? 'national_identity_card' :
              documentType === 'proof_of_address' ? 'utility_bill' :
              documentType === 'company_registration' ? 'company_registration' :
              'other',
      });

      // 3. Upload document image (base64)
      const base64Data = req.file.buffer.toString('base64');
      await complyCubeRequest('POST', `/documents/${docUpload.id}/upload/front`, {
        fileName: req.file.originalname,
        data: base64Data,
      });

      // 4. Create check
      const check = await complyCubeRequest('POST', '/checks', {
        clientId: complyCubeClientId,
        documentId: docUpload.id,
        type: 'document_check',
      });

      checkResult = {
        id: check.id,
        complyCubeClientId,
        status: check.status === 'complete' ? 'complete' : 'processing',
        result: check.result || {},
      };
    }

    // Save to Supabase
    const { data: kycCheck, error: dbError } = await supabaseAdmin
      .from('kyc_checks')
      .insert({
        salesforce_account_id: salesforceAccountId,
        client_name: clientName,
        complycube_client_id: checkResult.complyCubeClientId || null,
        complycube_check_id: checkResult.id,
        check_type: 'document_check',
        document_type: documentType,
        status: checkResult.status,
        result: checkResult.result,
        file_name: req.file.originalname,
        initiated_by_email: initiatedByEmail,
      })
      .select()
      .single();

    if (dbError) throw dbError;

    // Audit log
    await logAudit({
      userEmail: initiatedByEmail,
      action: 'kyc.document_uploaded',
      category: 'kyc',
      entityType: 'kyc_check',
      entityId: kycCheck.id,
      clientName,
      salesforceAccountId,
      details: { documentType, fileName: req.file.originalname, status: checkResult.status },
      severity: 'info',
      req,
    });

    res.json(kycCheck);
  } catch (err) {
    console.error('KYC upload error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/kyc/aml-screen — Run AML screening
app.post('/api/kyc/aml-screen', async (req, res) => {
  try {
    const { salesforceAccountId, clientName, initiatedByEmail } = req.body;

    if (!salesforceAccountId) {
      return res.status(400).json({ error: 'salesforceAccountId is required' });
    }

    if (!COMPLYCUBE_KEY) {
      return res.status(503).json({ error: 'ComplyCube API key not configured' });
    }

    let screenResult;

    {
      // ComplyCube AML screening
      let { data: existingChecks } = await supabaseAdmin
        .from('kyc_checks')
        .select('complycube_client_id')
        .eq('salesforce_account_id', salesforceAccountId)
        .not('complycube_client_id', 'is', null)
        .limit(1);

      const complyCubeClientId = existingChecks?.[0]?.complycube_client_id;
      if (!complyCubeClientId) {
        return res.status(400).json({ error: 'No ComplyCube client found. Upload documents first.' });
      }

      const check = await complyCubeRequest('POST', '/checks', {
        clientId: complyCubeClientId,
        type: 'screening_check',
      });

      screenResult = {
        id: check.id,
        status: check.status === 'complete' ? (check.result?.outcome === 'clear' ? 'complete' : 'failed') : 'processing',
        result: check.result || {},
      };
    }

    // Save to Supabase
    const { data: kycCheck, error: dbError } = await supabaseAdmin
      .from('kyc_checks')
      .insert({
        salesforce_account_id: salesforceAccountId,
        client_name: clientName,
        complycube_check_id: screenResult.id,
        check_type: 'screening_check',
        status: screenResult.status,
        result: screenResult.result,
        initiated_by_email: initiatedByEmail,
      })
      .select()
      .single();

    if (dbError) throw dbError;

    // Audit log
    await logAudit({
      userEmail: initiatedByEmail,
      action: 'kyc.aml_screening',
      category: 'kyc',
      entityType: 'kyc_check',
      entityId: kycCheck.id,
      clientName,
      salesforceAccountId,
      details: { status: screenResult.status, outcome: screenResult.result?.outcome },
      severity: screenResult.status === 'failed' ? 'warning' : 'info',
      req,
    });

    // If AML failed, auto-create compliance alert
    if (screenResult.status === 'failed') {
      await supabaseAdmin.from('compliance_alerts').insert({
        alert_type: 'aml_match',
        severity: 'critical',
        title: `Alerte AML — ${clientName}`,
        description: `Le screening AML pour ${clientName} a detecte des correspondances potentielles. Revue manuelle requise.`,
        salesforce_account_id: salesforceAccountId,
        client_name: clientName,
        details: screenResult.result,
        status: 'open',
      });
    }

    res.json(kycCheck);
  } catch (err) {
    console.error('KYC AML screening error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/kyc/check/:checkId — Get single check result
app.get('/api/kyc/check/:checkId', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('kyc_checks')
      .select('*')
      .eq('id', req.params.checkId)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Check not found' });

    // If still processing, poll ComplyCube
    if (data.status === 'processing' && data.complycube_check_id) {
      try {
        const ccCheck = await complyCubeRequest('GET', `/checks/${data.complycube_check_id}`);
        if (ccCheck.status === 'complete') {
          const newStatus = ccCheck.result?.outcome === 'clear' ? 'complete' : 'failed';
          await supabaseAdmin
            .from('kyc_checks')
            .update({ status: newStatus, result: ccCheck.result, updated_at: new Date().toISOString() })
            .eq('id', data.id);
          data.status = newStatus;
          data.result = ccCheck.result;
        }
      } catch (pollErr) {
        console.error('ComplyCube poll error:', pollErr.message);
      }
    }

    res.json(data);
  } catch (err) {
    console.error('KYC check get error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/kyc/status/:accountId — Get full KYC status for a client
app.get('/api/kyc/status/:accountId', async (req, res) => {
  try {
    const { data: checks, error } = await supabaseAdmin
      .from('kyc_checks')
      .select('*')
      .eq('salesforce_account_id', req.params.accountId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Determine overall status
    const docChecks = (checks || []).filter(c => c.check_type === 'document_check');
    const amlChecks = (checks || []).filter(c => c.check_type === 'screening_check');

    const allDocsComplete = docChecks.length >= 2 && docChecks.every(c => c.status === 'complete');
    const amlComplete = amlChecks.some(c => c.status === 'complete');
    const anyFailed = (checks || []).some(c => c.status === 'failed');

    // Check for manual validation
    const validationCheck = (checks || []).find(c => c.check_type === 'manual_validation' && c.status === 'complete');

    let overallStatus = 'incomplete';
    if (validationCheck) {
      overallStatus = 'validated';
    } else if (anyFailed) {
      overallStatus = 'attention_required';
    } else if (allDocsComplete && amlComplete) {
      overallStatus = 'ready_for_validation';
    } else if (docChecks.length > 0 || amlChecks.length > 0) {
      overallStatus = 'in_progress';
    }

    res.json({
      overallStatus,
      checks: checks || [],
      stats: {
        totalChecks: (checks || []).length,
        documentsVerified: docChecks.filter(c => c.status === 'complete').length,
        documentsTotal: docChecks.length,
        amlClean: amlComplete,
      },
      validatedAt: validationCheck?.created_at || null,
      validatedBy: validationCheck?.initiated_by_email || null,
    });
  } catch (err) {
    console.error('KYC status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/kyc/validate — Admin validates KYC (manual final step)
app.post('/api/kyc/validate', requireAdmin, async (req, res) => {
  try {
    const { salesforceAccountId, validatedByEmail } = req.body;

    if (!salesforceAccountId) {
      return res.status(400).json({ error: 'salesforceAccountId is required' });
    }

    // Create a manual_validation check
    const { data, error } = await supabaseAdmin
      .from('kyc_checks')
      .insert({
        salesforce_account_id: salesforceAccountId,
        check_type: 'manual_validation',
        status: 'complete',
        result: { validatedBy: validatedByEmail, validatedAt: new Date().toISOString() },
        initiated_by_email: validatedByEmail,
      })
      .select()
      .single();

    if (error) throw error;

    // Audit log
    await logAudit({
      userEmail: validatedByEmail,
      action: 'kyc.validated',
      category: 'kyc',
      entityType: 'kyc_validation',
      entityId: data.id,
      salesforceAccountId,
      details: { validatedBy: validatedByEmail },
      severity: 'info',
      req,
    });

    res.json(data);
  } catch (err) {
    console.error('KYC validate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/kyc/create-client — Create ComplyCube client
app.post('/api/kyc/create-client', async (req, res) => {
  try {
    const { salesforceAccountId, clientName, email, personType } = req.body;

    if (!COMPLYCUBE_KEY) {
      return res.status(503).json({ error: 'ComplyCube API key not configured' });
    }

    const ccClient = await complyCubeRequest('POST', '/clients', {
      type: personType || 'person',
      email: email || `${salesforceAccountId}@custody.swisslife.com`,
      personDetails: {
        firstName: clientName?.split(' ')[0] || 'Client',
        lastName: clientName?.split(' ').slice(1).join(' ') || salesforceAccountId,
      },
    });

    res.json(ccClient);
  } catch (err) {
    console.error('KYC create client error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// SAR/STR — Suspicious Activity Reports (MROS workflow)
// ============================================================
/*
  CREATE TABLE IF NOT EXISTS suspicious_activity_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_number TEXT UNIQUE,
    salesforce_account_id TEXT NOT NULL,
    client_name TEXT,
    report_type TEXT NOT NULL, -- 'SAR' or 'STR'
    status TEXT DEFAULT 'draft', -- draft, submitted, under_review, filed_with_mros, closed
    priority TEXT DEFAULT 'medium', -- low, medium, high, critical

    -- Suspicious activity details
    suspicion_type TEXT, -- structuring, unusual_pattern, sanctions_match, pep_match, source_of_funds, other
    description TEXT NOT NULL,
    evidence JSONB DEFAULT '[]',
    related_transactions JSONB DEFAULT '[]',
    related_alerts JSONB DEFAULT '[]',

    -- Amounts
    total_amount_involved NUMERIC,
    currency TEXT DEFAULT 'CHF',

    -- Workflow
    created_by_email TEXT,
    reviewed_by_email TEXT,
    reviewed_at TIMESTAMPTZ,
    filed_by_email TEXT,
    filed_at TIMESTAMPTZ,
    mros_reference TEXT,

    -- Resolution
    resolution TEXT, -- filed, dismissed, escalated
    resolution_notes TEXT,
    resolved_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
  );
*/

// Helper: generate next SAR reference number
async function generateSARReference() {
  const year = new Date().getFullYear();
  const { data, error } = await supabaseAdmin
    .from('suspicious_activity_reports')
    .select('reference_number')
    .like('reference_number', `SAR-${year}-%`)
    .order('reference_number', { ascending: false })
    .limit(1);

  let seq = 1;
  if (!error && data && data.length > 0) {
    const last = data[0].reference_number; // e.g. SAR-2026-0012
    const num = parseInt(last.split('-').pop(), 10);
    if (!isNaN(num)) seq = num + 1;
  }
  return `SAR-${year}-${String(seq).padStart(4, '0')}`;
}

// GET /api/compliance/sar/stats — Count SARs by status
app.get('/api/compliance/sar/stats', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('suspicious_activity_reports')
      .select('status');

    if (error) throw error;

    const byStatus = {};
    for (const row of (data || [])) {
      byStatus[row.status] = (byStatus[row.status] || 0) + 1;
    }
    // Aggregate both filing authorities under a combined "filed" count
    byStatus.filed_total = (byStatus.filed_with_mros || 0) + (byStatus.filed_with_tracfin || 0);

    res.json({ byStatus, total: data?.length || 0 });
  } catch (err) {
    console.error('SAR stats error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/compliance/sar — List all SARs with optional status filter
app.get('/api/compliance/sar', async (req, res) => {
  try {
    const { status, limit = '50', offset = '0' } = req.query;
    let query = supabaseAdmin
      .from('suspicious_activity_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('SAR list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/compliance/sar — Create a new SAR (draft)
app.post('/api/compliance/sar', async (req, res) => {
  try {
    const {
      salesforceAccountId, clientName, reportType, priority,
      suspicionType, description, evidence, relatedTransactions,
      relatedAlerts, totalAmountInvolved, currency, createdByEmail,
    } = req.body;

    if (!salesforceAccountId || !reportType || !description) {
      return res.status(400).json({ error: 'salesforceAccountId, reportType, and description are required' });
    }
    if (!['SAR', 'STR'].includes(reportType)) {
      return res.status(400).json({ error: 'reportType must be SAR or STR' });
    }

    const referenceNumber = await generateSARReference();

    const { data, error } = await supabaseAdmin
      .from('suspicious_activity_reports')
      .insert({
        reference_number: referenceNumber,
        salesforce_account_id: salesforceAccountId,
        client_name: clientName || null,
        report_type: reportType,
        status: 'draft',
        priority: priority || 'medium',
        suspicion_type: suspicionType || null,
        description,
        evidence: evidence || [],
        related_transactions: relatedTransactions || [],
        related_alerts: relatedAlerts || [],
        total_amount_involved: totalAmountInvolved || null,
        currency: currency || 'CHF',
        created_by_email: createdByEmail || null,
      })
      .select()
      .single();

    if (error) throw error;

    await logAudit({
      userEmail: createdByEmail,
      action: 'sar.created',
      category: 'compliance',
      entityType: 'sar',
      entityId: data.id,
      clientName,
      salesforceAccountId,
      details: { referenceNumber, reportType, suspicionType, priority },
      severity: 'high',
      req,
    });

    res.status(201).json(data);
  } catch (err) {
    console.error('SAR create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/compliance/sar/:id — Get single SAR details
app.get('/api/compliance/sar/:id', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('suspicious_activity_reports')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'SAR not found' });

    res.json(data);
  } catch (err) {
    console.error('SAR get error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/compliance/sar/:id/submit — Submit for review (draft → submitted)
app.patch('/api/compliance/sar/:id/submit', requireAdmin, async (req, res) => {
  try {
    const { submittedByEmail } = req.body;

    // Verify current status
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('suspicious_activity_reports')
      .select('status')
      .eq('id', req.params.id)
      .single();

    if (fetchErr || !existing) return res.status(404).json({ error: 'SAR not found' });
    if (existing.status !== 'draft') {
      return res.status(400).json({ error: `Cannot submit SAR in status "${existing.status}". Must be "draft".` });
    }

    const { data, error } = await supabaseAdmin
      .from('suspicious_activity_reports')
      .update({ status: 'submitted', updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    await logAudit({
      userEmail: submittedByEmail,
      action: 'sar.submitted',
      category: 'compliance',
      entityType: 'sar',
      entityId: data.id,
      details: { referenceNumber: data.reference_number },
      severity: 'high',
      req,
    });

    res.json(data);
  } catch (err) {
    console.error('SAR submit error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/compliance/sar/:id/review — Mark as reviewed (submitted → under_review)
app.patch('/api/compliance/sar/:id/review', requireAdmin, async (req, res) => {
  try {
    const { reviewedByEmail } = req.body;

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('suspicious_activity_reports')
      .select('status')
      .eq('id', req.params.id)
      .single();

    if (fetchErr || !existing) return res.status(404).json({ error: 'SAR not found' });
    if (existing.status !== 'submitted') {
      return res.status(400).json({ error: `Cannot review SAR in status "${existing.status}". Must be "submitted".` });
    }

    const { data, error } = await supabaseAdmin
      .from('suspicious_activity_reports')
      .update({
        status: 'under_review',
        reviewed_by_email: reviewedByEmail || null,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    await logAudit({
      userEmail: reviewedByEmail,
      action: 'sar.reviewed',
      category: 'compliance',
      entityType: 'sar',
      entityId: data.id,
      details: { referenceNumber: data.reference_number },
      severity: 'high',
      req,
    });

    res.json(data);
  } catch (err) {
    console.error('SAR review error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/compliance/sar/:id/file — File with MROS (under_review → filed_with_mros)
app.patch('/api/compliance/sar/:id/file', requireAdmin, async (req, res) => {
  try {
    const { filedByEmail, mrosReference } = req.body;

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('suspicious_activity_reports')
      .select('status')
      .eq('id', req.params.id)
      .single();

    if (fetchErr || !existing) return res.status(404).json({ error: 'SAR not found' });
    if (existing.status !== 'under_review') {
      return res.status(400).json({ error: `Cannot file SAR in status "${existing.status}". Must be "under_review".` });
    }

    const { data, error } = await supabaseAdmin
      .from('suspicious_activity_reports')
      .update({
        status: req.body.filingAuthority === 'mros' ? 'filed_with_mros' : 'filed_with_tracfin',
        filed_by_email: filedByEmail || null,
        filed_at: new Date().toISOString(),
        mros_reference: mrosReference || null,
        filing_authority: req.body.filingAuthority || 'tracfin',
        resolution: 'filed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    await logAudit({
      userEmail: filedByEmail,
      action: req.body.filingAuthority === 'mros' ? 'sar.filed_with_mros' : 'sar.filed_with_tracfin',
      category: 'compliance',
      entityType: 'sar',
      entityId: data.id,
      details: { referenceNumber: data.reference_number, mrosReference, filingAuthority: req.body.filingAuthority || 'tracfin' },
      severity: 'critical',
      req,
    });

    res.json(data);
  } catch (err) {
    console.error('SAR file error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/compliance/sar/:id/close — Close/dismiss SAR (any → closed)
app.patch('/api/compliance/sar/:id/close', requireAdmin, async (req, res) => {
  try {
    const { closedByEmail, resolution, resolutionNotes } = req.body;

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('suspicious_activity_reports')
      .select('status')
      .eq('id', req.params.id)
      .single();

    if (fetchErr || !existing) return res.status(404).json({ error: 'SAR not found' });
    if (existing.status === 'closed') {
      return res.status(400).json({ error: 'SAR is already closed.' });
    }

    const { data, error } = await supabaseAdmin
      .from('suspicious_activity_reports')
      .update({
        status: 'closed',
        resolution: resolution || 'dismissed',
        resolution_notes: resolutionNotes || null,
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    await logAudit({
      userEmail: closedByEmail,
      action: 'sar.closed',
      category: 'compliance',
      entityType: 'sar',
      entityId: data.id,
      details: { referenceNumber: data.reference_number, resolution: resolution || 'dismissed', resolutionNotes },
      severity: 'high',
      req,
    });

    res.json(data);
  } catch (err) {
    console.error('SAR close error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// COMPLIANCE REPORTING — Regulatory Exports

// GET /api/compliance/reports/summary — Generate compliance summary
app.get('/api/compliance/reports/summary', async (req, res) => {
  try {
    const endDate = req.query.endDate || new Date().toISOString();
    const startDate = req.query.startDate || new Date(Date.now() - 30 * 86400000).toISOString();

    // Transfer approvals in period
    const { data: transfers, error: tErr } = await supabaseAdmin
      .from('transfer_approvals')
      .select('*')
      .gte('requested_at', startDate)
      .lte('requested_at', endDate);
    if (tErr) throw tErr;

    const transfersArr = transfers || [];
    const totalVolume = transfersArr.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
    const approvalStats = { pending: 0, approved: 0, rejected: 0, executed: 0 };
    transfersArr.forEach(t => { if (approvalStats[t.status] !== undefined) approvalStats[t.status]++; });

    // KYC stats
    const { data: kycAll, error: kErr } = await supabaseAdmin.from('kyc_checks').select('*');
    if (kErr) throw kErr;
    const kycArr = kycAll || [];
    const kycStats = {
      totalClients: new Set(kycArr.map(k => k.salesforce_account_id)).size,
      validatedKyc: kycArr.filter(k => k.status === 'complete').length,
      pendingKyc: kycArr.filter(k => k.status === 'processing' || k.status === 'pending').length,
      expiredKyc: kycArr.filter(k => k.status === 'expired').length,
    };

    // Alerts in period
    const { data: alertsAll, error: aErr } = await supabaseAdmin
      .from('compliance_alerts')
      .select('*')
      .gte('created_at', startDate)
      .lte('created_at', endDate);
    if (aErr) throw aErr;
    const alertsArr = alertsAll || [];
    const bySeverity = {};
    alertsArr.forEach(a => { bySeverity[a.severity] = (bySeverity[a.severity] || 0) + 1; });
    const alertStats = {
      total: alertsArr.length,
      open: alertsArr.filter(a => a.status === 'open').length,
      resolved: alertsArr.filter(a => a.status === 'resolved').length,
      bySeverity,
    };

    // Whitelist stats
    const { data: wlAll, error: wErr } = await supabaseAdmin.from('address_whitelist').select('*');
    if (wErr) throw wErr;
    const wlArr = wlAll || [];
    const whitelistStats = {
      total: wlArr.length,
      approved: wlArr.filter(w => w.status === 'active').length,
      pending: wlArr.filter(w => w.status === 'pending_approval').length,
      revoked: wlArr.filter(w => w.status === 'revoked').length,
    };

    // Risk distribution
    const { data: riskAll, error: rErr } = await supabaseAdmin.from('client_risk_config').select('risk_level');
    if (rErr) throw rErr;
    const riskArr = riskAll || [];
    const riskDistribution = { low: 0, standard: 0, high: 0, critical: 0 };
    riskArr.forEach(r => { if (riskDistribution[r.risk_level] !== undefined) riskDistribution[r.risk_level]++; });

    // Top clients by volume
    const clientVolumes = {};
    transfersArr.forEach(t => {
      const name = t.client_name || 'Unknown';
      if (!clientVolumes[name]) clientVolumes[name] = { clientName: name, volume: 0, transferCount: 0 };
      clientVolumes[name].volume += parseFloat(t.amount) || 0;
      clientVolumes[name].transferCount++;
    });
    const topClientsByVolume = Object.values(clientVolumes)
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 5);

    res.json({
      period: { startDate, endDate },
      totalTransfers: transfersArr.length,
      totalVolume,
      averageTransferAmount: transfersArr.length ? totalVolume / transfersArr.length : 0,
      approvalStats,
      kycStats,
      alertStats,
      whitelistStats,
      riskDistribution,
      topClientsByVolume,
    });
  } catch (err) {
    console.error('Compliance summary error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/compliance/reports/audit-export — Export audit log as CSV
app.get('/api/compliance/reports/audit-export', async (req, res) => {
  try {
    const endDate = req.query.endDate || new Date().toISOString();
    const startDate = req.query.startDate || new Date(Date.now() - 30 * 86400000).toISOString();
    const { category } = req.query;

    let query = supabaseAdmin
      .from('audit_log')
      .select('*')
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .order('created_at', { ascending: false })
      .limit(5000);

    if (category) query = query.eq('category', category);

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data || []).map(e => [
      e.created_at ? new Date(e.created_at).toISOString() : '',
      (e.user_email || '').replace(/"/g, '""'),
      (e.action || '').replace(/"/g, '""'),
      e.category || '',
      e.entity_type ? `${e.entity_type}:${e.entity_id || ''}` : '',
      (e.client_name || '').replace(/"/g, '""'),
      e.severity || '',
      (typeof e.details === 'object' ? JSON.stringify(e.details) : (e.details || '')).replace(/"/g, '""'),
    ]);

    const header = 'Date,User,Action,Category,Entity,Client,Severity,Details';
    const csv = [header, ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="audit-log-${startDate.slice(0,10)}_${endDate.slice(0,10)}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('Audit export error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/compliance/reports/transfers-export — Export transfers as CSV
app.get('/api/compliance/reports/transfers-export', async (req, res) => {
  try {
    const endDate = req.query.endDate || new Date().toISOString();
    const startDate = req.query.startDate || new Date(Date.now() - 30 * 86400000).toISOString();
    const { status } = req.query;

    let query = supabaseAdmin
      .from('transfer_approvals')
      .select('*')
      .gte('requested_at', startDate)
      .lte('requested_at', endDate)
      .order('requested_at', { ascending: false })
      .limit(5000);

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data || []).map(t => [
      t.requested_at ? new Date(t.requested_at).toISOString() : '',
      (t.client_name || '').replace(/"/g, '""'),
      (t.wallet_id || '').replace(/"/g, '""'),
      (t.to_address || '').replace(/"/g, '""'),
      t.amount || '',
      t.asset_symbol || '',
      t.network || '',
      t.status || '',
      (t.approved_by_email || '').replace(/"/g, '""'),
      t.executed_at ? new Date(t.executed_at).toISOString() : '',
    ]);

    const header = 'Date,Client,Wallet,Destination,Amount,Asset,Network,Status,Approved By,Executed At';
    const csv = [header, ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="transfers-${startDate.slice(0,10)}_${endDate.slice(0,10)}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('Transfers export error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/compliance/reports/kyc-export — Export KYC status as CSV
app.get('/api/compliance/reports/kyc-export', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('kyc_checks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5000);

    if (error) throw error;

    const rows = (data || []).map(k => [
      (k.client_name || '').replace(/"/g, '""'),
      k.salesforce_account_id || '',
      k.check_type || '',
      k.document_type || '',
      k.status || '',
      k.created_at ? new Date(k.created_at).toISOString() : '',
      (k.file_name || '').replace(/"/g, '""'),
    ]);

    const header = 'Client,Account ID,Check Type,Document Type,Status,Date,File';
    const csv = [header, ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="kyc-status-${new Date().toISOString().slice(0,10)}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('KYC export error:', err.message);
    res.status(500).json({ error: err.message });
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

// ============================================================
// DELEGATIONS — Family / authorized third-party access
// ============================================================

// GET /api/delegations/:accountId — List delegations for a client
app.get('/api/delegations/:accountId', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('delegations')
      .select('*')
      .eq('grantor_account_id', req.params.accountId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err) {
    console.error('delegations list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/delegations — Create a new delegation
app.post('/api/delegations', requireAuth, async (req, res) => {
  try {
    const {
      grantorAccountId, grantorName, delegateEmail, delegateName,
      permissionLevel, transferLimit, currency, expiresAt, notes, grantedByEmail,
    } = req.body;

    if (!grantorAccountId || !delegateEmail || !permissionLevel) {
      return res.status(400).json({ error: 'grantorAccountId, delegateEmail, and permissionLevel are required' });
    }

    if (!['view', 'transfer'].includes(permissionLevel)) {
      return res.status(400).json({ error: 'permissionLevel must be "view" or "transfer"' });
    }

    const { data, error } = await supabaseAdmin.from('delegations').insert({
      grantor_account_id: grantorAccountId,
      grantor_name: grantorName || null,
      delegate_email: delegateEmail,
      delegate_name: delegateName || null,
      permission_level: permissionLevel,
      transfer_limit: transferLimit || null,
      currency: currency || 'CHF',
      expires_at: expiresAt || null,
      notes: notes || null,
      granted_by_email: grantedByEmail || req.user?.email || null,
      status: 'active',
    }).select().single();

    if (error) throw error;

    await logAudit({
      userEmail: grantedByEmail || req.user?.email,
      action: 'delegation.created',
      category: 'delegation',
      entityType: 'delegation',
      entityId: data.id,
      clientName: grantorName,
      salesforceAccountId: grantorAccountId,
      details: { delegateEmail, permissionLevel, transferLimit },
      severity: 'info',
      req,
    });

    res.json(data);
  } catch (err) {
    console.error('delegation create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/delegations/:id/revoke — Revoke a delegation
app.patch('/api/delegations/:id/revoke', requireAuth, async (req, res) => {
  try {
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('delegations')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (fetchErr || !existing) {
      return res.status(404).json({ error: 'Delegation not found' });
    }

    if (existing.status === 'revoked') {
      return res.status(400).json({ error: 'Delegation already revoked' });
    }

    const { data, error } = await supabaseAdmin
      .from('delegations')
      .update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        revoked_by_email: req.body.revokedByEmail || req.user?.email || null,
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    await logAudit({
      userEmail: req.body.revokedByEmail || req.user?.email,
      action: 'delegation.revoked',
      category: 'delegation',
      entityType: 'delegation',
      entityId: data.id,
      clientName: existing.grantor_name,
      salesforceAccountId: existing.grantor_account_id,
      details: { delegateEmail: existing.delegate_email },
      severity: 'warning',
      req,
    });

    res.json(data);
  } catch (err) {
    console.error('delegation revoke error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/delegations/:id — Update a delegation (limit, expiry, etc.)
app.patch('/api/delegations/:id', requireAuth, async (req, res) => {
  try {
    const updates = {};
    if (req.body.permissionLevel) updates.permission_level = req.body.permissionLevel;
    if (req.body.transferLimit !== undefined) updates.transfer_limit = req.body.transferLimit;
    if (req.body.expiresAt !== undefined) updates.expires_at = req.body.expiresAt;
    if (req.body.notes !== undefined) updates.notes = req.body.notes;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('delegations')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('delegation update error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// WALLET FREEZE (GEL DES AVOIRS) — LCB-FT Compliance
// ============================================================

// GET /api/compliance/freezes — list all freezes
app.get('/api/compliance/freezes', async (req, res) => {
  try {
    const { status } = req.query;
    let query = supabaseAdmin.from('wallet_freezes').select('*').order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    console.error('freezes list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/compliance/freezes/check/:walletId — check if wallet is frozen
app.get('/api/compliance/freezes/check/:walletId', async (req, res) => {
  try {
    const { data } = await supabaseAdmin.from('wallet_freezes')
      .select('*').eq('wallet_id', req.params.walletId).eq('status', 'frozen').limit(1);
    res.json({ frozen: data && data.length > 0, freeze: data?.[0] || null });
  } catch (err) {
    console.error('freeze check error:', err.message);
    res.json({ frozen: false, freeze: null });
  }
});

// POST /api/compliance/freezes — freeze a wallet (admin only)
app.post('/api/compliance/freezes', requireAdmin, async (req, res) => {
  try {
    const { walletId, salesforceAccountId, clientName, reason, legalReference, frozenByEmail, notes } = req.body;
    if (!walletId || !reason || !frozenByEmail) {
      return res.status(400).json({ error: 'walletId, reason, frozenByEmail required' });
    }
    // Check if already frozen
    const { data: existing } = await supabaseAdmin.from('wallet_freezes')
      .select('id').eq('wallet_id', walletId).eq('status', 'frozen');
    if (existing?.length > 0) {
      return res.status(409).json({ error: 'Wallet already frozen' });
    }
    const { data, error } = await supabaseAdmin.from('wallet_freezes').insert({
      wallet_id: walletId,
      salesforce_account_id: salesforceAccountId,
      client_name: clientName,
      reason,
      legal_reference: legalReference,
      frozen_by_email: frozenByEmail,
      notes,
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    // Audit log
    await logAudit({
      userEmail: frozenByEmail,
      action: 'wallet_frozen',
      category: 'compliance',
      entityType: 'wallet',
      entityId: walletId,
      clientName,
      salesforceAccountId,
      details: { walletId, reason, legalReference, frozenBy: frozenByEmail },
      severity: 'high',
      req,
    });
    res.json(data);
  } catch (err) {
    console.error('freeze create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/compliance/freezes/:id/unfreeze — unfreeze (admin only)
app.patch('/api/compliance/freezes/:id/unfreeze', requireAdmin, async (req, res) => {
  try {
    const { unfrozenByEmail, notes } = req.body;
    if (!unfrozenByEmail) {
      return res.status(400).json({ error: 'unfrozenByEmail required' });
    }
    const { data, error } = await supabaseAdmin.from('wallet_freezes').update({
      status: 'unfrozen',
      unfrozen_by_email: unfrozenByEmail,
      unfrozen_at: new Date().toISOString(),
      notes,
    }).eq('id', req.params.id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    await logAudit({
      userEmail: unfrozenByEmail,
      action: 'wallet_unfrozen',
      category: 'compliance',
      entityType: 'wallet',
      entityId: data.wallet_id,
      clientName: data.client_name,
      salesforceAccountId: data.salesforce_account_id,
      details: { walletId: data.wallet_id, unfrozenBy: unfrozenByEmail },
      severity: 'high',
      req,
    });
    res.json(data);
  } catch (err) {
    console.error('unfreeze error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// UBO (BENEFICIAIRES EFFECTIFS) — Art. L.561-2-2 CMF
// ============================================================
app.get('/api/compliance/ubos/:accountId', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('ubos')
      .select('*').eq('salesforce_account_id', req.params.accountId).order('ownership_percentage', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    console.error('UBO list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/compliance/ubos', requireAuth, async (req, res) => {
  try {
    const { salesforceAccountId, fullName, birthDate, nationality, ownershipPercentage, controlType, address, documentType, documentReference, addedByEmail, notes } = req.body;
    if (!salesforceAccountId || !fullName || !addedByEmail) return res.status(400).json({ error: 'Required: salesforceAccountId, fullName, addedByEmail' });
    const { data, error } = await supabaseAdmin.from('ubos').insert({
      salesforce_account_id: salesforceAccountId, full_name: fullName, birth_date: birthDate,
      nationality, ownership_percentage: ownershipPercentage, control_type: controlType,
      address, document_type: documentType, document_reference: documentReference,
      added_by_email: addedByEmail, notes,
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    await supabaseAdmin.from('audit_log').insert({
      category: 'compliance', action: 'ubo_added', severity: 'medium',
      salesforce_account_id: salesforceAccountId,
      details: { fullName, ownershipPercentage, controlType },
      performed_by: addedByEmail,
    });
    res.json(data);
  } catch (err) {
    console.error('UBO create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/compliance/ubos/:id', requireAuth, async (req, res) => {
  try {
    const updates = {};
    const allowed = ['full_name', 'birth_date', 'nationality', 'ownership_percentage', 'control_type', 'address', 'document_type', 'document_reference', 'notes'];
    const camelToSnake = { fullName: 'full_name', birthDate: 'birth_date', ownershipPercentage: 'ownership_percentage', controlType: 'control_type', documentType: 'document_type', documentReference: 'document_reference' };
    for (const [key, val] of Object.entries(req.body)) {
      const snakeKey = camelToSnake[key] || key;
      if (allowed.includes(snakeKey) && val !== undefined) updates[snakeKey] = val;
    }
    updates.updated_at = new Date().toISOString();
    const { data, error } = await supabaseAdmin.from('ubos').update(updates).eq('id', req.params.id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    console.error('UBO update error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/compliance/ubos/:id/verify', requireAdmin, async (req, res) => {
  try {
    const { verifiedByEmail } = req.body;
    if (!verifiedByEmail) return res.status(400).json({ error: 'verifiedByEmail required' });
    const { data, error } = await supabaseAdmin.from('ubos').update({
      verified: true, verified_by_email: verifiedByEmail, verified_at: new Date().toISOString(),
    }).eq('id', req.params.id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    console.error('UBO verify error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/compliance/ubos/:id', requireAdmin, async (req, res) => {
  try {
    const { error } = await supabaseAdmin.from('ubos').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch (err) {
    console.error('UBO delete error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ACPR REGULATORY REPORTING
// ============================================================
function computePeriod(type, dateStr) {
  const ref = dateStr ? new Date(dateStr) : new Date();
  let from, to;
  if (type === 'quarterly') {
    const q = Math.floor(ref.getMonth() / 3);
    from = new Date(ref.getFullYear(), q * 3, 1);
    to = new Date(ref.getFullYear(), q * 3 + 3, 1);
  } else if (type === 'yearly') {
    from = new Date(ref.getFullYear(), 0, 1);
    to = new Date(ref.getFullYear() + 1, 0, 1);
  } else {
    // monthly (default)
    from = new Date(ref.getFullYear(), ref.getMonth(), 1);
    to = new Date(ref.getFullYear(), ref.getMonth() + 1, 1);
  }
  const fmt = (d) => d.toISOString().slice(0, 10);
  const toEnd = new Date(to.getTime() - 86400000); // last day of period
  return { type: type || 'monthly', from: fmt(from), to: fmt(to), toDisplay: fmt(toEnd) };
}

app.get('/api/compliance/reporting/acpr', requireAdmin, async (req, res) => {
  try {
    const period = computePeriod(req.query.period, req.query.date);
    const { from, to } = period;

    // Transfers
    const { data: transfers } = await supabaseAdmin
      .from('transfer_approvals')
      .select('status, amount')
      .gte('created_at', from)
      .lt('created_at', to);
    const txs = transfers || [];
    const byStatus = {};
    let totalVolume = 0;
    txs.forEach(t => {
      byStatus[t.status] = (byStatus[t.status] || 0) + 1;
      totalVolume += parseFloat(t.amount || 0);
    });

    // SARs
    const { data: sars } = await supabaseAdmin
      .from('suspicious_activity_reports')
      .select('status, filing_authority')
      .gte('created_at', from)
      .lt('created_at', to);
    const sarList = sars || [];
    const sarFiled = sarList.filter(s => s.status === 'filed_with_mros' || s.status === 'filed_with_tracfin').length;
    const sarByAuthority = { tracfin: 0, mros: 0 };
    sarList.forEach(s => {
      if (s.filing_authority === 'tracfin') sarByAuthority.tracfin++;
      else if (s.filing_authority === 'mros') sarByAuthority.mros++;
    });

    // Alerts
    const { data: alertsData } = await supabaseAdmin
      .from('compliance_alerts')
      .select('status')
      .gte('created_at', from)
      .lt('created_at', to);
    const alertsList = alertsData || [];

    // Freezes
    const { data: freezesData } = await supabaseAdmin
      .from('wallet_freezes')
      .select('status')
      .gte('created_at', from)
      .lt('created_at', to);
    const freezesList = freezesData || [];
    const { data: activeFreezes } = await supabaseAdmin
      .from('wallet_freezes')
      .select('id')
      .eq('status', 'frozen');

    // KYC
    const { data: kycData } = await supabaseAdmin
      .from('kyc_checks')
      .select('status')
      .gte('created_at', from)
      .lt('created_at', to);
    const kycList = kycData || [];

    // UBOs
    const { data: uboData } = await supabaseAdmin
      .from('ubos')
      .select('verification_status')
      .gte('created_at', from)
      .lt('created_at', to);
    const uboList = uboData || [];

    // Whitelist
    const { data: wlData } = await supabaseAdmin
      .from('address_whitelist')
      .select('status')
      .gte('created_at', from)
      .lt('created_at', to);
    const wlList = wlData || [];

    // Risk config
    const { data: riskData } = await supabaseAdmin
      .from('client_risk_config')
      .select('risk_level');
    const riskList = riskData || [];

    // Audit log
    const { data: auditData } = await supabaseAdmin
      .from('audit_log')
      .select('severity, category')
      .gte('created_at', from)
      .lt('created_at', to);
    const auditList = auditData || [];
    const auditByCategory = {};
    auditList.forEach(a => {
      auditByCategory[a.category] = (auditByCategory[a.category] || 0) + 1;
    });

    const report = {
      period: { type: period.type, from: period.from, to: period.toDisplay },
      transfers: {
        total: txs.length,
        approved: (byStatus.approved || 0) + (byStatus.executed || 0),
        rejected: byStatus.rejected || 0,
        pending: byStatus.pending || 0,
        totalVolume: totalVolume.toFixed(2),
        byStatus,
      },
      compliance: {
        sarFiled,
        sarByAuthority,
        alertsTotal: alertsList.length,
        alertsResolved: alertsList.filter(a => a.status === 'resolved').length,
        alertsPending: alertsList.filter(a => a.status === 'open' || a.status === 'acknowledged').length,
        frozenWallets: freezesList.length,
        activeFreeze: (activeFreezes || []).length,
      },
      kyc: {
        totalChecks: kycList.length,
        verified: kycList.filter(k => k.status === 'verified' || k.status === 'approved').length,
        pending: kycList.filter(k => k.status === 'pending').length,
        rejected: kycList.filter(k => k.status === 'rejected' || k.status === 'failed').length,
      },
      ubos: {
        totalRegistered: uboList.length,
        verified: uboList.filter(u => u.verification_status === 'verified').length,
        unverified: uboList.filter(u => u.verification_status !== 'verified').length,
      },
      whitelist: {
        totalAddresses: wlList.length,
        approved: wlList.filter(w => w.status === 'active' || w.status === 'approved').length,
        pending: wlList.filter(w => w.status === 'pending_approval' || w.status === 'pending').length,
        revoked: wlList.filter(w => w.status === 'revoked').length,
      },
      risk: {
        highRiskClients: riskList.filter(r => r.risk_level === 'high').length,
        mediumRiskClients: riskList.filter(r => r.risk_level === 'medium').length,
        lowRiskClients: riskList.filter(r => r.risk_level === 'low').length,
      },
      audit: {
        totalActions: auditList.length,
        highSeverity: auditList.filter(a => a.severity === 'high' || a.severity === 'critical').length,
        byCategory: auditByCategory,
      },
    };

    await logAudit({
      userId: req.user.id, userEmail: req.user.email, userRole: req.user.role,
      action: 'acpr_report_generated', category: 'compliance',
      details: { periodType: period.type, from: period.from, to: period.toDisplay },
      severity: 'info', req,
    });

    res.json(report);
  } catch (err) {
    console.error('ACPR report error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/compliance/reporting/acpr/export', requireAdmin, async (req, res) => {
  try {
    // Re-use the same logic — fetch the report internally
    const period = computePeriod(req.query.period, req.query.date);
    const { from, to } = period;

    // Fetch all data (same as above)
    const [
      { data: transfers },
      { data: sars },
      { data: alertsData },
      { data: freezesData },
      { data: activeFreezes },
      { data: kycData },
      { data: uboData },
      { data: wlData },
      { data: riskData },
      { data: auditData },
    ] = await Promise.all([
      supabaseAdmin.from('transfer_approvals').select('status, amount').gte('created_at', from).lt('created_at', to),
      supabaseAdmin.from('suspicious_activity_reports').select('status, filing_authority').gte('created_at', from).lt('created_at', to),
      supabaseAdmin.from('compliance_alerts').select('status').gte('created_at', from).lt('created_at', to),
      supabaseAdmin.from('wallet_freezes').select('status').gte('created_at', from).lt('created_at', to),
      supabaseAdmin.from('wallet_freezes').select('id').eq('status', 'frozen'),
      supabaseAdmin.from('kyc_checks').select('status').gte('created_at', from).lt('created_at', to),
      supabaseAdmin.from('ubos').select('verification_status').gte('created_at', from).lt('created_at', to),
      supabaseAdmin.from('address_whitelist').select('status').gte('created_at', from).lt('created_at', to),
      supabaseAdmin.from('client_risk_config').select('risk_level'),
      supabaseAdmin.from('audit_log').select('severity, category').gte('created_at', from).lt('created_at', to),
    ]);

    const txs = transfers || [];
    const sarList = sars || [];
    const alertsList = alertsData || [];
    const freezesList = freezesData || [];
    const kycList = kycData || [];
    const uboList = uboData || [];
    const wlList = wlData || [];
    const riskList = riskData || [];
    const auditList = auditData || [];

    let totalVolume = 0;
    const byStatus = {};
    txs.forEach(t => { byStatus[t.status] = (byStatus[t.status] || 0) + 1; totalVolume += parseFloat(t.amount || 0); });

    const sarFiled = sarList.filter(s => s.status === 'filed_with_mros' || s.status === 'filed_with_tracfin').length;
    const tracfin = sarList.filter(s => s.filing_authority === 'tracfin').length;
    const mros = sarList.filter(s => s.filing_authority === 'mros').length;

    const periodLabel = period.type === 'monthly' ? 'Mensuel' : period.type === 'quarterly' ? 'Trimestriel' : 'Annuel';
    const filename = `rapport-acpr-${period.from.slice(0, 7)}.csv`;

    const rows = [
      ['Rapport ACPR - SwissLife Banque Privee France'],
      [`Periode: ${periodLabel}`, `Du: ${period.from}`, `Au: ${period.toDisplay}`],
      [`Genere le: ${new Date().toISOString().slice(0, 19)}`],
      [],
      ['=== TRANSFERTS ==='],
      ['Total transferts', txs.length],
      ['Approuves', (byStatus.approved || 0) + (byStatus.executed || 0)],
      ['Rejetes', byStatus.rejected || 0],
      ['En attente', byStatus.pending || 0],
      ['Volume total', totalVolume.toFixed(2)],
      [],
      ['=== CONFORMITE LCB-FT ==='],
      ['Declarations de soupcon deposees', sarFiled],
      ['Tracfin', tracfin],
      ['MROS', mros],
      ['Alertes totales', alertsList.length],
      ['Alertes resolues', alertsList.filter(a => a.status === 'resolved').length],
      ['Alertes en attente', alertsList.filter(a => a.status === 'open' || a.status === 'acknowledged').length],
      ['Wallets geles (periode)', freezesList.length],
      ['Gels actifs', (activeFreezes || []).length],
      [],
      ['=== KYC & DUE DILIGENCE ==='],
      ['Verifications KYC totales', kycList.length],
      ['Verifies', kycList.filter(k => k.status === 'verified' || k.status === 'approved').length],
      ['En attente', kycList.filter(k => k.status === 'pending').length],
      ['Rejetes', kycList.filter(k => k.status === 'rejected' || k.status === 'failed').length],
      ['Beneficiaires effectifs enregistres', uboList.length],
      ['UBO verifies', uboList.filter(u => u.verification_status === 'verified').length],
      ['UBO non verifies', uboList.filter(u => u.verification_status !== 'verified').length],
      [],
      ['=== GESTION DES RISQUES ==='],
      ['Clients haut risque', riskList.filter(r => r.risk_level === 'high').length],
      ['Clients risque moyen', riskList.filter(r => r.risk_level === 'medium').length],
      ['Clients risque faible', riskList.filter(r => r.risk_level === 'low').length],
      ['Adresses whitelist totales', wlList.length],
      ['Approuvees', wlList.filter(w => w.status === 'active' || w.status === 'approved').length],
      ['En attente', wlList.filter(w => w.status === 'pending_approval' || w.status === 'pending').length],
      ['Revoquees', wlList.filter(w => w.status === 'revoked').length],
      [],
      ['=== JOURNAL AUDIT ==='],
      ['Actions totales', auditList.length],
      ['Severite haute/critique', auditList.filter(a => a.severity === 'high' || a.severity === 'critical').length],
      [],
      ['Confidentiel - Usage interne uniquement'],
      ['Art. L.561-32 CMF & Reglement MiCA (UE) 2023/1114'],
    ];

    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');

    await logAudit({
      userId: req.user.id, userEmail: req.user.email, userRole: req.user.role,
      action: 'acpr_report_exported_csv', category: 'compliance',
      details: { periodType: period.type, from: period.from, to: period.toDisplay },
      severity: 'info', req,
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csv); // BOM for Excel
  } catch (err) {
    console.error('ACPR export error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// MISSING ROUTE ALIASES — Match frontend expected paths
// ============================================================

// GET /api/compliance/approvals/pending — Pending approvals only
app.get('/api/compliance/approvals/pending', async (req, res) => {
  try {
    const { limit = '50', offset = '0' } = req.query;
    const { data, error } = await supabaseAdmin
      .from('transfer_approvals')
      .select('*')
      .eq('status', 'pending')
      .order('requested_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('approvals pending list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/compliance/whitelist — List ALL whitelisted addresses
app.get('/api/compliance/whitelist', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('address_whitelist')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('whitelist list all error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/compliance/delegations/:accountId — Alias for /api/delegations/:accountId
app.get('/api/compliance/delegations/:accountId', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('delegations')
      .select('*')
      .eq('grantor_account_id', req.params.accountId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('delegations list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/kyc/checks/:accountId — KYC checks for a client
app.get('/api/kyc/checks/:accountId', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('kyc_checks')
      .select('*')
      .eq('salesforce_account_id', req.params.accountId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err) {
    console.error('kyc checks list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/compliance/risk-config — List all client risk configurations
app.get('/api/compliance/risk-config', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('client_risk_config')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err) {
    console.error('risk-config list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Custody server running on port ${PORT}`);
  console.log(`Salesforce: ${SF_CONFIGURED ? 'configured' : 'NOT configured'}`);
  console.log(`Dfns: configured`);
  console.log(`Supabase: ${process.env.VITE_SUPABASE_URL ? 'configured' : 'NOT configured'}`);
});
