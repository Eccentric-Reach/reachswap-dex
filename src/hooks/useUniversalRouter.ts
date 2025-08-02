import { useState, useCallback } from 'react';
import { Token } from '../types';
import { SPHYNX_CONTRACTS, SPHYNX_FACTORY_ABI } from '../constants/sphynx';
import { REACHSWAP_CONTRACTS, REACHSWAP_FACTORY_ABI, ROUTER_PRIORITY } from '../constants/reachswap';

interface RouterInfo {
  router: 'sphynx' | 'reachswap';
  path: string[];
  pairExists: boolean;
  isMultiHop: boolean;
}

interface UseUniversalRouterReturn {
  getRouterForPair: (tokenA: Token, tokenB: Token) => Promise<RouterInfo>;
  checkPairExists: (factoryAddress: string, tokenA: string, tokenB: string) => Promise<boolean>;
  findOptimalPath: (tokenA: Token, tokenB: Token) => Promise<RouterInfo>;
  isChecking: boolean;
  routerCache: { [key: string]: RouterInfo };
}

export const useUniversalRouter = (): UseUniversalRouterReturn => {
  const [isChecking, setIsChecking] = useState(false);
  const [routerCache, setRouterCache] = useState<{ [key: string]: RouterInfo }>({});

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

  // Check if pair exists on a specific factory
  const checkPairExists = useCallback(async (
    factoryAddress: string,
    tokenA: string,
    tokenB: string
  ): Promise<boolean> => {
    try {
      const provider = getProvider();
      if (!provider) return false;

      // Skip check if factory is not deployed (address is zero)
      if (factoryAddress === '0x0000000000000000000000000000000000000000') {
        return false;
      }

      const getPairSignature = '0xe6a43905'; // getPair(address,address)
      const token0 = tokenA.toLowerCase() < tokenB.toLowerCase() ? tokenA : tokenB;
      const token1 = tokenA.toLowerCase() < tokenB.toLowerCase() ? tokenB : tokenA;
      const paddedToken0 = token0.slice(2).padStart(64, '0');
      const paddedToken1 = token1.slice(2).padStart(64, '0');
      const data = getPairSignature + paddedToken0 + paddedToken1;

      const result = await provider.request({
        method: 'eth_call',
        params: [{
          to: factoryAddress,
          data: data
        }, 'latest']
      });

      if (!result || result === '0x' || result === '0x0000000000000000000000000000000000000000000000000000000000000000') {
        return false;
      }

      const pairAddress = '0x' + result.slice(-40);
      const pairExists = pairAddress !== '0x0000000000000000000000000000000000000000';
      
      if (pairExists) {
        console.log(`✅ Pair found: ${tokenA}/${tokenB} on factory ${factoryAddress} -> ${pairAddress}`);
      }
      
      return pairExists;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Handle circuit breaker and rate limiting errors gracefully
      if (errorMessage.includes('circuit breaker') || 
          errorMessage.includes('rate limit') || 
          errorMessage.includes('too many requests') ||
          errorMessage.includes('service unavailable') ||
          errorMessage.includes('timeout')) {
        console.warn(`⚠️ RPC temporarily unavailable for factory ${factoryAddress}: ${errorMessage}`);
        return false;
      }
      
      console.error(`Error checking pair exists on factory ${factoryAddress}:`, error);
      return false;
    }
  }, [getProvider]);

  // Get normalized token addresses (handle native LOOP)
  const getNormalizedAddress = useCallback((token: Token): string => {
    return token.address === '0x0000000000000000000000000000000000000000' 
      ? SPHYNX_CONTRACTS.WLOOP 
      : token.address;
  }, []);

  // Find optimal router and path for a token pair
  const findOptimalPath = useCallback(async (tokenA: Token, tokenB: Token): Promise<RouterInfo> => {
    const tokenAAddr = getNormalizedAddress(tokenA);
    const tokenBAddr = getNormalizedAddress(tokenB);
    
    // Create cache key
    const cacheKey = `${tokenAAddr.toLowerCase()}-${tokenBAddr.toLowerCase()}`;
    
    // Check cache first (valid for 30 seconds)
    const cached = routerCache[cacheKey];
    if (cached && Date.now() - (cached as any).timestamp < 30000) {
      console.log(`📦 Using cached route for ${tokenA.symbol}/${tokenB.symbol}: ${cached.router.toUpperCase()}`);
      return cached;
    }

    setIsChecking(true);

    try {
      console.log(`🔍 Finding optimal route for ${tokenA.symbol} (${tokenAAddr}) → ${tokenB.symbol} (${tokenBAddr})`);

      // 1. PRIORITY: Check ReachSwap first (native DEX), then Sphynx as fallback
      let reachSwapDirectPair = false;
      let sphynxDirectPair = false;
      
      try {
        // Check ReachSwap first with higher priority
        reachSwapDirectPair = await checkPairExists(REACHSWAP_CONTRACTS.FACTORY, tokenAAddr, tokenBAddr);
        
        // Only check Sphynx if ReachSwap doesn't have the pair
        if (!reachSwapDirectPair) {
          sphynxDirectPair = await checkPairExists(SPHYNX_CONTRACTS.FACTORY, tokenAAddr, tokenBAddr);
        }
      } catch (error) {
        console.warn('⚠️ Error checking direct pairs, trying fallback approach:', error);
        
        // Fallback: try both in sequence
        try {
          reachSwapDirectPair = await checkPairExists(REACHSWAP_CONTRACTS.FACTORY, tokenAAddr, tokenBAddr);
        } catch (e) {
          console.warn('ReachSwap factory check failed:', e);
        }
        
        try {
          sphynxDirectPair = await checkPairExists(SPHYNX_CONTRACTS.FACTORY, tokenAAddr, tokenBAddr);
        } catch (e) {
          console.warn('Sphynx factory check failed:', e);
        }
      }

      // PRIORITY LOGIC: ReachSwap takes precedence over Sphynx
      if (reachSwapDirectPair) {
        const result: RouterInfo = {
          router: 'reachswap',
          path: [tokenAAddr, tokenBAddr],
          pairExists: true,
          isMultiHop: false
        };
        
        // Cache the result
        setRouterCache(prev => ({
          ...prev,
          [cacheKey]: { ...result, timestamp: Date.now() } as any
        }));
        
        console.log(`✅ Direct pair found on ReachSwap (PRIORITY): ${tokenA.symbol}/${tokenB.symbol}`);
        return result;
      }

      // If Sphynx has direct pair and ReachSwap doesn't, use Sphynx
      if (sphynxDirectPair) {
        const result: RouterInfo = {
          router: 'sphynx',
          path: [tokenAAddr, tokenBAddr],
          pairExists: true,
          isMultiHop: false
        };
        
        // Cache the result
        setRouterCache(prev => ({
          ...prev,
          [cacheKey]: { ...result, timestamp: Date.now() } as any
        }));
        
        console.log(`✅ Direct pair found on Sphynx (fallback): ${tokenA.symbol}/${tokenB.symbol}`);
        return result;
      }

      // 2. Check multi-hop routes via WLOOP - ReachSwap first, then Sphynx
      console.log(`🔄 Checking multi-hop routes via WLOOP (ReachSwap priority)...`);
      
      let reachSwapHop1 = false;
      let reachSwapHop2 = false;
      let sphynxHop1 = false;
      let sphynxHop2 = false;
      
      try {
        // Check ReachSwap multi-hop first
        [reachSwapHop1, reachSwapHop2] = await Promise.all([
          checkPairExists(REACHSWAP_CONTRACTS.FACTORY, tokenAAddr, tokenBAddr),
          checkPairExists(REACHSWAP_CONTRACTS.FACTORY, SPHYNX_CONTRACTS.WLOOP, tokenBAddr)
        ]);
        
        // Only check Sphynx multi-hop if ReachSwap doesn't have complete path
        if (!reachSwapHop1 || !reachSwapHop2) {
          [sphynxHop1, sphynxHop2] = await Promise.all([
            checkPairExists(SPHYNX_CONTRACTS.FACTORY, tokenAAddr, SPHYNX_CONTRACTS.WLOOP),
            checkPairExists(SPHYNX_CONTRACTS.FACTORY, SPHYNX_CONTRACTS.WLOOP, tokenBAddr)
          ]);
        }
      } catch (error) {
        console.warn('⚠️ Error checking multi-hop pairs, continuing with fallback logic:', error);
        // Continue with false values for all hops
      }

      // Check if ReachSwap can handle multi-hop (PRIORITY)
      if (reachSwapHop1 && reachSwapHop2) {
        const result: RouterInfo = {
          router: 'reachswap',
          path: [tokenAAddr, SPHYNX_CONTRACTS.WLOOP, tokenBAddr],
          pairExists: true,
          isMultiHop: true
        };
        
        // Cache the result
        setRouterCache(prev => ({
          ...prev,
          [cacheKey]: { ...result, timestamp: Date.now() } as any
        }));
        
        console.log(`✅ Multi-hop route found on ReachSwap (PRIORITY): ${tokenA.symbol} → WLOOP → ${tokenB.symbol}`);
        return result;
      }

      // Check if Sphynx can handle multi-hop (fallback)
      if (sphynxHop1 && sphynxHop2) {
        const result: RouterInfo = {
          router: 'sphynx',
          path: [tokenAAddr, SPHYNX_CONTRACTS.WLOOP, tokenBAddr],
          pairExists: true,
          isMultiHop: true
        };
        
        // Cache the result
        setRouterCache(prev => ({
          ...prev,
          [cacheKey]: { ...result, timestamp: Date.now() } as any
        }));
        
        console.log(`✅ Multi-hop route found on Sphynx (fallback): ${tokenA.symbol} → WLOOP → ${tokenB.symbol}`);
        return result;
      }

      // 3. No valid route found on either DEX
      console.log(`❌ No liquidity path found for ${tokenA.symbol}/${tokenB.symbol} on any DEX`);
      
      const result: RouterInfo = {
        router: 'reachswap', // Default to ReachSwap even if no liquidity
        path: [tokenAAddr, tokenBAddr],
        pairExists: false,
        isMultiHop: false
      };
      
      // Cache the negative result for a shorter time (10 seconds)
      setRouterCache(prev => ({
        ...prev,
        [cacheKey]: { ...result, timestamp: Date.now() - 20000 } as any // Expire quickly
      }));
      
      return result;

    } catch (error) {
      console.error('Error finding optimal path:', error);
      
      // Return fallback on error
      return {
        router: 'reachswap', // Default to ReachSwap
        path: [tokenAAddr, tokenBAddr],
        pairExists: false,
        isMultiHop: false
      };
    } finally {
      setIsChecking(false);
    }
  }, [getNormalizedAddress, checkPairExists, routerCache]);

  // Main function to get router for a pair (wrapper around findOptimalPath)
  const getRouterForPair = useCallback(async (tokenA: Token, tokenB: Token): Promise<RouterInfo> => {
    return await findOptimalPath(tokenA, tokenB);
  }, [findOptimalPath]);

  return {
    getRouterForPair,
    checkPairExists,
    findOptimalPath,
    isChecking,
    routerCache
  };
};