import { useState, useCallback } from 'react';
import { Token } from '../types';

interface TokenCacheData {
  decimals: number;
  symbol: string;
  name: string;
  hasFee: boolean;
  feePercentage: number;
  timestamp: number;
}

interface UseTokenCacheReturn {
  getCachedTokenData: (address: string) => TokenCacheData | null;
  setCachedTokenData: (address: string, data: Omit<TokenCacheData, 'timestamp'>) => void;
  isCacheValid: (address: string) => boolean;
  clearCache: () => void;
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const useTokenCache = (): UseTokenCacheReturn => {
  const [cache, setCache] = useState<{ [address: string]: TokenCacheData }>({});

  const getCachedTokenData = useCallback((address: string): TokenCacheData | null => {
    const normalizedAddress = address.toLowerCase();
    const cached = cache[normalizedAddress];
    
    if (!cached) return null;
    
    // Check if cache is still valid
    const now = Date.now();
    if (now - cached.timestamp > CACHE_DURATION) {
      // Remove expired cache entry
      setCache(prev => {
        const newCache = { ...prev };
        delete newCache[normalizedAddress];
        return newCache;
      });
      return null;
    }
    
    return cached;
  }, [cache]);

  const setCachedTokenData = useCallback((
    address: string, 
    data: Omit<TokenCacheData, 'timestamp'>
  ) => {
    const normalizedAddress = address.toLowerCase();
    setCache(prev => ({
      ...prev,
      [normalizedAddress]: {
        ...data,
        timestamp: Date.now()
      }
    }));
  }, []);

  const isCacheValid = useCallback((address: string): boolean => {
    const cached = getCachedTokenData(address);
    return cached !== null;
  }, [getCachedTokenData]);

  const clearCache = useCallback(() => {
    setCache({});
  }, []);

  return {
    getCachedTokenData,
    setCachedTokenData,
    isCacheValid,
    clearCache
  };
};