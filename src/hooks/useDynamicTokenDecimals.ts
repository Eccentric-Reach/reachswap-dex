import { useState, useCallback, useRef } from 'react';
import { Token } from '../types';

interface TokenDecimalsCache {
  [address: string]: {
    decimals: number;
    timestamp: number;
    verified: boolean;
  };
}

interface UseDynamicTokenDecimalsReturn {
  fetchTokenDecimals: (tokenAddress: string) => Promise<number>;
  getTokenDecimals: (token: Token) => number;
  verifyTokenDecimals: (token: Token) => Promise<Token>;
  batchFetchDecimals: (tokenAddresses: string[]) => Promise<{ [address: string]: number }>;
  clearDecimalsCache: () => void;
}

const DECIMALS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours cache
const STORAGE_KEY = 'reachswap_token_decimals_cache';

export const useDynamicTokenDecimals = (): UseDynamicTokenDecimalsReturn => {
  const [decimalsCache, setDecimalsCache] = useState<TokenDecimalsCache>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      console.warn('Error loading decimals cache:', error);
      return {};
    }
  });
  
  const fetchingRef = useRef<Set<string>>(new Set());

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

  // Save cache to localStorage
  const saveCache = useCallback((cache: TokenDecimalsCache) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
      setDecimalsCache(cache);
    } catch (error) {
      console.warn('Error saving decimals cache:', error);
    }
  }, []);

  // Fetch decimals from contract
  const fetchTokenDecimals = useCallback(async (tokenAddress: string): Promise<number> => {
    const normalizedAddress = tokenAddress.toLowerCase();
    
    // Native LOOP always has 18 decimals
    if (normalizedAddress === '0x0000000000000000000000000000000000000000') {
      return 18;
    }

    // Check cache first
    const cached = decimalsCache[normalizedAddress];
    if (cached && Date.now() - cached.timestamp < DECIMALS_CACHE_TTL) {
      return cached.decimals;
    }

    // Prevent duplicate fetches
    if (fetchingRef.current.has(normalizedAddress)) {
      // Wait for existing fetch to complete
      return new Promise((resolve) => {
        const checkCache = () => {
          const updated = decimalsCache[normalizedAddress];
          if (updated && !fetchingRef.current.has(normalizedAddress)) {
            resolve(updated.decimals);
          } else {
            setTimeout(checkCache, 100);
          }
        };
        checkCache();
      });
    }

    fetchingRef.current.add(normalizedAddress);

    try {
      const provider = getProvider();
      if (!provider) {
        throw new Error('No provider available');
      }

      console.log(`🔍 Fetching decimals for token: ${normalizedAddress}`);

      // ERC-20 decimals() function signature
      const decimalsSignature = '0x313ce567';
      
      const result = await provider.request({
        method: 'eth_call',
        params: [{
          to: tokenAddress,
          data: decimalsSignature
        }, 'latest']
      });

      if (!result || result === '0x') {
        throw new Error('No decimals result from contract');
      }

      const decimals = parseInt(result, 16);
      
      // Validate decimals range
      if (isNaN(decimals) || decimals < 0 || decimals > 77) {
        throw new Error(`Invalid decimals value: ${decimals}`);
      }

      // Cache the result
      const newCache = {
        ...decimalsCache,
        [normalizedAddress]: {
          decimals,
          timestamp: Date.now(),
          verified: true
        }
      };
      
      saveCache(newCache);
      
      console.log(`✅ Fetched decimals for ${normalizedAddress}: ${decimals}`);
      return decimals;

    } catch (error) {
      console.error(`Error fetching decimals for ${normalizedAddress}:`, error);
      
      // Return default 18 decimals on error
      const defaultDecimals = 18;
      
      // Cache the default with error flag
      const newCache = {
        ...decimalsCache,
        [normalizedAddress]: {
          decimals: defaultDecimals,
          timestamp: Date.now(),
          verified: false
        }
      };
      
      saveCache(newCache);
      return defaultDecimals;
    } finally {
      fetchingRef.current.delete(normalizedAddress);
    }
  }, [decimalsCache, getProvider, saveCache]);

  // Get decimals for a token (from cache or fetch)
  const getTokenDecimals = useCallback((token: Token): number => {
    const normalizedAddress = token.address.toLowerCase();
    
    // Native LOOP always has 18 decimals
    if (normalizedAddress === '0x0000000000000000000000000000000000000000') {
      return 18;
    }

    // Check cache first
    const cached = decimalsCache[normalizedAddress];
    if (cached && Date.now() - cached.timestamp < DECIMALS_CACHE_TTL) {
      return cached.decimals;
    }

    // Return token's listed decimals as fallback
    return token.decimals || 18;
  }, [decimalsCache]);

  // Verify and update token decimals
  const verifyTokenDecimals = useCallback(async (token: Token): Promise<Token> => {
    try {
      const actualDecimals = await fetchTokenDecimals(token.address);
      
      // If decimals don't match, return updated token
      if (actualDecimals !== token.decimals) {
        console.log(`🔄 Updating token decimals: ${token.symbol} ${token.decimals} → ${actualDecimals}`);
        
        return {
          ...token,
          decimals: actualDecimals
        };
      }
      
      return token;
    } catch (error) {
      console.error('Error verifying token decimals:', error);
      return token;
    }
  }, [fetchTokenDecimals]);

  // Batch fetch decimals for multiple tokens
  const batchFetchDecimals = useCallback(async (tokenAddresses: string[]): Promise<{ [address: string]: number }> => {
    const results: { [address: string]: number } = {};
    
    // Process in batches to avoid overwhelming the RPC
    const BATCH_SIZE = 5;
    for (let i = 0; i < tokenAddresses.length; i += BATCH_SIZE) {
      const batch = tokenAddresses.slice(i, i + BATCH_SIZE);
      
      const batchPromises = batch.map(async (address) => {
        try {
          const decimals = await fetchTokenDecimals(address);
          return { address: address.toLowerCase(), decimals };
        } catch (error) {
          console.error(`Error in batch fetch for ${address}:`, error);
          return { address: address.toLowerCase(), decimals: 18 };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach(({ address, decimals }) => {
        results[address] = decimals;
      });
    }
    
    return results;
  }, [fetchTokenDecimals]);

  // Clear decimals cache
  const clearDecimalsCache = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      setDecimalsCache({});
      fetchingRef.current.clear();
      console.log('🧹 Decimals cache cleared');
    } catch (error) {
      console.error('Error clearing decimals cache:', error);
    }
  }, []);

  return {
    fetchTokenDecimals,
    getTokenDecimals,
    verifyTokenDecimals,
    batchFetchDecimals,
    clearDecimalsCache
  };
};