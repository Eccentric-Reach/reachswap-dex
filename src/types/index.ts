export interface Token {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  logoUrl: string;
  balance?: string;
  price?: number; // Optional - will be fetched dynamically
  isImported?: boolean;
}

export interface TradingPair {
  token0: Token;
  token1: Token;
  liquidity: string;
  volume24h: string;
  fee: number;
}

export interface PoolPosition {
  pair: TradingPair;
  liquidity: string;
  token0Amount: string;
  token1Amount: string;
  share: string;
  rewards: string;
}

export interface Transaction {
  id: string;
  type: 'swap' | 'add' | 'remove';
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  timestamp: number;
  hash: string;
  status: 'pending' | 'success' | 'failed';
}

export interface WalletState {
  isConnected: boolean;
  address: string;
  balance: string;
  network: string;
}