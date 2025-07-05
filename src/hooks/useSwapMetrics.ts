import { useState, useCallback } from 'react';
import { Token } from '../types';
import { SPHYNX_CONTRACTS, SPHYNX_ROUTER_ABI, SPHYNX_FACTORY_ABI, SPHYNX_PAIR_ABI, SPHYNX_FEES } from '../constants/sphynx';
import { useTokenFeeDetection } from './useTokenFeeDetection';
import { useUniversalRouter } from './useUniversalRouter';

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
}

interface UseSwapMetricsReturn {
  calculateSwapMetrics: (
    tokenIn: Token,
    tokenOut: Token,
    amountIn: string,
    slippage: number
  ) => Promise<SwapMetrics>;
  getOptimalRoute: (
    tokenIn: Token,
    tokenOut: Token,
    amountIn: string
  ) => Promise<SwapQuote>;
  isCalculating: boolean;
  metricsError: string | null;
}

export const useSwapMetrics = (): UseSwapMetricsReturn => {
  const [isCalculating, setIsCalculating] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const { detectTokenFees } = useTokenFeeDetection();
  const { getRouterForPair } = useUniversalRouter();

  // Get the current provider with circuit breaker handling
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

  // Enhanced fee detection for swap strategy determination
  const detectSwapStrategy = useCallback(async (tokenIn: Token, tokenOut: Token) => {
    try {
      const [tokenInFees, tokenOutFees] = await Promise.all([
        detectTokenFees(tokenIn.address),
        detectTokenFees(tokenOut.address)
      ]);

      const hasInputFees = tokenInFees.hasTransferFee;
      const hasOutputFees = tokenOutFees.hasTransferFee;
      const isHighFeeToken = (tokenInFees.buyFee || 0) > 0.03 || (tokenInFees.sellFee || 0) > 0.03 ||
                            (tokenOutFees.buyFee || 0) > 0.03 || (tokenOutFees.sellFee || 0) > 0.03;

      let strategy: 'exactInput' | 'exactOutput' | 'supportingFee' = 'exactInput';
      let recommendedSlippage = 1; // Default 1%

      if (hasInputFees || hasOutputFees) {
        strategy = 'supportingFee';
        // Higher slippage for fee-on-transfer tokens
        const maxFee = Math.max(
          tokenInFees.sellFee || 0,
          tokenInFees.buyFee || 0,
          tokenOutFees.sellFee || 0,
          tokenOutFees.buyFee || 0
        );
        recommendedSlippage = Math.max(5, maxFee * 100 + 3); // Fee% + 3% buffer, minimum 5%
      } else if (isHighFeeToken) {
        strategy = 'exactOutput'; // Use exact output for high fee tokens to avoid K errors
        recommendedSlippage = 3; // Higher slippage for high fee tokens
      }

      return {
        strategy,
        recommendedSlippage,
        hasInputFees,
        hasOutputFees,
        isHighFeeToken
      };
    } catch (error) {
      console.error('Error detecting swap strategy:', error);
      return {
        strategy: 'exactInput' as const,
        recommendedSlippage: 1,
        hasInputFees: false,
        hasOutputFees: false,
        isHighFeeToken: false
      };
    }
  }, [detectTokenFees]);

  // Get amounts out from Sphynx router with enhanced error handling
  const getSphynxAmountsOut = useCallback(async (
    amountIn: string,
    path: string[],
    retryCount: number = 0
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

      const result = await provider.request({
        method: 'eth_call',
        params: [{
          to: SPHYNX_CONTRACTS.ROUTER,
          data: data
        }, 'latest']
      });

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
      // Handle circuit breaker and rate limit errors with retry
      if (error.message && (
        error.message.includes('circuit breaker') ||
        error.message.includes('rate limit') ||
        error.message.includes('too many requests')
      ) && retryCount < 2) {
        console.log(`Retrying Sphynx quote (attempt ${retryCount + 1}/2)`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
        return getSphynxAmountsOut(amountIn, path, retryCount + 1);
      }
      
      console.error('Error getting Sphynx amounts out:', error);
      throw error;
    }
  }, [getProvider]);

  // Get pair reserves for price impact calculation
  const getPairReserves = useCallback(async (
    pairAddress: string
  ): Promise<{ reserve0: string; reserve1: string; token0: string; token1: string }> => {
    try {
      const provider = getProvider();
      if (!provider) throw new Error('No provider available');

      // Get reserves
      const getReservesSignature = '0x0902f1ac'; // getReserves()
      const reservesResult = await provider.request({
        method: 'eth_call',
        params: [{
          to: pairAddress,
          data: getReservesSignature
        }, 'latest']
      });

      // Get token0
      const token0Signature = '0x0dfe1681'; // token0()
      const token0Result = await provider.request({
        method: 'eth_call',
        params: [{
          to: pairAddress,
          data: token0Signature
        }, 'latest']
      });

      // Get token1
      const token1Signature = '0xd21220a7'; // token1()
      const token1Result = await provider.request({
        method: 'eth_call',
        params: [{
          to: pairAddress,
          data: token1Signature
        }, 'latest']
      });

      // Decode reserves
      const reservesData = reservesResult.slice(2);
      const reserve0 = BigInt('0x' + reservesData.slice(0, 64)).toString();
      const reserve1 = BigInt('0x' + reservesData.slice(64, 128)).toString();

      // Decode token addresses
      const token0 = '0x' + token0Result.slice(-40);
      const token1 = '0x' + token1Result.slice(-40);

      return { reserve0, reserve1, token0, token1 };
    } catch (error) {
      console.error('Error getting pair reserves:', error);
      throw error;
    }
  }, [getProvider]);

  // Calculate price impact for Sphynx swap with fee consideration
  const calculateSphynxPriceImpact = useCallback(async (
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    path: string[],
    hasFees: boolean = false
  ): Promise<number> => {
    try {
      let totalPriceImpact = 0;

      for (let i = 0; i < path.length - 1; i++) {
        const tokenA = path[i];
        const tokenB = path[i + 1];

        // Get pair address
        const getPairSignature = '0xe6a43905';
        const token0 = tokenA.toLowerCase() < tokenB.toLowerCase() ? tokenA : tokenB;
        const token1 = tokenA.toLowerCase() < tokenB.toLowerCase() ? tokenB : tokenA;
        const paddedToken0 = token0.slice(2).padStart(64, '0');
        const paddedToken1 = token1.slice(2).padStart(64, '0');
        const data = getPairSignature + paddedToken0 + paddedToken1;

        const provider = getProvider();
        if (!provider) throw new Error('No provider available');

        const pairResult = await provider.request({
          method: 'eth_call',
          params: [{
            to: SPHYNX_CONTRACTS.FACTORY,
            data: data
          }, 'latest']
        });

        const pairAddress = '0x' + pairResult.slice(-40);
        
        // Skip if pair doesn't exist
        if (pairAddress === '0x0000000000000000000000000000000000000000') {
          continue;
        }

        // Get reserves
        const { reserve0, reserve1, token0: pairToken0 } = await getPairReserves(pairAddress);

        // Determine which reserve corresponds to which token
        const isToken0 = tokenA.toLowerCase() === pairToken0.toLowerCase();
        const reserveIn = isToken0 ? reserve0 : reserve1;
        const reserveOut = isToken0 ? reserve1 : reserve0;

        // Calculate amount in for this hop
        const amountInForHop = i === 0 ? amountIn : '1000000000000000000'; // Use 1 token for subsequent hops

        // Calculate price impact using constant product formula
        // For fee tokens, add extra buffer to price impact calculation
        const amountInBig = BigInt(amountInForHop);
        const reserveInBig = BigInt(reserveIn);
        
        let priceImpact = Number(amountInBig * BigInt(10000) / (reserveInBig + amountInBig)) / 100;
        
        // Add fee buffer for fee-on-transfer tokens
        if (hasFees) {
          priceImpact *= 1.5; // 50% buffer for fee tokens
        }
        
        totalPriceImpact += priceImpact;
      }

      return Math.min(totalPriceImpact, 99.99); // Cap at 99.99%
    } catch (error) {
      console.error('Error calculating Sphynx price impact:', error);
      return hasFees ? 5 : 0; // Return higher default for fee tokens
    }
  }, [getProvider, getPairReserves]);

  // Get Sphynx quote with enhanced fee handling
  const getSphynxQuote = useCallback(async (
    tokenIn: Token,
    tokenOut: Token,
    amountIn: string,
    routerInfo: any
  ): Promise<SwapQuote> => {
    try {
      if (!routerInfo.pairExists) {
        throw new Error('No liquidity available on Sphynx');
      }

      const amountInWei = BigInt(parseFloat(amountIn) * Math.pow(10, tokenIn.decimals)).toString();
      
      // Detect swap strategy
      const strategyInfo = await detectSwapStrategy(tokenIn, tokenOut);
      
      const amounts = await getSphynxAmountsOut(amountInWei, routerInfo.path);
      const amountOut = amounts[amounts.length - 1];
      const amountOutFormatted = (parseFloat(amountOut) / Math.pow(10, tokenOut.decimals)).toFixed(6);

      // Calculate price impact with fee consideration
      const priceImpact = await calculateSphynxPriceImpact(
        routerInfo.path[0],
        routerInfo.path[routerInfo.path.length - 1],
        amountInWei,
        routerInfo.path,
        strategyInfo.hasInputFees || strategyInfo.hasOutputFees
      );

      return {
        amountOut: amountOutFormatted,
        path: routerInfo.path,
        priceImpact,
        gasEstimate: strategyInfo.strategy === 'supportingFee' ? '0.003' : '0.002', // Higher gas for fee tokens
        router: 'sphynx',
        liquidityAvailable: true,
        recommendedSlippage: strategyInfo.recommendedSlippage,
        swapStrategy: strategyInfo.strategy
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
        swapStrategy: 'exactInput'
      };
    }
  }, [getSphynxAmountsOut, calculateSphynxPriceImpact, detectSwapStrategy]);

  // Get ReachSwap quote (mock implementation since not deployed)
  const getReachSwapQuote = useCallback(async (
    tokenIn: Token,
    tokenOut: Token,
    amountIn: string,
    routerInfo: any
  ): Promise<SwapQuote> => {
    try {
      if (!routerInfo.pairExists) {
        throw new Error('No liquidity available on ReachSwap');
      }

      // Mock calculation for ReachSwap
      const inputAmount = parseFloat(amountIn);
      const rate = (tokenIn.price || 1) / (tokenOut.price || 1);
      const output = inputAmount * rate * 0.997; // 0.3% fee
      
      return {
        amountOut: output.toFixed(6),
        path: routerInfo.path,
        priceImpact: 0.1, // Mock low price impact
        gasEstimate: '0.001', // Lower gas cost
        router: 'reachswap',
        liquidityAvailable: true,
        recommendedSlippage: 1,
        swapStrategy: 'exactInput'
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
        swapStrategy: 'exactInput'
      };
    }
  }, []);

  // Get optimal route using universal router detection with fallback logic
  const getOptimalRoute = useCallback(async (
    tokenIn: Token,
    tokenOut: Token,
    amountIn: string
  ): Promise<SwapQuote> => {
    try {
      console.log(`🔍 Finding optimal route for ${tokenIn.symbol} → ${tokenOut.symbol}`);

      // Get router information using universal detection
      const routerInfo = await getRouterForPair(tokenIn, tokenOut);
      
      if (!routerInfo.pairExists) {
        console.log(`❌ No liquidity available for ${tokenIn.symbol}/${tokenOut.symbol} on any DEX`);
        throw new Error(`No liquidity available for this pair`);
      }

      console.log(`✅ Using ${routerInfo.router.toUpperCase()} for ${tokenIn.symbol}/${tokenOut.symbol} (${routerInfo.isMultiHop ? 'multi-hop' : 'direct'})`);

      // Get quote from the selected router with fallback
      let quote: SwapQuote;
      let lastError: Error | null = null;
      
      if (routerInfo.router === 'sphynx') {
        try {
          quote = await getSphynxQuote(tokenIn, tokenOut, amountIn, routerInfo);
          
          // If Sphynx quote failed, try ReachSwap as fallback
          if (!quote.liquidityAvailable) {
            console.log('🔄 Sphynx quote failed, trying ReachSwap fallback...');
            quote = await getReachSwapQuote(tokenIn, tokenOut, amountIn, routerInfo);
          }
        } catch (error: any) {
          lastError = error;
          console.log('🔄 Sphynx quote failed, trying ReachSwap fallback...');
          quote = await getReachSwapQuote(tokenIn, tokenOut, amountIn, routerInfo);
        }
      } else {
        try {
          quote = await getReachSwapQuote(tokenIn, tokenOut, amountIn, routerInfo);
          
          // If ReachSwap quote failed, try Sphynx as fallback
          if (!quote.liquidityAvailable) {
            console.log('🔄 ReachSwap quote failed, trying Sphynx fallback...');
            quote = await getSphynxQuote(tokenIn, tokenOut, amountIn, routerInfo);
          }
        } catch (error: any) {
          lastError = error;
          console.log('🔄 ReachSwap quote failed, trying Sphynx fallback...');
          quote = await getSphynxQuote(tokenIn, tokenOut, amountIn, routerInfo);
        }
      }

      // If both failed, throw the last error with better messaging
      if (!quote.liquidityAvailable && lastError) {
        if (lastError.message.includes('circuit breaker')) {
          throw new Error('Network temporarily unavailable. Please try again in a moment.');
        } else if (lastError.message.includes('rate limit')) {
          throw new Error('Too many requests. Please wait a moment and try again.');
        } else {
          throw new Error('Unable to get swap quote. Please try again or contact support.');
        }
      }

      return quote;
    } catch (error: any) {
      console.error('Error getting optimal route:', error);
      
      // Provide user-friendly error messages
      let errorMessage = error.message;
      if (error.message.includes('circuit breaker')) {
        errorMessage = 'Network temporarily unavailable. Please try again in a moment.';
      } else if (error.message.includes('rate limit')) {
        errorMessage = 'Too many requests. Please wait a moment and try again.';
      } else if (error.message.includes('No liquidity')) {
        errorMessage = 'No liquidity available for this trading pair.';
      }
      
      throw new Error(errorMessage);
    }
  }, [getRouterForPair, getSphynxQuote, getReachSwapQuote]);

  // Calculate comprehensive swap metrics with enhanced fee handling
  const calculateSwapMetrics = useCallback(async (
    tokenIn: Token,
    tokenOut: Token,
    amountIn: string,
    slippage: number
  ): Promise<SwapMetrics> => {
    setIsCalculating(true);
    setMetricsError(null);

    try {
      // Get optimal route
      const quote = await getOptimalRoute(tokenIn, tokenOut, amountIn);

      if (!quote.liquidityAvailable) {
        throw new Error('No liquidity available for this pair');
      }

      // Detect fee-on-transfer tokens
      const [tokenInFeeInfo, tokenOutFeeInfo] = await Promise.all([
        detectTokenFees(tokenIn.address),
        detectTokenFees(tokenOut.address)
      ]);

      const hasFeeOnTransfer = tokenInFeeInfo.hasTransferFee || tokenOutFeeInfo.hasTransferFee;

      // Calculate exchange rate
      const exchangeRate = (parseFloat(quote.amountOut) / parseFloat(amountIn)).toFixed(6);

      // Use recommended slippage if available and higher than user setting
      const effectiveSlippage = quote.recommendedSlippage && quote.recommendedSlippage > slippage 
        ? quote.recommendedSlippage 
        : slippage;

      // Calculate minimum received with fee consideration
      let minimumReceived = parseFloat(quote.amountOut);
      
      if (tokenOutFeeInfo.hasTransferFee) {
        // Reduce by estimated output token fee
        minimumReceived *= (1 - (tokenOutFeeInfo.sellFee || 0.05));
      }
      
      // Apply slippage
      minimumReceived *= (1 - effectiveSlippage / 100);

      // For fee-on-transfer tokens using supporting functions, set minimum to 0
      if (hasFeeOnTransfer && quote.swapStrategy === 'supportingFee') {
        minimumReceived = 0;
      }

      const metrics: SwapMetrics = {
        exchangeRate,
        priceImpact: quote.priceImpact,
        minimumReceived: minimumReceived.toFixed(6),
        slippageTolerance: effectiveSlippage,
        routerUsed: quote.router,
        estimatedGas: quote.gasEstimate,
        hasFeeOnTransfer,
        path: quote.path,
        amountOut: quote.amountOut,
        liquidityAvailable: quote.liquidityAvailable,
        recommendedSlippage: quote.recommendedSlippage,
        swapStrategy: quote.swapStrategy
      };

      console.log('📊 Calculated enhanced swap metrics:', metrics);
      return metrics;
    } catch (error: any) {
      console.error('Error calculating swap metrics:', error);
      setMetricsError(error.message || 'Failed to calculate swap metrics');
      throw error;
    } finally {
      setIsCalculating(false);
    }
  }, [getOptimalRoute, detectTokenFees]);

  return {
    calculateSwapMetrics,
    getOptimalRoute,
    isCalculating,
    metricsError
  };
};