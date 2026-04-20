// ============================================================
// Chainlink Data Feeds — on-chain price oracles
// ============================================================
// Lit les prix spot crypto depuis les smart contracts Chainlink
// sur Ethereum mainnet. Pas de clé API nécessaire : lecture via
// RPC public. Résultats cachés 60s pour limiter les appels.
//
// Usage en custody banking :
//   ① Valorisation AUM crypto en temps réel (Patrimoine consolidé)
//   ② Conversion crypto → EUR pour seuils quatre-yeux et hard cap
//   ③ Valuation des relevés custody trimestriels (horodatage oracle)
//   ④ Preuve d'auditabilité (Chainlink = source décentralisée,
//      manipulable uniquement par consensus de 21+ nœuds)
//
// Référence : https://docs.chain.link/data-feeds/price-feeds
// Les feeds sont déployés sur Ethereum mainnet par Chainlink Labs
// et alimentés par un réseau d'oracles indépendants.
// ============================================================

import { JsonRpcProvider, Contract } from 'ethers';

// ABI minimale — AggregatorV3Interface (Chainlink standard)
const AGGREGATOR_ABI = [
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function decimals() view returns (uint8)',
  'function description() view returns (string)',
];

// Feeds mainnet Ethereum — adresses officielles Chainlink
// Docs : https://docs.chain.link/data-feeds/price-feeds/addresses
const FEEDS = {
  'BTC/USD':   '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c',
  'ETH/USD':   '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
  'SOL/USD':   '0x4ffC43a60e009B551865A93d232E33Fce9f01507',
  'USDC/USD':  '0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6',
  'USDT/USD':  '0x3E7d1eAB13ad0104d2750B8863b489D65364e32D',
  'LINK/USD':  '0x2c1d072e956AFFC0D435Cb7AC38EF18d24d9127c',
  'EUR/USD':   '0xb49f677943BC038e9857d61E7d053CaA2C1734C1',
  'XAU/USD':   '0x214eD9Da11D2fbe465a6fc601a91E62EbEc1a0D6',  // Or · bonus pour client patrimoine
};

// RPC public PublicNode — pas de clé requise, stable + supporte
// eth_call contre les aggregateurs Chainlink sans rate-limiting agressif.
// En prod on passerait à Alchemy/Infura avec clé (CHAINLINK_RPC_URL env var).
// Alternatives testées : cloudflare-eth.com (KO), eth.llamarpc.com (KO),
// rpc.ankr.com/eth (nécessite clé), ethereum-rpc.publicnode.com (OK).
const DEFAULT_RPC = process.env.CHAINLINK_RPC_URL || 'https://ethereum-rpc.publicnode.com';

let provider = null;
function getProvider() {
  if (!provider) {
    provider = new JsonRpcProvider(DEFAULT_RPC, 1, { staticNetwork: true });
  }
  return provider;
}

// Cache en mémoire — TTL 60s. Les feeds Chainlink mettent à jour
// toutes les heures (ou sur déviation >0.5%), donc 60s est très frais.
const cache = new Map(); // pair → { value, timestamp }
const CACHE_TTL_MS = 60_000;

// Fallback prices si RPC down — gardés volontairement un peu stale
// pour ne pas donner l'illusion de vrais prix. À mettre à jour
// manuellement si Chainlink reste inaccessible longtemps.
const FALLBACK_USD = {
  BTC: 58000, ETH: 2950, SOL: 135,
  USDC: 1, USDT: 1, LINK: 14, EUR_USD: 1.08, XAU: 2350,
};

async function fetchFeed(pair) {
  const addr = FEEDS[pair];
  if (!addr) throw new Error(`Unknown Chainlink pair: ${pair}`);

  const cached = cache.get(pair);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached;
  }

  try {
    const contract = new Contract(addr, AGGREGATOR_ABI, getProvider());
    const [roundData, decimals] = await Promise.all([
      contract.latestRoundData(),
      contract.decimals(),
    ]);
    const answer = Number(roundData[1]);
    const updatedAt = Number(roundData[3]) * 1000; // sec → ms
    const price = answer / Math.pow(10, Number(decimals));
    const fresh = {
      pair,
      price,
      decimals: Number(decimals),
      updatedAt,
      ageSec: Math.round((Date.now() - updatedAt) / 1000),
      source: 'chainlink',
      feedAddress: addr,
      timestamp: Date.now(),
    };
    cache.set(pair, fresh);
    return fresh;
  } catch (err) {
    console.warn(`[Chainlink] ${pair} fetch failed: ${err.message} — using fallback`);
    const symbol = pair.split('/')[0];
    const fallbackPrice = pair === 'EUR/USD' ? FALLBACK_USD.EUR_USD : FALLBACK_USD[symbol];
    return {
      pair,
      price: fallbackPrice || 0,
      decimals: 8,
      updatedAt: Date.now(),
      ageSec: 0,
      source: 'fallback',
      feedAddress: addr,
      timestamp: Date.now(),
      error: err.message,
    };
  }
}

// Public API — get the EUR price of a crypto symbol.
// Converts via USD feed + EUR/USD inversion.
// Returns 0 for unknown symbols (caller should treat as "not valued").
export async function getCryptoPriceEur(symbol) {
  if (!symbol) return { price: 0, source: 'unsupported', pair: null };
  const s = String(symbol).toUpperCase();

  // Testnet aliases — pour la démo on valorise les testnets comme leur
  // équivalent mainnet (SepoliaETH ≈ ETH, TEST_MATIC ≈ POL).
  // Ça permet au banquier de voir un solde parlant (quelques €k) au lieu
  // de "€0" qui cacherait la réalité de la position custody.
  // En prod, ces symboles n'existent plus (testnets remplacés par mainnet).
  const testnetAliases = {
    SEPOLIAETH: 'ETH',
    ETHEREUMGOERLI: 'ETH',
    HOLESKYETH: 'ETH',
    TEST_MATIC: 'POL',
    TESTMATIC: 'POL',
    BITCOINTESTNET: 'BTC',
    TBTC: 'BTC',
    SOLANADEVNET: 'SOL',
  };
  const resolvedSymbol = testnetAliases[s] || s;

  // Stablecoins pegged to USD
  const stableMap = { USDC: 'USDC/USD', USDT: 'USDT/USD' };
  // Major crypto with direct USD feed
  const usdMap = {
    BTC: 'BTC/USD', ETH: 'ETH/USD', SOL: 'SOL/USD',
    LINK: 'LINK/USD', XAU: 'XAU/USD',
  };
  // Static USD prices — pour les actifs sans feed Chainlink mainnet
  // (Polygon POL/MATIC, Cardano, Avalanche…). Encore converti via EUR/USD
  // feed pour rester dans la même logique pricing.
  const STATIC_USD_PRICES = {
    POL: 0.38, MATIC: 0.38, ADA: 0.58, AVAX: 38, DOGE: 0.18,
  };

  let usdPair = usdMap[resolvedSymbol] || stableMap[resolvedSymbol];

  // Static pricing path : pas de feed Chainlink → convertir via EUR/USD seul
  if (!usdPair && STATIC_USD_PRICES[resolvedSymbol] != null) {
    try {
      const eurUsdData = await fetchFeed('EUR/USD');
      const priceUsd = STATIC_USD_PRICES[resolvedSymbol];
      const priceEur = eurUsdData.price > 0 ? priceUsd / eurUsdData.price : 0;
      return {
        symbol: s,
        priceEur,
        priceUsd,
        eurUsdRate: eurUsdData.price,
        source: 'static',
        pair: `${resolvedSymbol}/USD (static)`,
      };
    } catch (err) {
      console.warn(`[Chainlink] static price EUR/USD fetch failed for ${resolvedSymbol}:`, err.message);
      return { symbol: s, priceEur: STATIC_USD_PRICES[resolvedSymbol] / 1.08, priceUsd: STATIC_USD_PRICES[resolvedSymbol], source: 'static-fallback' };
    }
  }

  if (!usdPair) return { price: 0, source: 'unsupported', pair: null, symbol: s };

  try {
    const [usdData, eurUsdData] = await Promise.all([
      fetchFeed(usdPair),
      fetchFeed('EUR/USD'),
    ]);
    // EUR price = (symbol in USD) / (EUR/USD rate)
    const eurPrice = eurUsdData.price > 0 ? usdData.price / eurUsdData.price : 0;
    return {
      symbol: s,
      priceEur: eurPrice,
      priceUsd: usdData.price,
      eurUsdRate: eurUsdData.price,
      source: usdData.source,
      ageSec: usdData.ageSec,
      updatedAt: usdData.updatedAt,
      feedAddress: usdData.feedAddress,
      pair: usdPair,
    };
  } catch (err) {
    console.error(`[Chainlink] getCryptoPriceEur(${s}) error:`, err.message);
    return { symbol: s, priceEur: 0, source: 'error', error: err.message };
  }
}

// Batch version — fetches all feeds in parallel + returns keyed map.
// Used by the /api/oracle/prices endpoint for dashboard display.
export async function getAllPricesEur(symbols = ['BTC', 'ETH', 'SOL', 'USDC', 'USDT', 'LINK', 'XAU']) {
  const results = await Promise.all(symbols.map(s => getCryptoPriceEur(s)));
  const map = {};
  for (const r of results) {
    map[r.symbol] = r;
  }
  return {
    prices: map,
    fetchedAt: new Date().toISOString(),
    source: 'chainlink-mainnet',
    rpcEndpoint: DEFAULT_RPC,
  };
}

// Raw feed access — used for audit proofs and the Oracle transparency UI.
// Returns the underlying price + decimals + round metadata, unchanged.
export async function getRawFeed(pair) {
  return fetchFeed(pair);
}

// Health check — does the RPC respond + are the feeds fresh enough?
// Used by the status indicator in the compliance dashboard.
// Note: Chainlink feeds update on price deviation OR on heartbeat interval.
// - Crypto pairs (BTC, ETH…) : 0.5% deviation OR 1h heartbeat
// - EUR/USD (FX)              : 1% deviation OR 24h heartbeat
// We consider the system healthy if the ETH/USD feed is < 3h stale
// (covers normal crypto volatility) AND the RPC responds.
export async function chainlinkHealth() {
  try {
    const ethUsd = await fetchFeed('ETH/USD');
    const eurUsd = await fetchFeed('EUR/USD');
    const cryptoFresh = ethUsd.source === 'chainlink' && ethUsd.ageSec < 3 * 3600;  // 3h tolerance
    const fxFresh = eurUsd.source === 'chainlink' && eurUsd.ageSec < 26 * 3600;     // 26h tolerance
    return {
      healthy: cryptoFresh && fxFresh,
      source: ethUsd.source,
      ethUsdAgeSec: ethUsd.ageSec,
      eurUsdAgeSec: eurUsd.ageSec,
      lastUpdate: Math.max(ethUsd.updatedAt, eurUsd.updatedAt),
      rpc: DEFAULT_RPC,
    };
  } catch (err) {
    return { healthy: false, error: err.message, rpc: DEFAULT_RPC };
  }
}

export const CHAINLINK_FEEDS = FEEDS;
