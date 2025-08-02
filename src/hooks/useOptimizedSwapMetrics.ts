import { useState, useCallback, useRef } from 'react';
import { Token } from '../types';
import { SPHYNX_CONTRACTS } from '../constants/sphynx';
import { REACHSWAP_CONTRACTS, REACHSWAP_ROUTER_ABI } from '../constants/reachswap';
import { useOptimizedMulticall } from './useOptimizedMulticall';
import { useUniversalRouter } from './useUniversalRouter';
import { usePriceImpactCalculation } from './usePriceImpactCalculation';

interface SwapMetrics {
  exchangeRate: string;
  priceImpact: number;
  minimumReceived: string;
  slippageTolerance: number;
  routerUsed: 'sphynx' | 'reachswap';
  estimatedGas: string;
  hasFeeOnTransfer: boolean;
  path: string[];
  amountOut: string;
  liquidityAvailable: boolean;
  recommendedSlippage?: number;
  swapStrategy?: 'exactInput' | 'exactOutput' | 'supportingFee';
  // FIXED: Add price impact calculation state
  isPriceImpactCalculated: boolean;
  priceImpactError?: string;
}

interface SwapQuote {
  amountOut: string;
  path: string[];
  priceImpact: number;
  gasEstimate: string;
  router: 'sphynx' | 'reachswap';
  liquidityAvailable: boolean;
  recommendedSlippage?: number;
  swapStrategy?: 'exactInput' | 'exactOutput' | 'supportingFee';
  // FIXED: Add price impact calculation state
  isPriceImpactCalculated: boolean;
  priceImpactError?: string;
}

interface UseOptimizedSwapMetricsReturn {
  calculateSwapMetrics: (
    tokenIn: Token,
    tokenOut: Token,
    amountIn: string,
    slippage: number
  ) => Promise<SwapMetrics>;
  isCalculating: boolean;
  metricsError: string | null;
  clearError: () => void;
}

export const useOptimizedSwapMetrics = (): UseOptimizedSwapMetricsReturn => {
  const [isCalculating, setIsCalculating] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const { batchCall } = useOptimizedMulticall();
  const { getRouterForPair } = useUniversalRouter();
  const { calculatePriceImpact, clearCache: clearPriceImpactCache } = usePriceImpactCalculation();
  const abortControllerRef = useRef<AbortController | null>(null);

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

  // Fast Sphynx amounts out calculation
  const getSphynxAmountsOut = useCallback(async (
    amountIn: string,
    path: string[]
  ): Promise<string[]> => {
    try {
      const provider = getProvider();
      if (!provider) throw new Error('No provider available');

      const getAmountsOutSignature = '0xd06ca61f'; // getAmountsOut(uint256,address[])
      const paddedAmountIn = BigInt(amountIn).toString(16).padStart(64, '0');
      const pathOffset = '0000000000000000000000000000000000000000000000000000000000000040';
      const pathLength = path.length.toString(16).padStart(64, '0');
      const pathData = path.map(addr => addr.slice(2).padStart(64, '0')).join('');
      const data = getAmountsOutSignature + paddedAmountIn + pathOffset + pathLength + pathData;

      const result = await Promise.race([
        provider.request({
          method: 'eth_call',
          params: [{
            to: SPHYNX_CONTRACTS.ROUTER,
            data: data
          }, 'latest']
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 3000)
        )
      ]);

      if (!result || result === '0x') {
        throw new Error('No result from getAmountsOut');
      }

      // Decode the result
      const dataWithoutPrefix = result.slice(2);
      const arrayOffset = parseInt(dataWithoutPrefix.slice(0, 64), 16) * 2;
      const arrayLength = parseInt(dataWithoutPrefix.slice(arrayOffset, arrayOffset + 64), 16);
      const amounts: string[] = [];

      for (let i = 0; i < arrayLength; i++) {
        const start = arrayOffset + 64 + (i * 64);
        const end = start + 64;
        const amountHex = dataWithoutPrefix.slice(start, end);
        amounts.push(BigInt('0x' + amountHex).toString());
      }

      return amounts;
    } catch (error: any) {
      console.error('Error getting Sphynx amounts out:', error);
      throw error;
    }
  }, [getProvider]);

  // Get optimized Sphynx quote with accurate price impact
  const getSphynxQuote = useCallback(async (
    tokenIn: Token,
    tokenOut: Token,
    amountIn: string,
    routerInfo: any
  ): Promise<SwapQuote> => {
    try {
      if (!routerInfo.pairExists) {
        return {
          amountOut: '0',
          path: routerInfo.path || [],
          priceImpact: 0,
          gasEstimate: '0.002',
          router: 'sphynx',
          liquidityAvailable: false,
          recommendedSlippage: 1,
          swapStrategy: 'exactInput',
          isPriceImpactCalculated: false
        };
      }

      const amountInWei = BigInt(parseFloat(amountIn) * Math.pow(10, tokenIn.decimals)).toString();
      
      // Get amounts out with timeout
      const amounts = await getSphynxAmountsOut(amountInWei, routerInfo.path);
      const amountOut = amounts[amounts.length - 1];
      const amountOutFormatted = (parseFloat(amountOut) / Math.pow(10, tokenOut.decimals)).toFixed(6);

      // FIXED: Calculate accurate price impact using real reserves
      let priceImpactResult;
      let isPriceImpactCalculated = false;
      let priceImpactError: string | undefined;

      try {
        priceImpactResult = await calculatePriceImpact(
          tokenIn,
          tokenOut,
          amountIn,
          amountOutFormatted,
          routerInfo.path
        );
        isPriceImpactCalculated = priceImpactResult.isCalculated;
        priceImpactError = priceImpactResult.error;
      } catch (error: any) {
        console.error('Error calculating price impact:', error);
        priceImpactResult = {
          priceImpact: 0.1, // Fallback
          isHighImpact: false,
          isCalculated: false
        };
        priceImpactError = error.message;
      }

      return {
        amountOut: amountOutFormatted,
        path: routerInfo.path,
        priceImpact: priceImpactResult.priceImpact,
        gasEstimate: '0.002',
        router: 'sphynx',
        liquidityAvailable: true,
        recommendedSlippage: priceImpactResult.isHighImpact ? 8 : 1,
        swapStrategy: 'exactInput',
        isPriceImpactCalculated,
        priceImpactError
      };
    } catch (error) {
      console.error('Error getting Sphynx quote:', error);
      return {
        amountOut: '0',
        path: routerInfo.path || [],
        priceImpact: 0,
        gasEstimate: '0.002',
        router: 'sphynx',
        liquidityAvailable: false,
        recommendedSlippage: 1,
        swapStrategy: 'exactInput',
        isPriceImpactCalculated: false,
        priceImpactError: 'Failed to get quote'
      };
    }
  }, [getSphynxAmountsOut, calculatePriceImpact]);

  // Get ReachSwap quote (mock implementation)
  const getReachSwapQuote = useCallback(async (
    tokenIn: Token,
    tokenOut: Token,
    amountIn: string,
    routerInfo: any
  ): Promise<SwapQuote> => {
    try {
      if (!routerInfo.pairExists) {
        return {
          amountOut: '0',
          path: routerInfo.path || [],
          priceImpact: 0,
          gasEstimate: '0.001',
          router: 'reachswap',
          liquidityAvailable: false,
          recommendedSlippage: 1,
          swapStrategy: 'exactInput',
          isPriceImpactCalculated: false
        };
      }

      // REAL ReachSwap calculation using deployed contracts
      const amountInWei = BigInt(parseFloat(amountIn) * Math.pow(10, tokenIn.decimals)).toString();
      
      // Get amounts out from ReachSwap router
      const amounts = await getReachSwapAmountsOut(amountInWei, routerInfo.path);
      const amountOut = amounts[amounts.length - 1];
      const amountOutFormatted = (parseFloat(amountOut) / Math.pow(10, tokenOut.decimals)).toFixed(6);

      // Calculate price impact using real reserves
      let priceImpactResult;
      let isPriceImpactCalculated = false;
      let priceImpactError: string | undefined;

      try {
        priceImpactResult = await calculatePriceImpact(
          tokenIn,
          tokenOut,
          amountIn,
          amountOutFormatted,
          routerInfo.path
        );
        isPriceImpactCalculated = priceImpactResult.isCalculated;
        priceImpactError = priceImpactResult.error;
      } catch (error: any) {
        console.error('Error calculating ReachSwap price impact:', error);
        priceImpactResult = {
          priceImpact: 0.1, // Fallback
          isHighImpact: false,
          isCalculated: false
        };
        priceImpactError = error.message;
      }
      
      return {
        amountOut: amountOutFormatted,
        path: routerInfo.path,
        priceImpact: priceImpactResult.priceImpact,
        gasEstimate: '0.001',
        router: 'reachswap',
        liquidityAvailable: true,
        recommendedSlippage: priceImpactResult.isHighImpact ? 5 : 1,
        swapStrategy: 'exactInput',
        isPriceImpactCalculated,
        priceImpactError
      };
    } catch (error) {
      console.error('Error getting ReachSwap quote:', error);
      return {
        amountOut: '0',
        path: routerInfo.path || [],
        priceImpact: 0,
        gasEstimate: '0.001',
        router: 'reachswap',
        liquidityAvailable: false,
        recommendedSlippage: 1,
        swapStrategy: 'exactInput',
        isPriceImpactCalculated: false
      };
    }
  }, []);

  // Get ReachSwap amounts out calculation
  const getReachSwapAmountsOut = useCallback(async (
    amountIn: string,
    path: string[]
  ): Promise<string[]> => {
    try {
      const provider = getProvider();
      if (!provider) throw new Error('No provider available');

      const getAmountsOutSignature = '0xd06ca61f'; // getAmountsOut(uint256,address[])
      const paddedAmountIn = BigInt(amountIn).toString(16).padStart(64, '0');
      const pathOffset = '0000000000000000000000000000000000000000000000000000000000000040';
      const pathLength = path.length.toString(16).padStart(64, '0');
      const pathData = path.map(addr => addr.slice(2).padStart(64, '0')).join('');
      const data = getAmountsOutSignature + paddedAmountIn + pathOffset + pathLength + pathData;

      const result = await Promise.race([
        provider.request({
          method: 'eth_call',
          params: [{
            to: REACHSWAP_CONTRACTS.ROUTER,
            data: data
          }, 'latest']
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 3000)
        )
      ]);

      if (!result || result === '0x') {
        throw new Error('No result from ReachSwap getAmountsOut');
      }

      // Decode the result
      const dataWithoutPrefix = result.slice(2);
      const arrayOffset = parseInt(dataWithoutPrefix.slice(0, 64), 16) * 2;
      const arrayLength = parseInt(dataWithoutPrefix.slice(arrayOffset, arrayOffset + 64), 16);
      const amounts: string[] = [];

      for (let i = 0; i < arrayLength; i++) {
        const start = arrayOffset + 64 + (i * 64);
        const end = start + 64;
        const amountHex = dataWithoutPrefix.slice(start, end);
        amounts.push(BigInt('0x' + amountHex).toString());
      }

      return amounts;
    } catch (error: any) {
      console.error('Error getting ReachSwap amounts out:', error);
      throw error;
    }
  }, [getProvider]);

  // Main optimized swap metrics calculation
  const calculateSwapMetrics = useCallback(async (
    tokenIn: Token,
    tokenOut: Token,
    amountIn: string,
    slippage: number
  ): Promise<SwapMetrics> => {
    // Cancel any existing calculation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setIsCalculating(true);
    setMetricsError(null);

    try {
      // Fast router detection
      const routerInfo = await getRouterForPair(tokenIn, tokenOut);

      if (signal.aborted) {
        throw new Error('Calculation cancelled');
      }

      if (!routerInfo.pairExists) {
        throw new Error('No liquidity available for this pair');
      }

      // Get quote from optimal router
      let quote: SwapQuote;
      
      if (routerInfo.router === 'sphynx') {
        quote = await getSphynxQuote(tokenIn, tokenOut, amountIn, routerInfo);
      } else {
        quote = await getReachSwapQuote(tokenIn, tokenOut, amountIn, routerInfo);
      }

      if (signal.aborted) {
        throw new Error('Calculation cancelled');
      }

      if (!quote.liquidityAvailable) {
        throw new Error('No liquidity available for this pair');
      }

      // Calculate exchange rate
      const exchangeRate = (parseFloat(quote.amountOut) / parseFloat(amountIn)).toFixed(6);

      // Use recommended slippage if higher than user setting
      const effectiveSlippage = quote.recommendedSlippage && quote.recommendedSlippage > slippage 
        ? quote.recommendedSlippage 
        : slippage;

      // Calculate minimum received
      const minimumReceived = parseFloat(quote.amountOut) * (1 - effectiveSlippage / 100);

      const metrics: SwapMetrics = {
        exchangeRate,
        priceImpact: quote.priceImpact,
        minimumReceived: minimumReceived.toFixed(6),
        slippageTolerance: effectiveSlippage,
        routerUsed: quote.router,
        estimatedGas: quote.gasEstimate,
        hasFeeOnTransfer: false, // Simplified for performance
        path: quote.path,
        amountOut: quote.amountOut,
        liquidityAvailable: quote.liquidityAvailable,
        recommendedSlippage: quote.recommendedSlippage,
        swapStrategy: quote.swapStrategy,
        // FIXED: Include price impact calculation state
        isPriceImpactCalculated: quote.isPriceImpactCalculated,
        priceImpactError: quote.priceImpactError
      };

      return metrics;
    } catch (error: any) {
      if (signal.aborted) {
        // Calculation was intentionally cancelled by a newer request
        // Don't log this as an error or set error state
        throw new Error('Calculation cancelled');
      }
      
      console.error('Error calculating swap metrics:', error);
      
      // Provide user-friendly error messages
      let errorMessage = 'Unable to calculate swap metrics';
      if (error.message.includes('No liquidity')) {
        errorMessage = 'No liquidity available for this trading pair';
      } else if (error.message.includes('timeout')) {
        errorMessage = 'Request timed out, please try again';
      }
      
      setMetricsError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsCalculating(false);
    }
  }, [getRouterForPair, getSphynxQuote, getReachSwapQuote]);

  const clearError = useCallback(() => {
    setMetricsError(null);
    clearPriceImpactCache();
  }, [clearPriceImpactCache]);

  return {
    calculateSwapMetrics,
    isCalculating,
    metricsError,
    clearError
  };
};