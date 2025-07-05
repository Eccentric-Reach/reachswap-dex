import { useState, useEffect, useCallback, useRef } from 'react';
import { Token } from '../types';
import { TOKENS } from '../constants/tokens';

export interface TokenHolding {
  token: Token;
  balance: string;
  value: number;
  change24h: number;
}

export interface LiquidityPosition {
  pair: string;
  token0: Token;
  token1: Token;
  lpTokenBalance: string;
  poolShare: number;
  value: number;
  rewards: number;
  apr: string;
}

export interface Transaction {
  type: 'swap' | 'add' | 'remove';
  from?: string;
  to?: string;
  pair?: string;
  amount: string;
  value: number;
  time: string;
  status: 'success' | 'pending' | 'failed';
  hash: string;
}

export interface PortfolioData {
  totalValue: number;
  dailyChange: number;
  dailyChangePercent: number;
  totalRewards: number;
  rewardsToday: number;
  tokenHoldings: TokenHolding[];
  liquidityPositions: LiquidityPosition[];
  recentTransactions: Transaction[];
}

const LOOP_NETWORK_CONFIG = {
  chainId: '0x3CBF',
  rpcUrl: 'https://api.mainnetloop.com',
  explorerApi: 'https://explorer.mainnetloop.com/api'
};

export const usePortfolioData = (
  isWalletConnected: boolean,
  walletAddress?: string
) => {
  const [portfolioData, setPortfolioData] = useState<PortfolioData>({
    totalValue: 0,
    dailyChange: 0,
    dailyChangePercent: 0,
    totalRewards: 0,
    rewardsToday: 0,
    tokenHoldings: [],
    liquidityPositions: [],
    recentTransactions: []
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Get the current provider
  const getProvider = useCallback(() => {
    if (typeof window === 'undefined') return null;
    
    const savedWalletType = localStorage.getItem('reachswap_wallet_type');
    
    if (savedWalletType === 'MetaMask' && (window as any).ethereum?.isMetaMask) {
      return (window as any).ethereum;
    } else if (savedWalletType === 'OKX Wallet' && (window as any).okxwallet) {
      return (window as any).okxwallet;
    }
    
    return null;
  }, []);

  // Fetch native LOOP balance
  const fetchNativeBalance = useCallback(async (address: string): Promise<string> => {
    try {
      const provider = getProvider();
      if (!provider) throw new Error('No provider available');

      const balance = await provider.request({
        method: 'eth_getBalance',
        params: [address, 'latest']
      });

      const balanceInLoop = parseInt(balance, 16) / Math.pow(10, 18);
      return balanceInLoop.toString();
    } catch (error) {
      console.error('Error fetching native balance:', error);
      return '0';
    }
  }, [getProvider]);

  // Fetch ERC-20 token balance
  const fetchTokenBalance = useCallback(async (
    address: string, 
    tokenAddress: string, 
    decimals: number
  ): Promise<string> => {
    try {
      const provider = getProvider();
      if (!provider) throw new Error('No provider available');

      const balanceOfSignature = '0x70a08231';
      const paddedAddress = address.slice(2).padStart(64, '0');
      const data = balanceOfSignature + paddedAddress;

      const result = await provider.request({
        method: 'eth_call',
        params: [{
          to: tokenAddress,
          data: data
        }, 'latest']
      });

      if (result && result !== '0x' && result !== '0x0') {
        const balanceWei = parseInt(result, 16);
        const balance = balanceWei / Math.pow(10, decimals);
        return balance.toString();
      }
      
      return '0';
    } catch (error) {
      console.error(`Error fetching token balance for ${tokenAddress}:`, error);
      return '0';
    }
  }, [getProvider]);

  // Fetch token holdings
  const fetchTokenHoldings = useCallback(async (address: string): Promise<TokenHolding[]> => {
    const holdings: TokenHolding[] = [];

    try {
      for (const [symbol, token] of Object.entries(TOKENS)) {
        let balance = '0';
        
        if (token.address === '0x0000000000000000000000000000000000000000') {
          balance = await fetchNativeBalance(address);
        } else {
          balance = await fetchTokenBalance(address, token.address, token.decimals);
        }

        const balanceNum = parseFloat(balance);
        if (balanceNum > 0) {
          const value = balanceNum * (token.price || 0);
          const change24h = (Math.random() - 0.5) * 20; // Mock 24h change
          
          holdings.push({
            token,
            balance: balanceNum.toFixed(6),
            value,
            change24h
          });
        }
      }
    } catch (error) {
      console.error('Error fetching token holdings:', error);
    }

    return holdings.sort((a, b) => b.value - a.value);
  }, [fetchNativeBalance, fetchTokenBalance]);

  // Fetch liquidity positions (mock implementation)
  const fetchLiquidityPositions = useCallback(async (address: string): Promise<LiquidityPosition[]> => {
    // This would require integration with ReachSwap's factory and pair contracts
    // For now, return mock data based on token holdings
    const mockPositions: LiquidityPosition[] = [
      {
        pair: 'LOOP/GIKO',
        token0: TOKENS.LOOP,
        token1: TOKENS.GIKO,
        lpTokenBalance: '2.450000',
        poolShare: 0.0234,
        value: 2450.00,
        rewards: 12.34,
        apr: '25.4%'
      },
      {
        pair: 'LOOP/wLOOP',
        token0: TOKENS.LOOP,
        token1: TOKENS.wLOOP,
        lpTokenBalance: '1.890000',
        poolShare: 0.0189,
        value: 1890.00,
        rewards: 8.92,
        apr: '22.1%'
      }
    ];

    return mockPositions;
  }, []);

  // Fetch recent transactions
  const fetchRecentTransactions = useCallback(async (address: string): Promise<Transaction[]> => {
    try {
      // This would typically use the Loop Network Explorer API
      // For now, return mock data
      const mockTransactions: Transaction[] = [
        {
          type: 'swap',
          from: 'LOOP',
          to: 'GIKO',
          amount: '150.00',
          value: 150.00,
          time: formatTimeAgo(Date.now() - 2 * 60 * 1000),
          status: 'success',
          hash: '0x1234567890abcdef1234567890abcdef12345678'
        },
        {
          type: 'add',
          pair: 'LOOP/wLOOP',
          amount: '45.00',
          value: 45.00,
          time: formatTimeAgo(Date.now() - 60 * 60 * 1000),
          status: 'success',
          hash: '0x2345678901bcdef12345678901bcdef123456789'
        },
        {
          type: 'swap',
          from: 'GIKO',
          to: 'LMEME',
          amount: '89.50',
          value: 89.50,
          time: formatTimeAgo(Date.now() - 3 * 60 * 60 * 1000),
          status: 'success',
          hash: '0x3456789012cdef123456789012cdef1234567890'
        }
      ];

      return mockTransactions;
    } catch (error) {
      console.error('Error fetching transactions:', error);
      return [];
    }
  }, []);

  // Format time ago
  const formatTimeAgo = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (minutes < 60) {
      return `${minutes}m ago`;
    } else if (hours < 24) {
      return `${hours}h ago`;
    } else {
      return `${days}d ago`;
    }
  };

  // Main fetch function
  const fetchPortfolioData = useCallback(async () => {
    if (!isWalletConnected || !walletAddress) {
      setPortfolioData({
        totalValue: 0,
        dailyChange: 0,
        dailyChangePercent: 0,
        totalRewards: 0,
        rewardsToday: 0,
        tokenHoldings: [],
        liquidityPositions: [],
        recentTransactions: []
      });
      return;
    }

    const fullAddress = localStorage.getItem('reachswap_wallet_address');
    if (!fullAddress) return;

    setIsLoading(true);
    setError(null);

    try {
      // Fetch all data in parallel
      const [tokenHoldings, liquidityPositions, recentTransactions] = await Promise.all([
        fetchTokenHoldings(fullAddress),
        fetchLiquidityPositions(fullAddress),
        fetchRecentTransactions(fullAddress)
      ]);

      // Calculate totals
      const tokenValue = tokenHoldings.reduce((sum, holding) => sum + holding.value, 0);
      const lpValue = liquidityPositions.reduce((sum, position) => sum + position.value, 0);
      const totalValue = tokenValue + lpValue;
      
      const totalRewards = liquidityPositions.reduce((sum, position) => sum + position.rewards, 0);
      const rewardsToday = totalRewards * 0.1; // Mock today's rewards
      
      // Mock daily change
      const dailyChange = (Math.random() - 0.5) * totalValue * 0.1;
      const dailyChangePercent = totalValue > 0 ? (dailyChange / totalValue) * 100 : 0;

      setPortfolioData({
        totalValue,
        dailyChange,
        dailyChangePercent,
        totalRewards,
        rewardsToday,
        tokenHoldings,
        liquidityPositions,
        recentTransactions
      });

    } catch (error: any) {
      console.error('Error fetching portfolio data:', error);
      setError(error.message || 'Failed to fetch portfolio data');
    } finally {
      setIsLoading(false);
    }
  }, [isWalletConnected, walletAddress, fetchTokenHoldings, fetchLiquidityPositions, fetchRecentTransactions]);

  // Refresh function
  const refreshPortfolioData = useCallback(async () => {
    await fetchPortfolioData();
  }, [fetchPortfolioData]);

  // Set up auto-refresh
  useEffect(() => {
    if (!isWalletConnected || !walletAddress) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Initial fetch
    fetchPortfolioData();

    // Set up 60-second interval
    intervalRef.current = setInterval(() => {
      if (!document.hidden) {
        fetchPortfolioData();
      }
    }, 60000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isWalletConnected, walletAddress, fetchPortfolioData]);

  // Listen for account/network changes
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleAccountsChanged = () => {
      setTimeout(() => fetchPortfolioData(), 1000);
    };

    const handleChainChanged = (chainId: string) => {
      if (chainId === LOOP_NETWORK_CONFIG.chainId) {
        setTimeout(() => fetchPortfolioData(), 1000);
      }
    };

    const ethereum = (window as any).ethereum;
    const okxwallet = (window as any).okxwallet;

    if (ethereum) {
      ethereum.on('accountsChanged', handleAccountsChanged);
      ethereum.on('chainChanged', handleChainChanged);
    }
    if (okxwallet) {
      okxwallet.on('accountsChanged', handleAccountsChanged);
      okxwallet.on('chainChanged', handleChainChanged);
    }

    return () => {
      if (ethereum) {
        ethereum.removeListener('accountsChanged', handleAccountsChanged);
        ethereum.removeListener('chainChanged', handleChainChanged);
      }
      if (okxwallet) {
        okxwallet.removeListener('accountsChanged', handleAccountsChanged);
        okxwallet.removeListener('chainChanged', handleChainChanged);
      }
    };
  }, [fetchPortfolioData]);

  return {
    portfolioData,
    isLoading,
    error,
    refreshPortfolioData
  };
};