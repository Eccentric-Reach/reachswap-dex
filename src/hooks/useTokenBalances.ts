import { useState, useEffect, useCallback, useRef } from 'react';
import { Token } from '../types';
import { useDynamicTokenDecimals } from './useDynamicTokenDecimals';

interface TokenBalances {
  [tokenAddress: string]: string;
}

interface UseTokenBalancesReturn {
  balances: TokenBalances;
  isLoading: boolean;
  refreshBalances: (tokens?: Token[]) => Promise<void>;
  getTokenBalance: (token: Token) => string;
  fetchBalanceForToken: (token: Token) => Promise<void>;
}

const LOOP_NETWORK_CONFIG = {
  chainId: '0x3CBF', // 15551 in hex
  rpcUrl: 'https://api.mainnetloop.com'
};

export const useTokenBalances = (
  isWalletConnected: boolean,
  walletAddress?: string
): UseTokenBalancesReturn => {
  const [balances, setBalances] = useState<TokenBalances>({});
  const [isLoading, setIsLoading] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isVisibleRef = useRef(true);
  const fetchingRef = useRef<Set<string>>(new Set());
  const { getTokenDecimals } = useDynamicTokenDecimals();

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
      if (!provider) {
        throw new Error('No provider available');
      }

      const balance = await provider.request({
        method: 'eth_getBalance',
        params: [address, 'latest']
      });

      // Convert from wei to LOOP (18 decimals)
      const balanceInLoop = parseInt(balance, 16) / Math.pow(10, 18);
      return balanceInLoop.toFixed(6);
    } catch (error) {
      console.error('Error fetching native balance:', error);
      return '0.000000';
    }
  }, [getProvider]);

  // Fetch ERC-20 token balance
  const fetchTokenBalance = useCallback(async (
    address: string, 
    tokenAddress: string, 
    token: Token
  ): Promise<string> => {
    try {
      const provider = getProvider();
      if (!provider) {
        throw new Error('No provider available');
      }

      // Get actual decimals for the token
      const actualDecimals = getTokenDecimals(token);
      
      // CRITICAL FIX: Enhanced balance fetching with retry logic for problematic tokens
      let result: string;
      let retryCount = 0;
      const maxRetries = 2;
      
      while (retryCount <= maxRetries) {
        try {
          // ERC-20 balanceOf function signature
          const balanceOfSignature = '0x70a08231';
          const paddedAddress = address.slice(2).padStart(64, '0');
          const data = balanceOfSignature + paddedAddress;

          result = await provider.request({
            method: 'eth_call',
            params: [{
              to: tokenAddress,
              data: data
            }, 'latest']
          });
          
          // Break out of retry loop if successful
          break;
        } catch (error) {
          retryCount++;
          if (retryCount > maxRetries) {
            throw error;
          }
          
          console.warn(`Retry ${retryCount}/${maxRetries} for token ${token.symbol} (${actualDecimals} decimals):`, error);
          // Wait before retry with exponential backoff
          await new Promise(resolve => setTimeout(resolve, 500 * retryCount));
        }
      }

      if (result && result !== '0x' && result !== '0x0') {
        const balanceHex = result;
        const balanceWei = parseInt(balanceHex, 16);
        
        // CRITICAL FIX: Use actual decimals for each token
        const balance = balanceWei / Math.pow(10, actualDecimals);
        
        // CRITICAL FIX: Format based on actual token decimals
        const precision = Math.min(6, actualDecimals);
        return balance.toFixed(precision);
      }
      
      // CRITICAL FIX: Return appropriate zero based on actual decimals
      const precision = Math.min(6, actualDecimals);
      return '0'.padEnd(precision + 2, '0').replace(/^0/, '0.');
    } catch (error) {
      console.error(`Error fetching token balance for ${token.symbol} (${getTokenDecimals(token)} decimals):`, error);
      
      // CRITICAL FIX: Return appropriate zero format for the token's actual decimals
      const precision = Math.min(6, getTokenDecimals(token));
      return '0'.padEnd(precision + 2, '0').replace(/^0/, '0.');
    }
  }, [getProvider, getTokenDecimals]);

  // Fetch balance for a specific token
  const fetchBalanceForToken = useCallback(async (token: Token): Promise<void> => {
    if (!isWalletConnected || !walletAddress) {
      return;
    }

    const fullAddress = localStorage.getItem('reachswap_wallet_address');
    if (!fullAddress) {
      console.error('No wallet address found in localStorage');
      return;
    }

    // Prevent duplicate fetches
    if (fetchingRef.current.has(token.address)) {
      return;
    }

    fetchingRef.current.add(token.address);

    try {
      console.log(`🔄 Fetching balance for ${token.symbol} (${token.address})`);
      
      let balance: string;
      
      if (token.address === '0x0000000000000000000000000000000000000000') {
        // Native LOOP token
        balance = await fetchNativeBalance(fullAddress);
      } else {
        // ERC-20 token
        balance = await fetchTokenBalance(fullAddress, token.address, token);
      }
      
      console.log(`💰 ${token.symbol}: ${balance}`);
      
      // Update balance in state
      setBalances(prev => ({
        ...prev,
        [token.address]: balance
      }));

    } catch (error) {
      console.error(`Error fetching balance for ${token.symbol}:`, error);
      // Set to 0 on error
      setBalances(prev => ({
        ...prev,
        [token.address]: '0.000000'
      }));
    } finally {
      fetchingRef.current.delete(token.address);
    }
  }, [isWalletConnected, walletAddress, fetchNativeBalance, fetchTokenBalance]);

  // Fetch all balances for given tokens
  const fetchBalances = useCallback(async (address: string, tokens: Token[]): Promise<TokenBalances> => {
    const newBalances: TokenBalances = {};

    try {
      console.log(`🔄 Fetching balances for ${tokens.length} tokens:`, tokens.map(t => t.symbol));
      
      // Fetch balances for all tokens in parallel
      const balancePromises = tokens.map(async (token) => {
        let balance: string;
        
        if (token.address === '0x0000000000000000000000000000000000000000') {
          // Native LOOP token
          balance = await fetchNativeBalance(address);
        } else {
          // ERC-20 token
          balance = await fetchTokenBalance(address, token.address, token);
        }
        
        console.log(`💰 ${token.symbol}: ${balance}`);
        return { address: token.address, balance };
      });

      const results = await Promise.all(balancePromises);
      
      results.forEach(({ address, balance }) => {
        newBalances[address] = balance;
      });

    } catch (error) {
      console.error('Error fetching balances:', error);
    }

    return newBalances;
  }, [fetchNativeBalance, fetchTokenBalance]);

  // Main refresh function
  const refreshBalances = useCallback(async (tokens?: Token[]) => {
    if (!isWalletConnected || !walletAddress) {
      setBalances({});
      return;
    }

    // Get the full wallet address from localStorage
    const fullAddress = localStorage.getItem('reachswap_wallet_address');
    if (!fullAddress) {
      console.error('No wallet address found in localStorage');
      return;
    }

    setIsLoading(true);

    try {
      let tokensToFetch: Token[];
      
      if (tokens && tokens.length > 0) {
        // Use provided tokens
        tokensToFetch = tokens;
      } else {
        // Default to common tokens if none provided
        tokensToFetch = [
          {
            symbol: 'LOOP',
            name: 'Loop Network',
            address: '0x0000000000000000000000000000000000000000',
            decimals: 18,
            logoUrl: '/Loop_logo-removebg-preview.png'
          },
          {
            symbol: 'wLOOP',
            name: 'Wrapped Loop',
            address: '0x3936D20a39eD4b0d44EaBfC91757B182f14A38d5',
            decimals: 18,
            logoUrl: '/wloop_logo-removebg-preview.png'
          },
          {
            symbol: 'GIKO',
            name: 'Giko Cat',
            address: '0x0C6E54f51be9A01C10d0c233806B44b0c5EE5bD3',
            decimals: 18,
            logoUrl: '/Giko_Logo-removebg-preview.png'
          }
        ];
      }

      const newBalances = await fetchBalances(fullAddress, tokensToFetch);
      
      // Merge with existing balances instead of replacing
      setBalances(prev => ({
        ...prev,
        ...newBalances
      }));
      
      console.log('✅ Balances updated:', newBalances);
    } catch (error) {
      console.error('Error refreshing balances:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isWalletConnected, walletAddress, fetchBalances]);

  // Get balance for a specific token - pure getter function
  const getTokenBalance = useCallback((token: Token): string => {
    if (!isWalletConnected) return '0.000000';
    const balance = balances[token.address];
    
    // If balance is not cached, trigger a fetch
    if (balance === undefined && !fetchingRef.current.has(token.address)) {
      fetchBalanceForToken(token);
      return '0.000000'; // Return 0 while fetching
    }
    
    return balance || '0.000000';
  }, [balances, isWalletConnected, fetchBalanceForToken]);

  // Set up auto-refresh interval
  useEffect(() => {
    if (!isWalletConnected || !walletAddress) {
      // Clear interval if wallet disconnected
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setBalances({});
      return;
    }

    // Initial fetch
    refreshBalances();

    // Set up 30-second interval
    intervalRef.current = setInterval(() => {
      // Only refresh if tab is visible
      if (isVisibleRef.current) {
        // Refresh all cached tokens
        const cachedTokens = Object.keys(balances);
        if (cachedTokens.length > 0) {
          // Convert addresses back to basic token objects for refresh
          const tokensToRefresh = cachedTokens.map(address => ({
            symbol: address === '0x0000000000000000000000000000000000000000' ? 'LOOP' : 'TOKEN',
            name: 'Token',
            address,
            decimals: 18,
            logoUrl: ''
          }));
          
          refreshBalances(tokensToRefresh);
        }
      }
    }, 30000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isWalletConnected, walletAddress, refreshBalances, balances]);

  // Listen for visibility changes to pause/resume polling
  useEffect(() => {
    const handleVisibilityChange = () => {
      isVisibleRef.current = !document.hidden;
      
      // If tab becomes visible and we have a wallet connected, refresh immediately
      if (!document.hidden && isWalletConnected && walletAddress) {
        refreshBalances();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isWalletConnected, walletAddress, refreshBalances]);

  // Listen for account/network changes
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleAccountsChanged = () => {
      // Clear previous data and refresh balances when account changes
      setBalances({});
      setTimeout(() => refreshBalances(), 1000);
    };

    const handleChainChanged = (chainId: string) => {
      // Only refresh if we're on the correct network
      if (chainId === LOOP_NETWORK_CONFIG.chainId) {
        setTimeout(() => refreshBalances(), 1000);
      } else {
        setBalances({});
      }
    };

    // Add listeners to both wallet providers
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
  }, [refreshBalances]);

  return {
    balances,
    isLoading,
    refreshBalances,
    getTokenBalance,
    fetchBalanceForToken
  };
};