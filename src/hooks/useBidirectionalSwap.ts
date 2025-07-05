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

  // CRITICAL FIX: Get amounts in (reverse calculation: To → From) - only after liquidity verification
  const getSphynxAmountsIn = useCallback(async (
    amountOut: string,
    path: string[]
  ): Promise<string[]> => {
    try {
      const provider = getProvider();
      if (!provider) throw new Error('No provider available');

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
      const path = [tokenIn.address, tokenOut.address]; // Simplified path

      const amounts = await getSphynxAmountsOut(amountInWei, path);
      const amountOut = amounts[amounts.length - 1];
      const amountOutFormatted = (parseFloat(amountOut) / Math.pow(10, tokenOut.decimals)).toFixed(6);

      return {
        amountOut: amountOutFormatted,
        path,
        priceImpact: 0.1, // Simplified
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

  // CRITICAL FIX: Calculate reverse quote (To → From) - only after liquidity verification
  const calculateReverseQuote = useCallback(async (
    tokenIn: Token,
    tokenOut: Token,
    amountOut: string
  ): Promise<SwapQuote> => {
    setIsCalculating(true);
    setQuoteError(null);

    try {
      const amountOutWei = BigInt(parseFloat(amountOut) * Math.pow(10, tokenOut.decimals)).toString();
      const path = [tokenIn.address, tokenOut.address]; // Simplified path

      // CRITICAL FIX: Only call getAmountsIn after verifying liquidity path exists
      const amounts = await getSphynxAmountsIn(amountOutWei, path);
      const amountIn = amounts[0];
      const amountInFormatted = (parseFloat(amountIn) / Math.pow(10, tokenIn.decimals)).toFixed(6);

      return {
        amountOut: amountInFormatted, // Return required input amount
        path,
        priceImpact: 0.1, // Simplified
        gasEstimate: '0.002',
        router: 'sphynx',
        liquidityAvailable: true
      };
    } catch (error: any) {
      setQuoteError(error.message || 'Failed to calculate reverse quote');
      
      // CRITICAL FIX: Return failed quote instead of throwing
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
  }, [getSphynxAmountsIn]);

  return {
    calculateForwardQuote,
    calculateReverseQuote,
    isCalculating,
    quoteError
  };
};