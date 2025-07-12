import { useState, useCallback, useRef } from 'react';
import { Token } from '../types';
import { SPHYNX_CONTRACTS } from '../constants/sphynx';
import { REACHSWAP_CONTRACTS } from '../constants/reachswap';
import { useUniversalRouter } from './useUniversalRouter';

interface TokenPrice {
  price: number;
  source: 'sphynx' | 'reachswap' | 'none';
  timestamp: number;
  isLoading: boolean;
}

interface UseDynamicTokenPricingReturn {
  getTokenPrice: (token: Token) => number | undefined;
  fetchTokenPrice: (token: Token) => Promise<void>;
  batchFetchPrices: (tokens: Token[]) => Promise<void>;
  isLoadingPrice: (token: Token) => boolean;
  clearPriceCache: () => void;
}

const PRICE_CACHE_TTL = 30000; // 30 seconds cache
const LOOP_REFERENCE_PRICE = 0.15; // Base reference price for LOOP

export const useDynamicTokenPricing = (): UseDynamicTokenPricingReturn => {
  const [priceCache, setPriceCache] = useState<{ [address: string]: TokenPrice }>({});
  const fetchingRef = useRef<Set<string>>(new Set());
  const { getRouterForPair } = useUniversalRouter();

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

  // Get pair reserves for price calculation
  const getPairReserves = useCallback(async (
    factoryAddress: string,
    tokenA: string,
    tokenB: string
  ): Promise<{ reserve0: string; reserve1: string; token0: string; token1: string } | null> => {
    try {
      const provider = getProvider();
      if (!provider) return null;

      // Get pair address
      const getPairSignature = '0xe6a43905'; // getPair(address,address)
      const token0 = tokenA.toLowerCase() < tokenB.toLowerCase() ? tokenA : tokenB;
      const token1 = tokenA.toLowerCase() < tokenB.toLowerCase() ? tokenB : tokenA;
      const paddedToken0 = token0.slice(2).padStart(64, '0');
      const paddedToken1 = token1.slice(2).padStart(64, '0');
      const data = getPairSignature + paddedToken0 + paddedToken1;

      const pairResult = await provider.request({
        method: 'eth_call',
        params: [{
          to: factoryAddress,
          data: data
        }, 'latest']
      });

      if (!pairResult || pairResult === '0x' || pairResult === '0x0000000000000000000000000000000000000000000000000000000000000000') {
        return null;
      }

      const pairAddress = '0x' + pairResult.slice(-40);

      // Get reserves
      const getReservesSignature = '0x0902f1ac'; // getReserves()
      const reservesResult = await provider.request({
        method: 'eth_call',
        params: [{
          to: pairAddress,
          data: getReservesSignature
        }, 'latest']
      });

      // Get token0 and token1
      const [token0Result, token1Result] = await Promise.all([
        provider.request({
          method: 'eth_call',
          params: [{ to: pairAddress, data: '0x0dfe1681' }, 'latest'] // token0()
        }),
        provider.request({
          method: 'eth_call',
          params: [{ to: pairAddress, data: '0xd21220a7' }, 'latest'] // token1()
        })
      ]);

      // Decode reserves
      const reservesData = reservesResult.slice(2);
      const reserve0 = BigInt('0x' + reservesData.slice(0, 64)).toString();
      const reserve1 = BigInt('0x' + reservesData.slice(64, 128)).toString();

      // Decode token addresses
      const pairToken0 = '0x' + token0Result.slice(-40);
      const pairToken1 = '0x' + token1Result.slice(-40);

      return { reserve0, reserve1, token0: pairToken0, token1: pairToken1 };
    } catch (error) {
      console.error('Error getting pair reserves:', error);
      return null;
    }
  }, [getProvider]);

  // Calculate token price from reserves
  const calculatePriceFromReserves = useCallback((
    token: Token,
    reserves: { reserve0: string; reserve1: string; token0: string; token1: string },
    referenceToken: Token,
    referencePrice: number
  ): number => {
    try {
      const isToken0 = token.address.toLowerCase() === reserves.token0.toLowerCase();
      const tokenReserve = BigInt(isToken0 ? reserves.reserve0 : reserves.reserve1);
      const referenceReserve = BigInt(isToken0 ? reserves.reserve1 : reserves.reserve0);

      if (tokenReserve === BigInt(0) || referenceReserve === BigInt(0)) {
        return 0;
      }

      // Calculate price: (referenceReserve / tokenReserve) * referencePrice
      const ratio = Number(referenceReserve) / Number(tokenReserve);
      
      // Adjust for decimal differences
      const decimalAdjustment = Math.pow(10, token.decimals - referenceToken.decimals);
      const price = ratio * referencePrice * decimalAdjustment;

      return price;
    } catch (error) {
      console.error('Error calculating price from reserves:', error);
      return 0;
    }
  }, []);

  // Fetch price for a single token
  const fetchTokenPrice = useCallback(async (token: Token): Promise<void> => {
    // Skip if already fetching
    if (fetchingRef.current.has(token.address)) {
      return;
    }

    // Check cache validity
    const cached = priceCache[token.address];
    if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL) {
      return;
    }

    // Handle native LOOP
    if (token.address === '0x0000000000000000000000000000000000000000') {
      setPriceCache(prev => ({
        ...prev,
        [token.address]: {
          price: LOOP_REFERENCE_PRICE,
          source: 'none',
          timestamp: Date.now(),
          isLoading: false
        }
      }));
      return;
    }

    fetchingRef.current.add(token.address);

    // Set loading state
    setPriceCache(prev => ({
      ...prev,
      [token.address]: {
        price: 0,
        source: 'none',
        timestamp: Date.now(),
        isLoading: true
      }
    }));

    try {
      // Get router info to determine where liquidity exists
      const routerInfo = await getRouterForPair(token, {
        symbol: 'LOOP',
        name: 'Loop Network',
        address: '0x0000000000000000000000000000000000000000',
        decimals: 18,
        logoUrl: '/Loop_logo-removebg-preview.png'
      });

      let price = 0;
      let source: 'sphynx' | 'reachswap' | 'none' = 'none';

      if (routerInfo.pairExists) {
        // Try to get price from the router that has liquidity
        const factoryAddress = routerInfo.router === 'sphynx' 
          ? SPHYNX_CONTRACTS.FACTORY 
          : REACHSWAP_CONTRACTS.FACTORY;

        // Use WLOOP for calculations since that's what's in the pairs
        const wloopAddress = SPHYNX_CONTRACTS.WLOOP;
        
        const reserves = await getPairReserves(factoryAddress, token.address, wloopAddress);
        
        if (reserves) {
          price = calculatePriceFromReserves(
            token,
            reserves,
            {
              symbol: 'wLOOP',
              name: 'Wrapped Loop',
              address: wloopAddress,
              decimals: 18,
              logoUrl: '/wloop_logo-removebg-preview.png'
            },
            LOOP_REFERENCE_PRICE
          );
          source = routerInfo.router;
        }
      }

      // Update cache with result
      setPriceCache(prev => ({
        ...prev,
        [token.address]: {
          price,
          source,
          timestamp: Date.now(),
          isLoading: false
        }
      }));

      console.log(`💰 Fetched price for ${token.symbol}: $${price.toFixed(6)} (${source})`);

    } catch (error) {
      console.error(`Error fetching price for ${token.symbol}:`, error);
      
      // Set error state
      setPriceCache(prev => ({
        ...prev,
        [token.address]: {
          price: 0,
          source: 'none',
          timestamp: Date.now(),
          isLoading: false
        }
      }));
    } finally {
      fetchingRef.current.delete(token.address);
    }
  }, [priceCache, getRouterForPair, getPairReserves, calculatePriceFromReserves]);

  // Batch fetch prices for multiple tokens
  const batchFetchPrices = useCallback(async (tokens: Token[]): Promise<void> => {
    const tokensToFetch = tokens.filter(token => {
      const cached = priceCache[token.address];
      return !cached || Date.now() - cached.timestamp >= PRICE_CACHE_TTL;
    });

    if (tokensToFetch.length === 0) return;

    console.log(`🔄 Batch fetching prices for ${tokensToFetch.length} tokens`);

    // Fetch prices in parallel with limited concurrency
    const BATCH_SIZE = 3;
    for (let i = 0; i < tokensToFetch.length; i += BATCH_SIZE) {
      const batch = tokensToFetch.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(token => fetchTokenPrice(token)));
    }
  }, [priceCache, fetchTokenPrice]);

  // Get cached price for a token
  const getTokenPrice = useCallback((token: Token): number | undefined => {
    const cached = priceCache[token.address];
    
    if (!cached) {
      // Trigger fetch if not in cache
      fetchTokenPrice(token);
      return undefined;
    }

    if (cached.isLoading) {
      return undefined;
    }

    // Return price if valid, undefined if no liquidity
    return cached.price > 0 ? cached.price : undefined;
  }, [priceCache, fetchTokenPrice]);

  // Check if price is loading
  const isLoadingPrice = useCallback((token: Token): boolean => {
    const cached = priceCache[token.address];
    return cached?.isLoading || false;
  }, [priceCache]);

  // Clear price cache
  const clearPriceCache = useCallback(() => {
    setPriceCache({});
    fetchingRef.current.clear();
  }, []);

  return {
    getTokenPrice,
    fetchTokenPrice,
    batchFetchPrices,
    isLoadingPrice,
    clearPriceCache
  };
};