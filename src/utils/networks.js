import { SUPPORTED_NETWORKS } from '../config/constants';

export const getNetwork = (id) => SUPPORTED_NETWORKS.find(n => n.id === id) || { id, name: id, symbol: '?', icon: '?', color: '#787881' };

export const getExplorerUrl = (network, txHash) => {
  const explorers = {
    Ethereum: `https://etherscan.io/tx/${txHash}`,
    EthereumSepolia: `https://sepolia.etherscan.io/tx/${txHash}`,
    Bitcoin: `https://mempool.space/tx/${txHash}`,
    BitcoinTestnet3: `https://mempool.space/testnet/tx/${txHash}`,
    Polygon: `https://polygonscan.com/tx/${txHash}`,
    Solana: `https://solscan.io/tx/${txHash}`,
    Cardano: `https://cardanoscan.io/transaction/${txHash}`,
    ArbitrumOne: `https://arbiscan.io/tx/${txHash}`,
    Base: `https://basescan.org/tx/${txHash}`,
  };
  return explorers[network] || '#';
};
