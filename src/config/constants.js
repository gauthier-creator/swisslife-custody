export const API_BASE = import.meta.env.VITE_API_URL || '';

export const SUPPORTED_NETWORKS = [
  { id: 'Ethereum', name: 'Ethereum', symbol: 'ETH', icon: 'Ξ', color: '#627EEA' },
  { id: 'EthereumSepolia', name: 'Ethereum Sepolia', symbol: 'ETH', icon: 'Ξ', color: '#627EEA' },
  { id: 'Bitcoin', name: 'Bitcoin', symbol: 'BTC', icon: '₿', color: '#F7931A' },
  { id: 'BitcoinTestnet3', name: 'Bitcoin Testnet', symbol: 'tBTC', icon: '₿', color: '#F7931A' },
  { id: 'Polygon', name: 'Polygon', symbol: 'MATIC', icon: '⬡', color: '#8247E5' },
  { id: 'Solana', name: 'Solana', symbol: 'SOL', icon: '◎', color: '#9945FF' },
  { id: 'Cardano', name: 'Cardano', symbol: 'ADA', icon: '₳', color: '#0033AD' },
  { id: 'ArbitrumOne', name: 'Arbitrum', symbol: 'ETH', icon: 'A', color: '#28A0F0' },
  { id: 'Base', name: 'Base', symbol: 'ETH', icon: 'B', color: '#0052FF' },
];
