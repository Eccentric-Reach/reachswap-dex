import { useState, useEffect, useCallback, useRef } from 'react';
import { Token } from '../types';
import { useDynamicTokenDecimals } from './useDynamicTokenDecimals';

interface TokenBalanceState {
  balance: string;
  isLoading: boolean;
  error?: string;
  lastFetched?: number;
}

interface VisibleTokenBalances {
  [tokenAddress: string]: TokenBalanceState;
}

interface UseVisibleTokenBalancesReturn {
  balances: VisibleTokenBalances;
  fetchBalanceForToken: (token: Token) => Promise<void>;
  getTokenBalance: (token: Token) => string;
  isTokenLoading: (token: Token) => boolean;
  clearBalances: () => void;
}

const CACHE_DURATION = 30000; // 30 seconds cache
const LOOP_NETWORK_CONFIG = {
  chainId: '0x3CBF',
  rpcUrl: 'https://api.mainnetloop.com'
};

export const useVisibleTokenBalances = (
  isWalletConnected: boolean,
  walletAddress?: string
): UseVisibleTokenBalancesReturn => {
  const [balances, setBalances] = useState<VisibleTokenBalances>({});
  const fetchingRef = useRef<Set<string>>(new Set());
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
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

  // Fetch native LOOP balance with circuit breaker handling
  const fetchNativeBalance = useCallback(async (address: string, signal?: AbortSignal): Promise<string> => {
    try {
      const provider = getProvider();
      if (!provider) {
        console.warn('Wallet provider not available, returning default balance');
        return '0.0000';
      }

      if (signal?.aborted) {
        throw new Error('Request aborted');
      }

      const balance = await provider.request({
        method: 'eth_getBalance',
        params: [address, 'latest']
      });

      if (signal?.aborted) {
        throw new Error('Request aborted');
      }

      // Convert from wei to LOOP (18 decimals)
      const balanceInLoop = parseInt(balance, 16) / Math.pow(10, 18);
      return balanceInLoop.toFixed(4);
    } catch (error: any) {
      if (error.name === 'AbortError' || error.message === 'Request aborted') {
        throw error;
      }
      
      // Handle circuit breaker errors gracefully
      if (error.message && error.message.includes('circuit breaker')) {
        console.warn('Circuit breaker error detected, returning cached/default balance');
        return '0.0000';
      }
      
      console.error('Error fetching native balance:', error);
      return '0.0000';
    }
  }, [getProvider]);

  // Fetch ERC-20 token balance with enhanced error handling
  const fetchTokenBalance = useCallback(async (
    address: string, 
    tokenAddress: string, 
    token: Token,
    signal?: AbortSignal
  ): Promise<string> => {
    try {
      const provider = getProvider();
      if (!provider) {
        console.warn('Wallet provider not available, returning default balance');
        const precision = Math.min(4, token.decimals);
        return '0'.padEnd(precision + 2, '0').replace(/^0/, '0.');
      }

      if (signal?.aborted) {
        throw new Error('Request aborted');
      }

      // Get actual decimals for the token
      const actualDecimals = getTokenDecimals(token);
      
      // CRITICAL FIX: Enhanced balance fetching with direct balanceOf() calls
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
          
          if (signal?.aborted) {
            throw new Error('Request aborted');
          }
          
          // Break out of retry loop if successful
          break;
        } catch (error: any) {
          if (error.name === 'AbortError' || error.message === 'Request aborted') {
            throw error;
          }
          
          retryCount++;
          if (retryCount > maxRetries) {
            throw error;
          }
          
          console.warn(`Retry ${retryCount}/${maxRetries} for token ${token.symbol} (${actualDecimals} decimals):`, error);
          
          // Wait before retry with exponential backoff
          await new Promise(resolve => setTimeout(resolve, 500 * retryCount));
          
          if (signal?.aborted) {
            throw new Error('Request aborted');
          }
        }
      }

      if (result && result !== '0x' && result !== '0x0') {
        const balanceHex = result;
        const balanceWei = parseInt(balanceHex, 16);
        
        // CRITICAL FIX: Use actual decimals for balance calculation
        const balance = balanceWei / Math.pow(10, actualDecimals);
        
        // CRITICAL FIX: Format based on actual token decimals
        const precision = Math.min(4, actualDecimals);
        const formatted = balance.toFixed(precision);
        
        console.log(`💰 Balance fetched for token ${token.symbol}: ${formatted} (${actualDecimals} decimals, raw: ${balanceWei})`);
        return formatted;
      }
      
      // CRITICAL FIX: Return appropriate zero format with actual decimals
      const precision = Math.min(4, actualDecimals);
      return '0'.padEnd(precision + 2, '0').replace(/^0/, '0.');
    } catch (error: any) {
      if (error.name === 'AbortError' || error.message === 'Request aborted') {
        throw error;
      }
      
      // Handle circuit breaker and RPC errors gracefully
      if (error.message && (
        error.message.includes('circuit breaker') ||
        error.message.includes('rate limit') ||
        error.message.includes('too many requests')
      )) {
        console.warn(`RPC rate limit/circuit breaker for ${token.symbol} (${getTokenDecimals(token)} decimals), returning default balance`);
        const precision = Math.min(4, getTokenDecimals(token));
        return '0'.padEnd(precision + 2, '0').replace(/^0/, '0.');
      }
      
      console.error(`Error fetching token balance for ${token.symbol} (${getTokenDecimals(token)} decimals):`, error);
      const precision = Math.min(4, getTokenDecimals(token));
      return '0'.padEnd(precision + 2, '0').replace(/^0/, '0.');
    }
  }, [getProvider, getTokenDecimals]);

  // Check if balance is cached and still valid
  const isCacheValid = useCallback((tokenAddress: string): boolean => {
    const cached = balances[tokenAddress];
    if (!cached || !cached.lastFetched) return false;
    
    const now = Date.now();
    return (now - cached.lastFetched) < CACHE_DURATION;
  }, [balances]);

  // Fetch balance for a specific token with retry logic
  const fetchBalanceForToken = useCallback(async (token: Token): Promise<void> => {
    if (!isWalletConnected || !walletAddress) {
      return;
    }

    const fullAddress = localStorage.getItem('reachswap_wallet_address');
    if (!fullAddress) {
      return;
    }

    // Check if already fetching this token
    if (fetchingRef.current.has(token.address)) {
      return;
    }

    // Check cache validity
    if (isCacheValid(token.address)) {
      return;
    }

    // Cancel any existing request for this token
    const existingController = abortControllersRef.current.get(token.address);
    if (existingController) {
      existingController.abort();
    }

    // Create new abort controller
    const abortController = new AbortController();
    abortControllersRef.current.set(token.address, abortController);
    fetchingRef.current.add(token.address);

    // Set loading state
    setBalances(prev => ({
      ...prev,
      [token.address]: {
        ...prev[token.address],
        isLoading: true,
        error: undefined
      }
    }));

    let retryCount = 0;
    const maxRetries = 2;

    const attemptFetch = async (): Promise<string> => {
      try {
        let balance: string;
        
        if (token.address === '0x0000000000000000000000000000000000000000') {
          // Native LOOP token
          balance = await fetchNativeBalance(fullAddress, abortController.signal);
        } else {
          // ERC-20 token
          balance = await fetchTokenBalance(fullAddress, token.address, token, abortController.signal);
        }

        return balance;
      } catch (error: any) {
        // Handle circuit breaker and rate limit errors with retry
        if (error.message && (
          error.message.includes('circuit breaker') ||
          error.message.includes('rate limit') ||
          error.message.includes('too many requests')
        ) && retryCount < maxRetries) {
          retryCount++;
          console.log(`Retrying balance fetch for ${token.symbol} (attempt ${retryCount}/${maxRetries})`);
          
          // Wait with exponential backoff
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
          return attemptFetch();
        }
        
        throw error;
      }
    };

    try {
      const balance = await attemptFetch();

      // Update balance if request wasn't aborted
      if (!abortController.signal.aborted) {
        setBalances(prev => ({
          ...prev,
          [token.address]: {
            balance,
            isLoading: false,
            lastFetched: Date.now(),
            error: undefined
          }
        }));
      }
    } catch (error: any) {
      if (!abortController.signal.aborted) {
        console.error(`Error fetching balance for ${token.symbol}:`, error);
        
        // Provide user-friendly error messages
        let errorMessage = 'Failed to fetch balance';
        if (error.message && error.message.includes('circuit breaker')) {
          errorMessage = 'Network temporarily unavailable';
        } else if (error.message && error.message.includes('rate limit')) {
          errorMessage = 'Too many requests, please wait';
        }
        
        setBalances(prev => ({
          ...prev,
          [token.address]: {
            balance: '0.0000',
            isLoading: false,
            error: errorMessage,
            lastFetched: Date.now()
          }
        }));
      }
    } finally {
      fetchingRef.current.delete(token.address);
      abortControllersRef.current.delete(token.address);
    }
  }, [isWalletConnected, walletAddress, fetchNativeBalance, fetchTokenBalance, isCacheValid]);

  // Get balance for a specific token
  const getTokenBalance = useCallback((token: Token): string => {
    if (!isWalletConnected) return '0.0000';
    const tokenState = balances[token.address];
    return tokenState?.balance || '0.0000';
  }, [balances, isWalletConnected]);

  // Check if token is loading
  const isTokenLoading = useCallback((token: Token): boolean => {
    if (!isWalletConnected) return false;
    const tokenState = balances[token.address];
    return tokenState?.isLoading || false;
  }, [balances, isWalletConnected]);

  // Clear all balances
  const clearBalances = useCallback(() => {
    // Abort all pending requests
    abortControllersRef.current.forEach(controller => controller.abort());
    abortControllersRef.current.clear();
    fetchingRef.current.clear();
    setBalances({});
  }, []);

  // Clear balances when wallet disconnects
  useEffect(() => {
    if (!isWalletConnected) {
      clearBalances();
    }
  }, [isWalletConnected, clearBalances]);

  // Listen for account/network changes
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleAccountsChanged = () => {
      clearBalances();
    };

    const handleChainChanged = (chainId: string) => {
      if (chainId !== LOOP_NETWORK_CONFIG.chainId) {
        clearBalances();
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
  }, [clearBalances]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearBalances();
    };
  }, [clearBalances]);

  return {
    balances,
    fetchBalanceForToken,
    getTokenBalance,
    isTokenLoading,
    clearBalances
  };
};