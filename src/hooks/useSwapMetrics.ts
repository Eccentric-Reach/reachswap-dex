import { useState, useCallback, useRef } from 'react';
import { Token } from '../types';
import { SPHYNX_CONTRACTS } from '../constants/sphynx';
import { REACHSWAP_CONTRACTS } from '../constants/reachswap';
import { useOptimizedMulticall } from './useOptimizedMulticall';
import { useUniversalRouter } from './useUniversalRouter';
import { usePriceImpactCalculation } from './usePriceImpactCalculation';
import { useTokenFeeDetection } from './useTokenFeeDetection';

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
  isPriceImpactCalculated: boolean;
  priceImpactError?: string;
  // Enhanced properties
  routerAddress: string;
  routerPriority: number;
  liquidityInfo?: {
    reserve0: string;
    reserve1: string;
    pairAddress: string;
    totalLiquidity: string;
  };
  feeStructure: {
    swapFee: string;
    protocolFee: string;
    lpFee: string;
  };
  performance: {
    gasEstimate: string;
    estimatedTime: string;
    reliability: 'high' | 'medium' | 'low';
  };
  executionDetails?: {
    totalFees: string;
    priceImpactWarning: boolean;
    slippageRecommendation: number;
  };
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
  isPriceImpactCalculated: boolean;
  priceImpactError?: string;
  routerAddress: string;
  routerPriority: number;
  liquidityInfo?: {
    reserve0: string;
    reserve1: string;
    pairAddress: string;
    totalLiquidity: string;
  };
  feeStructure: {
    swapFee: string;
    protocolFee: string;
    lpFee: string;
  };
  performance: {
    gasEstimate: string;
    estimatedTime: string;
    reliability: 'high' | 'medium' | 'low';
  };
  executionDetails?: {
    totalFees: string;
    priceImpactWarning: boolean;
    slippageRecommendation: number;
  };
}

interface UseSwapMetricsReturn {
  calculateSwapMetrics: (
    tokenIn: Token,
    tokenOut: Token,
    amountIn: string,
    slippage: number
  ) => Promise<SwapMetrics>;
  compareRouters: (
    tokenIn: Token,
    tokenOut: Token,
    amountIn: string
  ) => Promise<{
    reachSwapQuote: SwapQuote | null;
    sphynxQuote: SwapQuote | null;
    recommendedRouter: 'reachswap' | 'sphynx';
    reason: string;
  }>;
  isCalculating: boolean;
  metricsError: string | null;
  clearError: () => void;
}

export const useSwapMetrics = (): UseSwapMetricsReturn => {
  const [isCalculating, setIsCalculating] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const { batchCall } = useOptimizedMulticall();
  const { getRouterForPair } = useUniversalRouter();
  const { calculatePriceImpact, clearCache: clearPriceImpactCache } = usePriceImpactCalculation();
  const { detectTokenFees } = useTokenFeeDetection();
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

  // Enhanced pair existence check with liquidity info
  const checkPairExistsWithLiquidity = useCallback(async (
    factoryAddress: string,
    tokenA: string,
    tokenB: string
  ): Promise<{
    exists: boolean;
    pairAddress?: string;
    reserves?: { reserve0: string; reserve1: string };
    totalLiquidity?: string;
  }> => {
    try {
      const provider = getProvider();
      if (!provider) return { exists: false };

      const getPairSignature = '0xe6a43905';
      const token0 = tokenA.toLowerCase() < tokenB.toLowerCase() ? tokenA : tokenB;
      const token1 = tokenA.toLowerCase() < tokenB.toLowerCase() ? tokenB : tokenA;
      const paddedToken0 = token0.slice(2).padStart(64, '0');
      const paddedToken1 = token1.slice(2).padStart(64, '0');
      const data = getPairSignature + paddedToken0 + paddedToken1;

      const result = await Promise.race([
        provider.request({
          method: 'eth_call',
          params: [{
            to: factoryAddress,
            data: data
          }, 'latest']
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 3000)
        )
      ]);

      if (!result || result === '0x' || result === '0x0000000000000000000000000000000000000000000000000000000000000000') {
        return { exists: false };
      }

      const pairAddress = '0x' + result.slice(-40);
      
      // Get reserves and total supply
      try {
        const [reservesResult, totalSupplyResult] = await Promise.all([
          provider.request({
            method: 'eth_call',
            params: [{
              to: pairAddress,
              data: '0x0902f1ac'
            }, 'latest']
          }),
          provider.request({
            method: 'eth_call',
            params: [{
              to: pairAddress,
              data: '0x18160ddd'
            }, 'latest']
          })
        ]);

        const reservesData = reservesResult.slice(2);
        const reserve0 = BigInt('0x' + reservesData.slice(0, 64)).toString();
        const reserve1 = BigInt('0x' + reservesData.slice(64, 128)).toString();
        const totalSupply = BigInt(totalSupplyResult).toString();

        const totalLiquidity = (BigInt(reserve0) * BigInt(reserve1)).toString();

        return {
          exists: true,
          pairAddress,
          reserves: { reserve0, reserve1 },
          totalLiquidity
        };
      } catch (reserveError) {
        return {
          exists: true,
          pairAddress
        };
      }
    } catch (error) {
      console.error(`Error checking enhanced pair existence:`, error);
      return { exists: false };
    }
  }, [getProvider]);

  // Enhanced amounts calculation
  const getAmountsOut = useCallback(async (
    routerAddress: string,
    amountIn: string,
    path: string[]
  ): Promise<string[]> => {
    try {
      const provider = getProvider();
      if (!provider) throw new Error('No provider available');

      const getAmountsOutSignature = '0xd06ca61f';
      const paddedAmountIn = BigInt(amountIn).toString(16).padStart(64, '0');
      const pathOffset = '0000000000000000000000000000000000000000000000000000000000000040';
      const pathLength = path.length.toString(16).padStart(64, '0');
      const pathData = path.map(addr => addr.slice(2).padStart(64, '0')).join('');
      const data = getAmountsOutSignature + paddedAmountIn + pathOffset + pathLength + pathData;

      const result = await Promise.race([
        provider.request({
          method: 'eth_call',
          params: [{
            to: routerAddress,
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
      console.error('Error getting amounts out:', error);
      throw error;
    }
  }, [getProvider]);

  // Enhanced quote calculation
  const getQuote = useCallback(async (
    tokenIn: Token,
    tokenOut: Token,
    amountIn: string,
    routerType: 'reachswap' | 'sphynx'
  ): Promise<SwapQuote> => {
    try {
      const tokenAAddr = tokenIn.address === '0x0000000000000000000000000000000000000000' 
        ? REACHSWAP_CONTRACTS.WLOOP 
        : tokenIn.address;
      const tokenBAddr = tokenOut.address === '0x0000000000000000000000000000000000000000' 
        ? REACHSWAP_CONTRACTS.WLOOP 
        : tokenOut.address;

      const path = [tokenAAddr, tokenBAddr];
      const routerAddress = routerType === 'reachswap' 
        ? REACHSWAP_CONTRACTS.ROUTER 
        : SPHYNX_CONTRACTS.ROUTER;
      const factoryAddress = routerType === 'reachswap' 
        ? REACHSWAP_CONTRACTS.FACTORY 
        : SPHYNX_CONTRACTS.FACTORY;

      // Check if pair exists with enhanced info
      const pairInfo = await checkPairExistsWithLiquidity(factoryAddress, tokenAAddr, tokenBAddr);
      
      if (!pairInfo.exists) {
        return {
          amountOut: '0',
          path,
          priceImpact: 0,
          gasEstimate: routerType === 'reachswap' ? '0.001' : '0.002',
          router: routerType,
          liquidityAvailable: false,
          isPriceImpactCalculated: false,
          routerAddress,
          routerPriority: routerType === 'reachswap' ? 1 : 2,
          feeStructure: {
            swapFee: routerType === 'reachswap' ? '0.25%' : '0.30%',
            protocolFee: '0.00%',
            lpFee: routerType === 'reachswap' ? '0.25%' : '0.30%'
          },
          performance: {
            gasEstimate: routerType === 'reachswap' ? '0.001' : '0.002',
            estimatedTime: routerType === 'reachswap' ? '3' : '4',
            reliability: 'low'
          }
        };
      }

      const amountInWei = BigInt(parseFloat(amountIn) * Math.pow(10, tokenIn.decimals)).toString();
      
      // Get amounts out
      const amounts = await getAmountsOut(routerAddress, amountInWei, path);
      const amountOut = amounts[amounts.length - 1];
      const amountOutFormatted = (parseFloat(amountOut) / Math.pow(10, tokenOut.decimals)).toFixed(6);

      // Detect token fees for strategy determination
      const [tokenInFees, tokenOutFees] = await Promise.all([
        detectTokenFees(tokenIn.address),
        detectTokenFees(tokenOut.address)
      ]);

      const hasFeeOnTransfer = tokenInFees.hasTransferFee || tokenOutFees.hasTransferFee;
      const swapStrategy: 'exactInput' | 'exactOutput' | 'supportingFee' = hasFeeOnTransfer ? 'supportingFee' : 'exactInput';

      // Calculate enhanced price impact
      let priceImpactResult;
      let isPriceImpactCalculated = false;
      let priceImpactError: string | undefined;

      try {
        priceImpactResult = await calculatePriceImpact(
          tokenIn,
          tokenOut,
          amountIn,
          amountOutFormatted,
          path
        );
        isPriceImpactCalculated = priceImpactResult.isCalculated;
        priceImpactError = priceImpactResult.error;
      } catch (error: any) {
        console.error('Error calculating price impact:', error);
        priceImpactResult = {
          priceImpact: 0.1,
          isHighImpact: false,
          isCalculated: false
        };
        priceImpactError = error.message;
      }

      // Calculate execution details
      const feeRate = routerType === 'reachswap' ? 0.25 : 0.30;
      const totalFees = (parseFloat(amountIn) * feeRate / 100).toFixed(6);
      const priceImpactWarning = priceImpactResult.priceImpact > 5;
      const slippageRecommendation = priceImpactWarning ? 8 : (hasFeeOnTransfer ? 5 : 1);

      return {
        amountOut: amountOutFormatted,
        path,
        priceImpact: priceImpactResult.priceImpact,
        gasEstimate: routerType === 'reachswap' ? '0.001' : '0.002',
        router: routerType,
        liquidityAvailable: true,
        recommendedSlippage: slippageRecommendation,
        swapStrategy,
        isPriceImpactCalculated,
        priceImpactError,
        routerAddress,
        routerPriority: routerType === 'reachswap' ? 1 : 2,
        liquidityInfo: pairInfo.reserves ? {
          reserve0: pairInfo.reserves.reserve0,
          reserve1: pairInfo.reserves.reserve1,
          pairAddress: pairInfo.pairAddress!,
          totalLiquidity: pairInfo.totalLiquidity || '0'
        } : undefined,
        feeStructure: {
          swapFee: routerType === 'reachswap' ? '0.25%' : '0.30%',
          protocolFee: '0.00%',
          lpFee: routerType === 'reachswap' ? '0.25%' : '0.30%'
        },
        performance: {
          gasEstimate: routerType === 'reachswap' ? '0.001' : '0.002',
          estimatedTime: routerType === 'reachswap' ? '3' : '4',
          reliability: 'high'
        },
        executionDetails: {
          totalFees,
          priceImpactWarning,
          slippageRecommendation
        }
      };
    } catch (error) {
      console.error(`Error getting ${routerType} quote:`, error);
      return {
        amountOut: '0',
        path: [tokenIn.address, tokenOut.address],
        priceImpact: 0,
        gasEstimate: routerType === 'reachswap' ? '0.001' : '0.002',
        router: routerType,
        liquidityAvailable: false,
        isPriceImpactCalculated: false,
        routerAddress: routerType === 'reachswap' ? REACHSWAP_CONTRACTS.ROUTER : SPHYNX_CONTRACTS.ROUTER,
        routerPriority: routerType === 'reachswap' ? 1 : 2,
        feeStructure: {
          swapFee: routerType === 'reachswap' ? '0.25%' : '0.30%',
          protocolFee: '0.00%',
          lpFee: routerType === 'reachswap' ? '0.25%' : '0.30%'
        },
        performance: {
          gasEstimate: routerType === 'reachswap' ? '0.001' : '0.002',
          estimatedTime: '0',
          reliability: 'low'
        }
      };
    }
  }, [checkPairExistsWithLiquidity, getAmountsOut, detectTokenFees, calculatePriceImpact]);

  // Compare routers and recommend the best one
  const compareRouters = useCallback(async (
    tokenIn: Token,
    tokenOut: Token,
    amountIn: string
  ): Promise<{
    reachSwapQuote: SwapQuote | null;
    sphynxQuote: SwapQuote | null;
    recommendedRouter: 'reachswap' | 'sphynx';
    reason: string;
  }> => {
    try {
      // Get quotes from both routers in parallel
      const [reachSwapQuote, sphynxQuote] = await Promise.allSettled([
        getQuote(tokenIn, tokenOut, amountIn, 'reachswap'),
        getQuote(tokenIn, tokenOut, amountIn, 'sphynx')
      ]);

      const reachSwapResult = reachSwapQuote.status === 'fulfilled' && reachSwapQuote.value.liquidityAvailable 
        ? reachSwapQuote.value 
        : null;
      const sphynxResult = sphynxQuote.status === 'fulfilled' && sphynxQuote.value.liquidityAvailable 
        ? sphynxQuote.value 
        : null;

      // Determine recommendation with ReachSwap priority
      let recommendedRouter: 'reachswap' | 'sphynx' = 'reachswap';
      let reason = 'ReachSwap is the native DEX with lower fees';

      if (!reachSwapResult && sphynxResult) {
        recommendedRouter = 'sphynx';
        reason = 'Only Sphynx has liquidity for this pair';
      } else if (reachSwapResult && sphynxResult) {
        const reachSwapOutput = parseFloat(reachSwapResult.amountOut);
        const sphynxOutput = parseFloat(sphynxResult.amountOut);
        
        // ReachSwap gets priority unless Sphynx is significantly better (>2% difference)
        if (sphynxOutput > reachSwapOutput * 1.02) {
          recommendedRouter = 'sphynx';
          reason = `Sphynx offers ${((sphynxOutput - reachSwapOutput) / reachSwapOutput * 100).toFixed(2)}% better rate`;
        } else {
          reason = reachSwapOutput >= sphynxOutput 
            ? `ReachSwap offers ${((reachSwapOutput - sphynxOutput) / sphynxOutput * 100).toFixed(2)}% better rate with lower fees`
            : 'ReachSwap native DEX with lower fees (0.25% vs 0.30%)';
        }
      } else if (!reachSwapResult && !sphynxResult) {
        reason = 'No liquidity available on either router';
      }

      return {
        reachSwapQuote: reachSwapResult,
        sphynxQuote: sphynxResult,
        recommendedRouter,
        reason
      };
    } catch (error: any) {
      console.error('Error comparing routers:', error);
      return {
        reachSwapQuote: null,
        sphynxQuote: null,
        recommendedRouter: 'reachswap',
        reason: 'Error occurred during comparison'
      };
    }
  }, [getQuote]);

  // Main swap metrics calculation
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
      // Compare routers and get the best quote
      const comparison = await compareRouters(tokenIn, tokenOut, amountIn);

      if (signal.aborted) {
        throw new Error('Calculation cancelled');
      }

      const bestQuote = comparison.recommendedRouter === 'reachswap' 
        ? comparison.reachSwapQuote 
        : comparison.sphynxQuote;

      if (!bestQuote || !bestQuote.liquidityAvailable) {
        throw new Error('No liquidity available for this pair');
      }

      // Calculate exchange rate
      const exchangeRate = (parseFloat(bestQuote.amountOut) / parseFloat(amountIn)).toFixed(6);

      // Use recommended slippage if higher than user setting
      const effectiveSlippage = bestQuote.recommendedSlippage && bestQuote.recommendedSlippage > slippage 
        ? bestQuote.recommendedSlippage 
        : slippage;

      // Calculate minimum received
      let minimumReceived = parseFloat(bestQuote.amountOut);
      
      // Apply slippage
      minimumReceived *= (1 - effectiveSlippage / 100);

      // For fee-on-transfer tokens using supporting functions, set minimum to 0
      if (bestQuote.swapStrategy === 'supportingFee') {
        minimumReceived = 0;
      }

      const metrics: SwapMetrics = {
        exchangeRate,
        priceImpact: bestQuote.priceImpact,
        minimumReceived: minimumReceived.toFixed(6),
        slippageTolerance: effectiveSlippage,
        routerUsed: bestQuote.router,
        estimatedGas: bestQuote.gasEstimate,
        hasFeeOnTransfer: bestQuote.swapStrategy === 'supportingFee',
        path: bestQuote.path,
        amountOut: bestQuote.amountOut,
        liquidityAvailable: bestQuote.liquidityAvailable,
        recommendedSlippage: bestQuote.recommendedSlippage,
        swapStrategy: bestQuote.swapStrategy,
        isPriceImpactCalculated: bestQuote.isPriceImpactCalculated,
        priceImpactError: bestQuote.priceImpactError,
        routerAddress: bestQuote.routerAddress,
        routerPriority: bestQuote.routerPriority,
        liquidityInfo: bestQuote.liquidityInfo,
        feeStructure: bestQuote.feeStructure,
        performance: bestQuote.performance,
        executionDetails: bestQuote.executionDetails
      };

      console.log('📊 Calculated swap metrics:', metrics);
      return metrics;
    } catch (error: any) {
      if (signal.aborted) {
        throw new Error('Calculation cancelled');
      }
      
      console.error('Error calculating swap metrics:', error);
      
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
  }, [compareRouters]);

  const clearError = useCallback(() => {
    setMetricsError(null);
    clearPriceImpactCache();
  }, [clearPriceImpactCache]);

  return {
    calculateSwapMetrics,
    compareRouters,
    isCalculating,
    metricsError,
    clearError
  };
};