import { useState, useCallback } from 'react';
import { Token } from '../types';
import { SPHYNX_CONTRACTS } from '../constants/sphynx';

interface SwapQuote {
  amountOut: string;
  path: string[];
  priceImpact: number;
  gasEstimate: string;
  router: 'sphynx' | 'reachswap';
  liquidityAvailable: boolean;
}

interface UseBidirectionalSwapReturn {
  calculateForwardQuote: (
    tokenIn: Token,
    tokenOut: Token,
    amountIn: string
  ) => Promise<SwapQuote>;
  calculateReverseQuote: (
    tokenIn: Token,
    tokenOut: Token,
    amountOut: string
  ) => Promise<SwapQuote>;
  isCalculating: boolean;
  quoteError: string | null;
}

export const useBidirectionalSwap = (): UseBidirectionalSwapReturn => {
  const [isCalculating, setIsCalculating] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

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

  // Get pair reserves for accurate calculations
  const getPairReserves = useCallback(async (tokenA: string, tokenB: string) => {
    try {
      const provider = getProvider();
      if (!provider) throw new Error('No provider available');

      // Get pair address
      const getPairSignature = '0xe6a43905';
      const token0 = tokenA.toLowerCase() < tokenB.toLowerCase() ? tokenA : tokenB;
      const token1 = tokenA.toLowerCase() < tokenB.toLowerCase() ? tokenB : tokenA;
      const paddedToken0 = token0.slice(2).padStart(64, '0');
      const paddedToken1 = token1.slice(2).padStart(64, '0');
      const data = getPairSignature + paddedToken0 + paddedToken1;

      const pairResult = await provider.request({
        method: 'eth_call',
        params: [{
          to: SPHYNX_CONTRACTS.FACTORY,
          data: data
        }, 'latest']
      });

      if (!pairResult || pairResult === '0x0000000000000000000000000000000000000000000000000000000000000000') {
        throw new Error('Pair does not exist');
      }

      const pairAddress = '0x' + pairResult.slice(-40);

      // Get reserves
      const getReservesSignature = '0x0902f1ac';
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
      const reserve0 = BigInt('0x' + reservesData.slice(0, 64));
      const reserve1 = BigInt('0x' + reservesData.slice(64, 128));

      // Decode token addresses
      const pairToken0 = '0x' + token0Result.slice(-40);
      const pairToken1 = '0x' + token1Result.slice(-40);

      return { reserve0, reserve1, token0: pairToken0, token1: pairToken1, pairAddress };
    } catch (error) {
      console.error('Error getting pair reserves:', error);
      throw error;
    }
  }, [getProvider]);

  // Get amounts out (forward calculation: From → To)
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
    } catch (error) {
      console.error('Error getting Sphynx amounts out:', error);
      throw error;
    }
  }, [getProvider]);

  // CRITICAL FIX: Get amounts in (reverse calculation: To → From) using live reserves
  const getSphynxAmountsIn = useCallback(async (
    amountOut: string,
    path: string[]
  ): Promise<string[]> => {
    try {
      const provider = getProvider();
      if (!provider) throw new Error('No provider available');

      // ENHANCED: Use getAmountsIn for accurate reverse calculation
      const getAmountsInSignature = '0x1f00ca74'; // getAmountsIn(uint256,address[])
      const paddedAmountOut = BigInt(amountOut).toString(16).padStart(64, '0');
      const pathOffset = '0000000000000000000000000000000000000000000000000000000000000040';
      const pathLength = path.length.toString(16).padStart(64, '0');
      const pathData = path.map(addr => addr.slice(2).padStart(64, '0')).join('');
      const data = getAmountsInSignature + paddedAmountOut + pathOffset + pathLength + pathData;

      const result = await provider.request({
        method: 'eth_call',
        params: [{
          to: SPHYNX_CONTRACTS.ROUTER,
          data: data
        }, 'latest']
      });

      if (!result || result === '0x') {
        throw new Error('No result from getAmountsIn');
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
    } catch (error) {
      console.error('Error getting Sphynx amounts in:', error);
      throw error;
    }
  }, [getProvider]);

  // Calculate forward quote (From → To)
  const calculateForwardQuote = useCallback(async (
    tokenIn: Token,
    tokenOut: Token,
    amountIn: string
  ): Promise<SwapQuote> => {
    setIsCalculating(true);
    setQuoteError(null);

    try {
      const amountInWei = BigInt(parseFloat(amountIn) * Math.pow(10, tokenIn.decimals)).toString();
      const path = [tokenIn.address, tokenOut.address];

      const amounts = await getSphynxAmountsOut(amountInWei, path);
      const amountOut = amounts[amounts.length - 1];
      const amountOutFormatted = (parseFloat(amountOut) / Math.pow(10, tokenOut.decimals)).toFixed(6);

      return {
        amountOut: amountOutFormatted,
        path,
        priceImpact: 0.1,
        gasEstimate: '0.002',
        router: 'sphynx',
        liquidityAvailable: true
      };
    } catch (error: any) {
      setQuoteError(error.message || 'Failed to calculate forward quote');
      throw error;
    } finally {
      setIsCalculating(false);
    }
  }, [getSphynxAmountsOut]);

  // ENHANCED: Calculate reverse quote (To → From) using accurate getAmountsIn
  const calculateReverseQuote = useCallback(async (
    tokenIn: Token,
    tokenOut: Token,
    amountOut: string
  ): Promise<SwapQuote> => {
    setIsCalculating(true);
    setQuoteError(null);

    try {
      const amountOutWei = BigInt(parseFloat(amountOut) * Math.pow(10, tokenOut.decimals)).toString();
      const path = [tokenIn.address, tokenOut.address];

      // CRITICAL FIX: Verify liquidity exists before calculating
      try {
        await getPairReserves(tokenIn.address, tokenOut.address);
      } catch (error) {
        console.log('No liquidity available for reverse calculation');
        return {
          amountOut: '0',
          path,
          priceImpact: 0,
          gasEstimate: '0.002',
          router: 'sphynx',
          liquidityAvailable: false
        };
      }

      // Use getAmountsIn for accurate reverse calculation
      const amounts = await getSphynxAmountsIn(amountOutWei, path);
      const amountIn = amounts[0];
      const amountInFormatted = (parseFloat(amountIn) / Math.pow(10, tokenIn.decimals)).toFixed(6);

      console.log(`🔄 Reverse calculation: Need ${amountInFormatted} ${tokenIn.symbol} to get ${amountOut} ${tokenOut.symbol}`);

      return {
        amountOut: amountInFormatted, // Return required input amount
        path,
        priceImpact: 0.1,
        gasEstimate: '0.002',
        router: 'sphynx',
        liquidityAvailable: true
      };
    } catch (error: any) {
      console.error('Reverse calculation failed:', error);
      setQuoteError(error.message || 'Failed to calculate reverse quote');
      
      // Return failed quote instead of throwing
      return {
        amountOut: '0',
        path: [tokenIn.address, tokenOut.address],
        priceImpact: 0,
        gasEstimate: '0.002',
        router: 'sphynx',
        liquidityAvailable: false
      };
    } finally {
      setIsCalculating(false);
    }
  }, [getSphynxAmountsIn, getPairReserves]);

  return {
    calculateForwardQuote,
    calculateReverseQuote,
    isCalculating,
    quoteError
  };
};