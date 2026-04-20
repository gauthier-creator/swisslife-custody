// ============================================================
// Oracle API — Chainlink Data Feeds (client-side wrapper)
// ============================================================
// Appelle le backend /api/oracle/* qui lit à son tour les feeds
// Chainlink on-chain. Le cache 60s est côté serveur, donc appeler
// cette fonction plusieurs fois dans la même minute est gratuit.
//
// Usage :
//   const { prices, fetchedAt } = await fetchOraclePrices();
//   const btcEur = prices.BTC?.priceEur; // nombre
// ============================================================

import { API_BASE } from '../config/constants';
import { supabase } from '../lib/supabase';

async function getHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

// All EUR prices keyed by symbol (BTC, ETH, SOL, USDC, USDT, LINK, XAU).
// Source : Chainlink Ethereum Mainnet feeds (onchain), cached 60s
// server-side. Fallback à des prix figés si RPC down.
export async function fetchOraclePrices(symbols) {
  const headers = await getHeaders();
  const params = symbols && symbols.length ? `?symbols=${symbols.join(',')}` : '';
  const res = await fetch(`${API_BASE}/api/oracle/prices${params}`, { headers });
  if (!res.ok) throw new Error('Chainlink oracle fetch failed');
  return res.json();
}

// Health check — is the RPC alive and the EUR/USD feed fresh?
export async function fetchOracleHealth() {
  const headers = await getHeaders();
  const res = await fetch(`${API_BASE}/api/oracle/health`, { headers });
  if (!res.ok) return { healthy: false };
  return res.json();
}

// Raw feed — used for audit proof UI (feedAddress, round, decimals)
export async function fetchOracleFeed(pair) {
  const headers = await getHeaders();
  const res = await fetch(`${API_BASE}/api/oracle/feed/${encodeURIComponent(pair)}`, { headers });
  if (!res.ok) throw new Error(`Feed ${pair} unavailable`);
  return res.json();
}

// Feed catalog — used by transparency panel
export async function fetchOracleFeedsList() {
  const headers = await getHeaders();
  const res = await fetch(`${API_BASE}/api/oracle/feeds-list`, { headers });
  if (!res.ok) throw new Error('Feed catalog unavailable');
  return res.json();
}
