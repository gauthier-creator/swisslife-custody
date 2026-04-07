import { API_BASE } from '../config/constants';
const headers = { 'Content-Type': 'application/json' };

// ============ AUDIT LOG ============
export async function fetchAuditLog({ category, salesforceAccountId, severity, limit = 50, offset = 0 } = {}) {
  const params = new URLSearchParams({ limit, offset });
  if (category) params.set('category', category);
  if (salesforceAccountId) params.set('salesforce_account_id', salesforceAccountId);
  if (severity) params.set('severity', severity);
  const res = await fetch(`${API_BASE}/api/compliance/audit-log?${params}`, { headers });
  if (!res.ok) throw new Error('Failed to fetch audit log');
  return res.json();
}

export async function fetchAuditStats() {
  const res = await fetch(`${API_BASE}/api/compliance/audit-log/stats`, { headers });
  if (!res.ok) throw new Error('Failed to fetch audit stats');
  return res.json();
}

// ============ TRANSFER APPROVALS ============
export async function fetchApprovals(status = '') {
  const params = status ? `?status=${status}` : '';
  const res = await fetch(`${API_BASE}/api/compliance/approvals${params}`, { headers });
  if (!res.ok) throw new Error('Failed to fetch approvals');
  return res.json();
}

export async function createApproval(data) {
  // data: { walletId, walletName, walletNetwork, salesforceAccountId, clientName, destinationAddress, amount, assetType, contractAddress, requestedByEmail, notes }
  const res = await fetch(`${API_BASE}/api/compliance/approvals`, {
    method: 'POST', headers, body: JSON.stringify(data),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed to create approval'); }
  return res.json();
}

export async function approveTransfer(id, reviewerEmail) {
  const res = await fetch(`${API_BASE}/api/compliance/approvals/${id}/approve`, {
    method: 'PATCH', headers, body: JSON.stringify({ reviewedByEmail: reviewerEmail }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed to approve'); }
  return res.json();
}

export async function rejectTransfer(id, reviewerEmail, reason) {
  const res = await fetch(`${API_BASE}/api/compliance/approvals/${id}/reject`, {
    method: 'PATCH', headers, body: JSON.stringify({ reviewedByEmail: reviewerEmail, rejectionReason: reason }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed to reject'); }
  return res.json();
}

export async function executeTransfer(id) {
  const res = await fetch(`${API_BASE}/api/compliance/approvals/${id}/execute`, {
    method: 'POST', headers,
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed to execute'); }
  return res.json();
}

// ============ WHITELIST ============
export async function fetchWhitelist(accountId) {
  const res = await fetch(`${API_BASE}/api/compliance/whitelist/${accountId}`, { headers });
  if (!res.ok) throw new Error('Failed to fetch whitelist');
  return res.json();
}

export async function addToWhitelist(data) {
  // data: { salesforceAccountId, clientName, address, network, label, addedByEmail, notes }
  const res = await fetch(`${API_BASE}/api/compliance/whitelist`, {
    method: 'POST', headers, body: JSON.stringify(data),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed to add'); }
  return res.json();
}

export async function approveWhitelistAddress(id, approverEmail) {
  const res = await fetch(`${API_BASE}/api/compliance/whitelist/${id}/approve`, {
    method: 'PATCH', headers, body: JSON.stringify({ approvedByEmail: approverEmail }),
  });
  if (!res.ok) throw new Error('Failed to approve address');
  return res.json();
}

export async function revokeWhitelistAddress(id) {
  const res = await fetch(`${API_BASE}/api/compliance/whitelist/${id}/revoke`, {
    method: 'PATCH', headers,
  });
  if (!res.ok) throw new Error('Failed to revoke address');
  return res.json();
}

export async function checkWhitelist(address, network, accountId) {
  const params = new URLSearchParams({ address, network, accountId });
  const res = await fetch(`${API_BASE}/api/compliance/whitelist/check?${params}`, { headers });
  if (!res.ok) return { whitelisted: false };
  return res.json();
}

// ============ RISK CONFIG ============
export async function fetchRiskConfig(accountId) {
  const res = await fetch(`${API_BASE}/api/compliance/risk/${accountId}`, { headers });
  if (!res.ok) { if (res.status === 404) return null; throw new Error('Failed to fetch risk config'); }
  return res.json();
}

export async function saveRiskConfig(accountId, config) {
  const res = await fetch(`${API_BASE}/api/compliance/risk/${accountId}`, {
    method: 'PUT', headers, body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error('Failed to save risk config');
  return res.json();
}

export async function checkTransferRisk(data) {
  // data: { salesforceAccountId, amount, network, destinationAddress }
  const res = await fetch(`${API_BASE}/api/compliance/risk/check-transfer`, {
    method: 'POST', headers, body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to check transfer risk');
  return res.json();
}

// ============ ALERTS ============
export async function fetchAlerts({ status, severity } = {}) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (severity) params.set('severity', severity);
  const res = await fetch(`${API_BASE}/api/compliance/alerts?${params}`, { headers });
  if (!res.ok) throw new Error('Failed to fetch alerts');
  return res.json();
}

export async function fetchAlertStats() {
  const res = await fetch(`${API_BASE}/api/compliance/alerts/stats`, { headers });
  if (!res.ok) throw new Error('Failed to fetch alert stats');
  return res.json();
}

export async function acknowledgeAlert(id) {
  const res = await fetch(`${API_BASE}/api/compliance/alerts/${id}/acknowledge`, {
    method: 'PATCH', headers,
  });
  if (!res.ok) throw new Error('Failed to acknowledge alert');
  return res.json();
}

export async function resolveAlert(id, notes) {
  const res = await fetch(`${API_BASE}/api/compliance/alerts/${id}/resolve`, {
    method: 'PATCH', headers, body: JSON.stringify({ notes }),
  });
  if (!res.ok) throw new Error('Failed to resolve alert');
  return res.json();
}
