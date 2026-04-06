import { API_BASE, STORAGE_KEYS } from '../config/constants';

const getHeaders = () => ({
  'Content-Type': 'application/json',
  'x-dfns-token': localStorage.getItem(STORAGE_KEYS.DFNS_TOKEN) || '',
});

// Wallets
export async function createWallet({ network, name, externalId, tags }) {
  const res = await fetch(`${API_BASE}/api/dfns/wallets`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ network, name, externalId, tags }),
  });
  if (!res.ok) throw new Error((await res.json()).message || 'Failed to create wallet');
  return res.json();
}

export async function listWallets(externalId) {
  const params = new URLSearchParams({ limit: '200' });
  const res = await fetch(`${API_BASE}/api/dfns/wallets?${params}`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to list wallets');
  const data = await res.json();
  const items = data.items || [];
  return externalId ? items.filter(w => w.externalId === externalId) : items;
}

export async function getWallet(walletId) {
  const res = await fetch(`${API_BASE}/api/dfns/wallets/${walletId}`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Wallet not found');
  return res.json();
}

export async function getWalletAssets(walletId) {
  const res = await fetch(`${API_BASE}/api/dfns/wallets/${walletId}/assets?netWorth=true`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to get wallet assets');
  return res.json();
}

export async function getWalletHistory(walletId) {
  const res = await fetch(`${API_BASE}/api/dfns/wallets/${walletId}/history?limit=50`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to get wallet history');
  return res.json();
}

export async function transferAsset(walletId, { kind, to, amount, contract }) {
  const body = { kind, to, amount };
  if (contract) body.contract = contract;
  const res = await fetch(`${API_BASE}/api/dfns/wallets/${walletId}/transfers`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).message || 'Transfer failed');
  return res.json();
}

// Policies
export async function listPolicies() {
  const res = await fetch(`${API_BASE}/api/dfns/policies`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to list policies');
  const data = await res.json();
  return data.items || [];
}

export async function createPolicy(policy) {
  const res = await fetch(`${API_BASE}/api/dfns/policies`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(policy),
  });
  if (!res.ok) throw new Error((await res.json()).message || 'Failed to create policy');
  return res.json();
}

// Test connection
export async function testDfnsConnection() {
  try {
    const res = await fetch(`${API_BASE}/api/dfns/test`, { headers: getHeaders() });
    if (!res.ok) return false;
    const data = await res.json();
    return data.ok === true;
  } catch { return false; }
}
