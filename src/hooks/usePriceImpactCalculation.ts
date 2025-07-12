import { useState, useCallback, useRef } from 'react';
import { Token } from '../types';
import { SPHYNX_CONTRACTS } from '../constants/sphynx';

interface PairReserves {
  reserve0: string;
  reserve1: string;
  token0: string;
  token1: string;
  blockTimestampLast: number;
}

interface PriceImpactResult {
  priceImpact: number;
  expectedRate: number;
  actualRate: number;
  isHighImpact: boolean;
  isCalculated: boolean;
  error?: string;
}

interface UsePriceImpactCalculationReturn {
  calculatePriceImpact: (
    tokenIn: Token,
    tokenOut: Token,
    amountIn: string,
    amountOut: string,
    path: string[]
  ) => Promise<PriceImpactResult>;
  getCachedPriceImpact: (tokenInAddress: string, tokenOutAddress: string) => PriceImpactResult | null;
  clearCache: () => void;
  isCalculating: boolean;
}

// Cache for pair reserves to improve UX
interface ReservesCache {
  [pairKey: string]: {
    reserves: PairReserves;
    timestamp: number;
    ttl: number;
  };
}

const CACHE_TTL = 15000; // 15 seconds cache for reserves
const HIGH_IMPACT_THRESHOLD = 3; // 3% threshold for high impact warning

export const usePriceImpactCalculation = (): UsePriceImpactCalculationReturn => {
  const [isCalculating, setIsCalculating] = useState(false);
  const reservesCacheRef = useRef<ReservesCache>({});
  const priceImpactCacheRef = useRef<{ [key: string]: PriceImpactResult }>({});

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

  // Get pair address from factory
  const getPairAddress = useCallback(async (tokenA: string, tokenB: string): Promise<string> => {
    try {
      const provider = getProvider();
      if (!provider) throw new Error('No provider available');

      const getPairSignature = '0xe6a43905'; // getPair(address,address)
      const token0 = tokenA.toLowerCase() < tokenB.toLowerCase() ? tokenA : tokenB;
      const token1 = tokenA.toLowerCase() < tokenB.toLowerCase() ? tokenB : tokenA;
      const paddedToken0 = token0.slice(2).padStart(64, '0');
      const paddedToken1 = token1.slice(2).padStart(64, '0');
      const data = getPairSignature + paddedToken0 + paddedToken1;

      const result = await provider.request({
        method: 'eth_call',
        params: [{
          to: SPHYNX_CONTRACTS.FACTORY,
          data: data
        }, 'latest']
      });

      if (!result || result === '0x' || result === '0x0000000000000000000000000000000000000000000000000000000000000000') {
        throw new Error('Pair does not exist');
      }

      return '0x' + result.slice(-40);
    } catch (error) {
      console.error('Error getting pair address:', error);
      throw error;
    }
  }, [getProvider]);

  // Get pair reserves with caching
  const getPairReserves = useCallback(async (pairAddress: string): Promise<PairReserves> => {
    const cacheKey = pairAddress.toLowerCase();
    const cached = reservesCacheRef.current[cacheKey];
    
    // Check cache validity
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.reserves;
    }

    try {
      const provider = getProvider();
      if (!provider) throw new Error('No provider available');

      // Get reserves, token0, and token1 in parallel
      const [reservesResult, token0Result, token1Result] = await Promise.all([
        provider.request({
          method: 'eth_call',
          params: [{ to: pairAddress, data: '0x0902f1ac' }, 'latest'] // getReserves()
        }),
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
      const blockTimestampLast = parseInt('0x' + reservesData.slice(128, 192), 16);

      // Decode token addresses
      const token0 = '0x' + token0Result.slice(-40);
      const token1 = '0x' + token1Result.slice(-40);

      const reserves: PairReserves = {
        reserve0,
        reserve1,
        token0,
        token1,
        blockTimestampLast
      };

      // Cache the result
      reservesCacheRef.current[cacheKey] = {
        reserves,
        timestamp: Date.now(),
        ttl: CACHE_TTL
      };

      return reserves;
    } catch (error) {
      console.error('Error getting pair reserves:', error);
      throw error;
    }
  }, [getProvider]);

  // Calculate price impact using correct formula with BigNumber precision
  const calculatePriceImpactForPair = useCallback(async (
    tokenIn: string,
    tokenOut: string,
    amountInWei: string,
    amountOutWei: string
  ): Promise<number> => {
    try {
      const pairAddress = await getPairAddress(tokenIn, tokenOut);
      const reserves = await getPairReserves(pairAddress);

      // Determine which token is token0 and token1
      const isToken0In = tokenIn.toLowerCase() === reserves.token0.toLowerCase();
      const reserveIn = BigInt(isToken0In ? reserves.reserve0 : reserves.reserve1);
      const reserveOut = BigInt(isToken0In ? reserves.reserve1 : reserves.reserve0);

      // Validate reserves
      if (reserveIn === BigInt(0) || reserveOut === BigInt(0)) {
        throw new Error('Invalid reserves - no liquidity');
      }

      const amountInBig = BigInt(amountInWei);
      const amountOutBig = BigInt(amountOutWei);

      // Calculate expected market rate (without price impact)
      // expectedMarketRate = reserveOut / reserveIn
      const expectedMarketRate = Number(reserveOut * BigInt(1e18) / reserveIn) / 1e18;

      // Calculate actual swap rate
      // actualSwapRate = amountOut / amountIn
      const actualSwapRate = Number(amountOutBig * BigInt(1e18) / amountInBig) / 1e18;

      // Calculate price impact using the correct formula
      // priceImpact = (expectedMarketRate - actualSwapRate) / expectedMarketRate * 100
      let priceImpact = 0;
      if (expectedMarketRate > 0) {
        priceImpact = ((expectedMarketRate - actualSwapRate) / expectedMarketRate) * 100;
      }

      // Ensure price impact is positive and reasonable
      priceImpact = Math.max(0, Math.min(priceImpact, 100));

      console.log(`📊 Price Impact Calculation:
        Expected Rate: ${expectedMarketRate.toFixed(8)}
        Actual Rate: ${actualSwapRate.toFixed(8)}
        Price Impact: ${priceImpact.toFixed(4)}%
        Reserve In: ${reserveIn.toString()}
        Reserve Out: ${reserveOut.toString()}
        Amount In: ${amountInWei}
        Amount Out: ${amountOutWei}`);

      return priceImpact;
    } catch (error) {
      console.error('Error calculating price impact for pair:', error);
      // Return a conservative estimate for unknown pairs
      return 0.1;
    }
  }, [getPairAddress, getPairReserves]);

  // Main price impact calculation function
  const calculatePriceImpact = useCallback(async (
    tokenIn: Token,
    tokenOut: Token,
    amountIn: string,
    amountOut: string,
    path: string[]
  ): Promise<PriceImpactResult> => {
    // Create cache key
    const cacheKey = `${tokenIn.address}-${tokenOut.address}-${amountIn}-${amountOut}`;
    
    // Check if we have a recent calculation
    const cached = priceImpactCacheRef.current[cacheKey];
    if (cached && cached.isCalculated) {
      return cached;
    }

    // Validate inputs
    if (!amountIn || !amountOut || parseFloat(amountIn) <= 0 || parseFloat(amountOut) <= 0) {
      const result: PriceImpactResult = {
        priceImpact: 0,
        expectedRate: 0,
        actualRate: 0,
        isHighImpact: false,
        isCalculated: false,
        error: 'Invalid amounts'
      };
      return result;
    }

    setIsCalculating(true);

    try {
      // Convert amounts to wei
      const amountInWei = BigInt(parseFloat(amountIn) * Math.pow(10, tokenIn.decimals)).toString();
      const amountOutWei = BigInt(parseFloat(amountOut) * Math.pow(10, tokenOut.decimals)).toString();

      let totalPriceImpact = 0;

      if (path.length === 2) {
        // Direct pair
        totalPriceImpact = await calculatePriceImpactForPair(
          path[0],
          path[1],
          amountInWei,
          amountOutWei
        );
      } else if (path.length === 3) {
        // Multi-hop through WLOOP
        // For multi-hop, we need to calculate impact for each hop
        // This is a simplified calculation - in practice, you'd need the intermediate amounts
        
        // Calculate impact for first hop (approximate)
        const firstHopImpact = await calculatePriceImpactForPair(
          path[0],
          path[1],
          amountInWei,
          (BigInt(amountInWei) * BigInt(95) / BigInt(100)).toString() // Assume 5% for intermediate
        );

        // Calculate impact for second hop (approximate)
        const secondHopImpact = await calculatePriceImpactForPair(
          path[1],
          path[2],
          (BigInt(amountInWei) * BigInt(95) / BigInt(100)).toString(),
          amountOutWei
        );

        // Combine impacts (not simply additive, but this is a reasonable approximation)
        totalPriceImpact = firstHopImpact + secondHopImpact;
      }

      // Calculate rates for display
      const actualRate = parseFloat(amountOut) / parseFloat(amountIn);
      const expectedRate = actualRate * (1 + totalPriceImpact / 100); // Approximate

      const result: PriceImpactResult = {
        priceImpact: totalPriceImpact,
        expectedRate,
        actualRate,
        isHighImpact: totalPriceImpact >= HIGH_IMPACT_THRESHOLD,
        isCalculated: true
      };

      // Cache the result
      priceImpactCacheRef.current[cacheKey] = result;

      return result;
    } catch (error: any) {
      console.error('Error calculating price impact:', error);
      
      const result: PriceImpactResult = {
        priceImpact: 0,
        expectedRate: 0,
        actualRate: 0,
        isHighImpact: false,
        isCalculated: false,
        error: error.message || 'Failed to calculate price impact'
      };

      return result;
    } finally {
      setIsCalculating(false);
    }
  }, [calculatePriceImpactForPair]);

  // Get cached price impact
  const getCachedPriceImpact = useCallback((tokenInAddress: string, tokenOutAddress: string): PriceImpactResult | null => {
    const cacheKey = `${tokenInAddress}-${tokenOutAddress}`;
    return priceImpactCacheRef.current[cacheKey] || null;
  }, []);

  // Clear cache
  const clearCache = useCallback(() => {
    reservesCacheRef.current = {};
    priceImpactCacheRef.current = {};
  }, []);

  return {
    calculatePriceImpact,
    getCachedPriceImpact,
    clearCache,
    isCalculating
  };
};