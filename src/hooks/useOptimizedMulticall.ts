import { useCallback, useRef } from 'react';

interface MulticallRequest {
  target: string;
  callData: string;
  key: string;
}

interface MulticallResult {
  success: boolean;
  returnData: string;
  key: string;
}

interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
}

interface UseOptimizedMulticallReturn {
  batchCall: (requests: MulticallRequest[]) => Promise<MulticallResult[]>;
  batchTokenData: (tokenAddresses: string[], userAddress?: string) => Promise<{
    balances: { [address: string]: string };
    metadata: { [address: string]: { symbol: string; decimals: number; name: string } };
    reserves: { [pairAddress: string]: { reserve0: string; reserve1: string } };
  }>;
  clearCache: () => void;
}

const CACHE_TTL = {
  METADATA: 5 * 60 * 1000, // 5 minutes
  BALANCES: 30 * 1000,     // 30 seconds
  RESERVES: 15 * 1000      // 15 seconds
};

export const useOptimizedMulticall = (): UseOptimizedMulticallReturn => {
  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());

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

  // Cache management
  const getCached = useCallback((key: string): any => {
    const entry = cacheRef.current.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > entry.ttl) {
      cacheRef.current.delete(key);
      return null;
    }
    
    return entry.data;
  }, []);

  const setCache = useCallback((key: string, data: any, ttl: number) => {
    cacheRef.current.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }, []);

  // Optimized batch call with parallel execution
  const batchCall = useCallback(async (requests: MulticallRequest[]): Promise<MulticallResult[]> => {
    try {
      const provider = getProvider();
      if (!provider) {
        throw new Error('No provider available');
      }

      // Filter out cached requests
      const uncachedRequests: MulticallRequest[] = [];
      const results: MulticallResult[] = [];

      for (const request of requests) {
        const cached = getCached(request.key);
        if (cached) {
          results.push({
            success: true,
            returnData: cached,
            key: request.key
          });
        } else {
          uncachedRequests.push(request);
        }
      }

      // Execute uncached requests in parallel with limited concurrency
      const BATCH_SIZE = 10; // Limit concurrent requests to avoid rate limiting
      const batches: MulticallRequest[][] = [];
      
      for (let i = 0; i < uncachedRequests.length; i += BATCH_SIZE) {
        batches.push(uncachedRequests.slice(i, i + BATCH_SIZE));
      }

      for (const batch of batches) {
        const batchPromises = batch.map(async (request) => {
          try {
            const result = await provider.request({
              method: 'eth_call',
              params: [{
                to: request.target,
                data: request.callData
              }, 'latest']
            });
            
            // Cache successful results
            if (result && result !== '0x') {
              setCache(request.key, result, CACHE_TTL.METADATA);
            }
            
            return {
              success: true,
              returnData: result || '0x',
              key: request.key
            };
          } catch (error) {
            console.warn(`Multicall failed for ${request.key}:`, error);
            return {
              success: false,
              returnData: '0x',
              key: request.key
            };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      }

      return results;
    } catch (error) {
      console.error('Batch call failed:', error);
      return requests.map(req => ({
        success: false,
        returnData: '0x',
        key: req.key
      }));
    }
  }, [getProvider, getCached, setCache]);

  // Optimized token data fetching
  const batchTokenData = useCallback(async (
    tokenAddresses: string[],
    userAddress?: string
  ) => {
    const requests: MulticallRequest[] = [];
    
    // Add metadata requests
    tokenAddresses.forEach(address => {
      requests.push(
        {
          target: address,
          callData: '0x95d89b41', // symbol()
          key: `symbol_${address}`
        },
        {
          target: address,
          callData: '0x313ce567', // decimals()
          key: `decimals_${address}`
        },
        {
          target: address,
          callData: '0x06fdde03', // name()
          key: `name_${address}`
        }
      );
    });

    // Add balance requests if user address provided
      // CRITICAL FIX: Enhanced balance fetching with direct calls for problematic tokens
    if (userAddress) {
      const paddedUserAddress = userAddress.slice(2).padStart(64, '0');
      tokenAddresses.forEach(address => {
        requests.push({
          target: address,
          callData: '0x70a08231' + paddedUserAddress, // balanceOf(address)
          key: `balance_${address}_${userAddress}`
        });
      });
    }

    const results = await batchCall(requests);
    
    // Process results
    const balances: { [address: string]: string } = {};
    const metadata: { [address: string]: { symbol: string; decimals: number; name: string } } = {};
    const reserves: { [pairAddress: string]: { reserve0: string; reserve1: string } } = {};

    // Group results by type
    const resultMap = new Map(results.map(r => [r.key, r]));

    tokenAddresses.forEach(address => {
      // Process metadata
      const symbolResult = resultMap.get(`symbol_${address}`);
      const decimalsResult = resultMap.get(`decimals_${address}`);
      const nameResult = resultMap.get(`name_${address}`);

      let symbol = `TOKEN_${address.slice(-4).toUpperCase()}`;
      let decimals = 18;
      let name = 'Unknown Token';

      if (symbolResult?.success && symbolResult.returnData !== '0x') {
        try {
          symbol = decodeString(symbolResult.returnData) || symbol;
        } catch (e) {
          // Keep default
        }
      }

      if (decimalsResult?.success && decimalsResult.returnData !== '0x') {
        try {
          decimals = parseInt(decimalsResult.returnData, 16);
          if (isNaN(decimals) || decimals < 0 || decimals > 77) {
            decimals = 18;
          }
        } catch (e) {
          decimals = 18;
        }
      }

      if (nameResult?.success && nameResult.returnData !== '0x') {
        try {
          name = decodeString(nameResult.returnData) || name;
        } catch (e) {
          // Keep default
        }
      }

      metadata[address] = { symbol, decimals, name };

      // Process balances
      if (userAddress) {
        const balanceResult = resultMap.get(`balance_${address}_${userAddress}`);
        
        // CRITICAL FIX: Get token decimals for proper formatting
        const token = Object.values(require('../constants/tokens').TOKENS).find(
          (t: any) => t.address.toLowerCase() === tokenAddress.toLowerCase()
        );
        const decimals = token?.decimals || 18;
        
        if (balanceResult?.success && balanceResult.returnData !== '0x') {
          try {
            const balance = BigInt(balanceResult.returnData);
            
            // CRITICAL FIX: Format balance with correct decimals
            const balanceFormatted = (Number(balance) / Math.pow(10, decimals)).toFixed(6);
            balances[tokenAddress] = balanceFormatted;
            
            console.log(`💰 Batch balance for ${tokenAddress}: ${balanceFormatted} (${decimals} decimals)`);
          } catch (error) {
            console.error(`Error formatting balance for ${tokenAddress}:`, error);
            const precision = Math.min(6, decimals);
            balances[tokenAddress] = '0'.padEnd(precision + 2, '0').replace(/^0/, '0.');
          }
        } else {
          balances[address] = '0';
        }
      }
    });

    return { balances, metadata, reserves };
  }, [batchCall]);

  // Helper function to decode string from hex
  const decodeString = (hexData: string): string => {
    if (!hexData || hexData === '0x') return '';
    
    try {
      const data = hexData.slice(2);
      
      // For simple string returns
      if (data.length <= 64) {
        let result = '';
        for (let i = 0; i < data.length; i += 2) {
          const byte = parseInt(data.substr(i, 2), 16);
          if (byte !== 0) {
            result += String.fromCharCode(byte);
          }
        }
        return result.replace(/\0/g, '').trim();
      }
      
      // For ABI-encoded strings
      if (data.length > 128) {
        const lengthHex = data.slice(64, 128);
        const length = parseInt(lengthHex, 16);
        
        if (length > 0 && length <= 100) {
          const stringHex = data.slice(128, 128 + (length * 2));
          let result = '';
          for (let i = 0; i < stringHex.length; i += 2) {
            const byte = parseInt(stringHex.substr(i, 2), 16);
            if (byte !== 0) {
              result += String.fromCharCode(byte);
            }
          }
          const precision = Math.min(6, decimals);
          balances[tokenAddress] = '0'.padEnd(precision + 2, '0').replace(/^0/, '0.');
        }
      }
      
      return '';
    } catch (error) {
      return '';
    }
  };

  const clearCache = useCallback(() => {
    cacheRef.current.clear();
  }, []);

  return {
    batchCall,
    batchTokenData,
    clearCache
  };
};