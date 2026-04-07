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

app.post('/api/dfns/wallets/:walletId/transfers', async (req, res) => {
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
app.post('/api/compliance/approvals', async (req, res) => {
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
app.patch('/api/compliance/approvals/:id/approve', async (req, res) => {
  try {
    const { approvedBy, approvedByEmail } = req.body;

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
        approved_by_email: approvedByEmail || null,
        approved_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    await logAudit({
      userId: approvedBy,
      userEmail: approvedByEmail,
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
app.patch('/api/compliance/approvals/:id/reject', async (req, res) => {
  try {
    const { rejectedBy, rejectedByEmail, reason } = req.body;

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
        rejected_by_email: rejectedByEmail || null,
        rejection_reason: reason || null,
        rejected_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    await logAudit({
      userId: rejectedBy,
      userEmail: rejectedByEmail,
      action: 'approval.rejected',
      category: 'approval',
      entityType: 'transfer_approval',
      entityId: data.id,
      clientName: data.client_name,
      salesforceAccountId: data.salesforce_account_id,
      details: { walletId: data.wallet_id, amount: data.amount, reason },
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
app.post('/api/compliance/approvals/:id/execute', async (req, res) => {
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
app.patch('/api/compliance/whitelist/:id/approve', async (req, res) => {
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
app.patch('/api/compliance/whitelist/:id/revoke', async (req, res) => {
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
// KYC / KYB — ComplyCube integration (with demo mode fallback)
// ============================================================
const KYC_DEMO_MODE = process.env.COMPLYCUBE_API_KEY ? false : true;
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

// Demo mode: simulate ComplyCube responses
function demoDelay(ms = 2000) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// POST /api/kyc/upload-document — Upload doc & create verification check
app.post('/api/kyc/upload-document', upload.single('file'), async (req, res) => {
  try {
    const { salesforceAccountId, clientName, documentType, initiatedByEmail } = req.body;

    if (!salesforceAccountId || !documentType || !req.file) {
      return res.status(400).json({ error: 'salesforceAccountId, documentType, and file are required' });
    }

    let checkResult;

    if (KYC_DEMO_MODE) {
      // Demo mode: simulate document verification
      await demoDelay(1500);
      checkResult = {
        id: `demo_check_${Date.now()}`,
        status: 'complete',
        result: {
          outcome: 'clear',
          breakdown: {
            documentAuthenticity: 'clear',
            dataComparison: 'clear',
            imageIntegrity: 'clear',
          },
        },
      };
    } else {
      // Real ComplyCube flow
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

    let screenResult;

    if (KYC_DEMO_MODE) {
      // Demo: simulate AML screening (clear for everyone except "Jane Reject")
      await demoDelay(2500);
      const isReject = clientName?.toLowerCase().includes('reject');
      screenResult = {
        id: `demo_aml_${Date.now()}`,
        status: isReject ? 'failed' : 'complete',
        result: isReject ? {
          outcome: 'attention',
          matches: [{ type: 'PEP', source: 'EU PEP List', matchScore: 0.92 }],
        } : {
          outcome: 'clear',
          matchCount: 0,
          searchedLists: ['OFAC SDN', 'EU Consolidated', 'UN Sanctions', 'UK HMT', 'PEP Global'],
        },
      };
    } else {
      // Real ComplyCube AML screening
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

    // If still processing and not demo mode, poll ComplyCube
    if (data.status === 'processing' && !KYC_DEMO_MODE && data.complycube_check_id) {
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
app.post('/api/kyc/validate', async (req, res) => {
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

// POST /api/kyc/create-client — Create ComplyCube client (if not demo mode)
app.post('/api/kyc/create-client', async (req, res) => {
  try {
    const { salesforceAccountId, clientName, email, personType } = req.body;

    if (KYC_DEMO_MODE) {
      return res.json({ id: `demo_client_${Date.now()}`, mode: 'demo' });
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
  console.log(`Supabase: ${process.env.VITE_SUPABASE_URL ? 'configured' : 'NOT configured'}`);
});
