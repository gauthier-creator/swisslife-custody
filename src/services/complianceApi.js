import { API_BASE } from '../config/constants';
import { supabase } from '../lib/supabase';

const baseHeaders = { 'Content-Type': 'application/json' };

async function getHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    return { ...baseHeaders, Authorization: `Bearer ${session.access_token}` };
  }
  return baseHeaders;
}

// For backward compat in non-async contexts
const headers = baseHeaders;

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
  const authHeaders = await getHeaders();
  const res = await fetch(`${API_BASE}/api/compliance/approvals`, {
    method: 'POST', headers: authHeaders, body: JSON.stringify(data),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed to create approval'); }
  return res.json();
}

export async function approveTransfer(id, reviewerEmail) {
  const authHeaders = await getHeaders();
  const res = await fetch(`${API_BASE}/api/compliance/approvals/${id}/approve`, {
    method: 'PATCH', headers: authHeaders, body: JSON.stringify({ reviewedByEmail: reviewerEmail }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed to approve'); }
  return res.json();
}

export async function rejectTransfer(id, reviewerEmail, reason) {
  const authHeaders = await getHeaders();
  const res = await fetch(`${API_BASE}/api/compliance/approvals/${id}/reject`, {
    method: 'PATCH', headers: authHeaders, body: JSON.stringify({ reviewedByEmail: reviewerEmail, rejectionReason: reason }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed to reject'); }
  return res.json();
}

export async function executeTransfer(id) {
  const authHeaders = await getHeaders();
  const res = await fetch(`${API_BASE}/api/compliance/approvals/${id}/execute`, {
    method: 'POST', headers: authHeaders,
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
  const authHeaders = await getHeaders();
  const res = await fetch(`${API_BASE}/api/compliance/whitelist/${id}/approve`, {
    method: 'PATCH', headers: authHeaders, body: JSON.stringify({ approvedByEmail: approverEmail }),
  });
  if (!res.ok) throw new Error('Failed to approve address');
  return res.json();
}

export async function revokeWhitelistAddress(id) {
  const authHeaders = await getHeaders();
  const res = await fetch(`${API_BASE}/api/compliance/whitelist/${id}/revoke`, {
    method: 'PATCH', headers: authHeaders,
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

// ============ COMPLIANCE REPORTS ============
export async function fetchComplianceSummary(startDate, endDate) {
  const params = new URLSearchParams();
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  const res = await fetch(`${API_BASE}/api/compliance/reports/summary?${params}`, { headers });
  if (!res.ok) throw new Error('Failed to fetch compliance summary');
  return res.json();
}

export async function exportAuditLog(startDate, endDate, category) {
  const params = new URLSearchParams();
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  if (category) params.set('category', category);
  const res = await fetch(`${API_BASE}/api/compliance/reports/audit-export?${params}`, { headers });
  if (!res.ok) throw new Error('Failed to export audit log');
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = `audit-log-${(startDate || 'all').slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

export async function exportTransfers(startDate, endDate, status) {
  const params = new URLSearchParams();
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  if (status) params.set('status', status);
  const res = await fetch(`${API_BASE}/api/compliance/reports/transfers-export?${params}`, { headers });
  if (!res.ok) throw new Error('Failed to export transfers');
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = `transfers-${(startDate || 'all').slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

export async function exportKycStatus() {
  const res = await fetch(`${API_BASE}/api/compliance/reports/kyc-export`, { headers });
  if (!res.ok) throw new Error('Failed to export KYC status');
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = `kyc-status-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
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

// ============ SAR/STR — Suspicious Activity Reports ============
export async function fetchSARs(status) {
  const params = status ? `?status=${status}` : '';
  const res = await fetch(`${API_BASE}/api/compliance/sar${params}`, { headers });
  if (!res.ok) throw new Error('Failed to fetch SARs');
  return res.json();
}

export async function createSAR(data) {
  // data: { salesforceAccountId, clientName, reportType, priority, suspicionType, description, evidence, relatedTransactions, relatedAlerts, totalAmountInvolved, currency, createdByEmail }
  const authHeaders = await getHeaders();
  const res = await fetch(`${API_BASE}/api/compliance/sar`, {
    method: 'POST', headers: authHeaders, body: JSON.stringify(data),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed to create SAR'); }
  return res.json();
}

export async function getSAR(id) {
  const res = await fetch(`${API_BASE}/api/compliance/sar/${id}`, { headers });
  if (!res.ok) throw new Error('Failed to fetch SAR');
  return res.json();
}

export async function submitSAR(id, email) {
  const authHeaders = await getHeaders();
  const res = await fetch(`${API_BASE}/api/compliance/sar/${id}/submit`, {
    method: 'PATCH', headers: authHeaders, body: JSON.stringify({ submittedByEmail: email }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed to submit SAR'); }
  return res.json();
}

export async function reviewSAR(id, email) {
  const authHeaders = await getHeaders();
  const res = await fetch(`${API_BASE}/api/compliance/sar/${id}/review`, {
    method: 'PATCH', headers: authHeaders, body: JSON.stringify({ reviewedByEmail: email }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed to review SAR'); }
  return res.json();
}

export async function fileSAR(id, email, mrosReference, filingAuthority = 'tracfin') {
  const authHeaders = await getHeaders();
  const res = await fetch(`${API_BASE}/api/compliance/sar/${id}/file`, {
    method: 'PATCH', headers: authHeaders, body: JSON.stringify({ filedByEmail: email, mrosReference, filingAuthority }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed to file SAR'); }
  return res.json();
}

export async function closeSAR(id, email, resolution, notes) {
  const authHeaders = await getHeaders();
  const res = await fetch(`${API_BASE}/api/compliance/sar/${id}/close`, {
    method: 'PATCH', headers: authHeaders, body: JSON.stringify({ closedByEmail: email, resolution, resolutionNotes: notes }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed to close SAR'); }
  return res.json();
}

export async function fetchSARStats() {
  const res = await fetch(`${API_BASE}/api/compliance/sar/stats`, { headers });
  if (!res.ok) throw new Error('Failed to fetch SAR stats');
  return res.json();
}

// ============ TRAVEL RULE (FATF R.16) ============
export async function checkTravelRule(amount, currency = 'CHF') {
  const res = await fetch(`${API_BASE}/api/compliance/travel-rule/check`, {
    method: 'POST', headers, body: JSON.stringify({ amount, currency }),
  });
  if (!res.ok) throw new Error('Failed to check travel rule');
  return res.json();
}

export async function createTravelRuleRecord(data) {
  const res = await fetch(`${API_BASE}/api/compliance/travel-rule/create`, {
    method: 'POST', headers, body: JSON.stringify(data),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed to create travel rule record'); }
  return res.json();
}

export async function getTravelRuleRecord(transferApprovalId) {
  const res = await fetch(`${API_BASE}/api/compliance/travel-rule/${transferApprovalId}`, { headers });
  if (!res.ok) { if (res.status === 404) return null; throw new Error('Failed to fetch travel rule record'); }
  return res.json();
}

export async function fetchPendingTravelRule() {
  const res = await fetch(`${API_BASE}/api/compliance/travel-rule/pending`, { headers });
  if (!res.ok) throw new Error('Failed to fetch pending travel rule records');
  return res.json();
}

// ============ DELEGATIONS ============
export async function fetchDelegations(accountId) {
  const authHeaders = await getHeaders();
  const res = await fetch(`${API_BASE}/api/delegations/${accountId}`, { headers: authHeaders });
  if (!res.ok) throw new Error('Failed to fetch delegations');
  return res.json();
}

export async function createDelegation(data) {
  const authHeaders = await getHeaders();
  const res = await fetch(`${API_BASE}/api/delegations`, {
    method: 'POST', headers: authHeaders, body: JSON.stringify(data),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed to create delegation'); }
  return res.json();
}

export async function revokeDelegation(id, revokedByEmail) {
  const authHeaders = await getHeaders();
  const res = await fetch(`${API_BASE}/api/delegations/${id}/revoke`, {
    method: 'PATCH', headers: authHeaders, body: JSON.stringify({ revokedByEmail }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed to revoke delegation'); }
  return res.json();
}

export async function updateDelegation(id, data) {
  const authHeaders = await getHeaders();
  const res = await fetch(`${API_BASE}/api/delegations/${id}`, {
    method: 'PATCH', headers: authHeaders, body: JSON.stringify(data),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed to update delegation'); }
  return res.json();
}
