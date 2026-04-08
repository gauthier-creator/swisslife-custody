import { API_BASE } from '../config/constants';
import { supabase } from '../lib/supabase';

const headers = { 'Content-Type': 'application/json' };

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    return { ...headers, Authorization: `Bearer ${session.access_token}` };
  }
  return headers;
}

// Better error extraction from DFNS responses
async function dfnsError(res, fallback) {
  try {
    const data = await res.json();
    return new Error(data.error || data.message || data.details || fallback);
  } catch {
    return new Error(fallback);
  }
}

// ============================================================
// Wallets
// ============================================================
export async function createWallet({ network, name, externalId, tags }) {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/api/dfns/wallets`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ network, name, externalId, tags }),
  });
  if (!res.ok) throw await dfnsError(res, 'Echec de creation du wallet');
  return res.json();
}

export async function listWallets(externalId) {
  const params = new URLSearchParams({ limit: '200' });
  const res = await fetch(`${API_BASE}/api/dfns/wallets?${params}`, { headers });
  if (!res.ok) throw await dfnsError(res, 'Echec du chargement des wallets');
  const data = await res.json();
  const items = data.items || [];
  return externalId ? items.filter(w => w.externalId === externalId) : items;
}

export async function getWallet(walletId) {
  const res = await fetch(`${API_BASE}/api/dfns/wallets/${walletId}`, { headers });
  if (!res.ok) throw await dfnsError(res, 'Wallet introuvable');
  return res.json();
}

export async function getWalletAssets(walletId) {
  const res = await fetch(`${API_BASE}/api/dfns/wallets/${walletId}/assets?netWorth=true`, { headers });
  if (!res.ok) throw await dfnsError(res, 'Echec du chargement des actifs');
  return res.json();
}

export async function getWalletHistory(walletId) {
  const res = await fetch(`${API_BASE}/api/dfns/wallets/${walletId}/history?limit=50`, { headers });
  if (!res.ok) throw await dfnsError(res, 'Echec du chargement de l\'historique');
  return res.json();
}

export async function transferAsset(walletId, { kind, to, amount, contract }) {
  const authHeaders = await getAuthHeaders();
  const body = { kind, to, amount };
  if (contract) body.contract = contract;
  const res = await fetch(`${API_BASE}/api/dfns/wallets/${walletId}/transfers`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await dfnsError(res, 'Echec du transfert');
  return res.json();
}

// ============================================================
// Transfers (with compliance/policy status)
// ============================================================
export async function listTransfers(walletId) {
  const res = await fetch(`${API_BASE}/api/dfns/wallets/${walletId}/transfers?limit=50`, { headers });
  if (!res.ok) throw await dfnsError(res, 'Echec du chargement des transferts');
  const data = await res.json();
  return data.items || [];
}

export async function getTransfer(walletId, transferId) {
  const res = await fetch(`${API_BASE}/api/dfns/wallets/${walletId}/transfers/${transferId}`, { headers });
  if (!res.ok) throw await dfnsError(res, 'Transfert introuvable');
  return res.json();
}

// ============================================================
// Policies
// ============================================================
export async function listPolicies() {
  const res = await fetch(`${API_BASE}/api/dfns/policies`, { headers });
  if (!res.ok) throw await dfnsError(res, 'Echec du chargement des policies');
  const data = await res.json();
  return data.items || [];
}

export async function createPolicy(policy) {
  const res = await fetch(`${API_BASE}/api/dfns/policies`, {
    method: 'POST',
    headers,
    body: JSON.stringify(policy),
  });
  if (!res.ok) throw await dfnsError(res, 'Echec de creation de la policy');
  return res.json();
}

// ============================================================
// Test connection
// ============================================================
export async function testDfnsConnection() {
  try {
    const res = await fetch(`${API_BASE}/api/dfns/test`, { headers });
    if (!res.ok) return false;
    const data = await res.json();
    return data.ok === true;
  } catch { return false; }
}
