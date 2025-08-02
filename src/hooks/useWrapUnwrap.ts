import { useState, useCallback } from 'react';
import { Token } from '../types';
import { SPHYNX_CONTRACTS } from '../constants/sphynx';

interface WrapUnwrapResult {
  success: boolean;
  txHash?: string;
  error?: string;
  operation: 'wrap' | 'unwrap';
}

interface UseWrapUnwrapReturn {
  executeWrap: (amountIn: string) => Promise<WrapUnwrapResult>;
  executeUnwrap: (amountIn: string) => Promise<WrapUnwrapResult>;
  isWrapping: boolean;
  isUnwrapping: boolean;
  wrapError: string | null;
  unwrapError: string | null;
  isWrapUnwrapPair: (tokenIn: Token, tokenOut: Token) => 'wrap' | 'unwrap' | null;
}

// wLOOP contract ABI for wrap/unwrap operations
const WLOOP_ABI = [
  'function deposit() external payable',
  'function withdraw(uint256 amount) external',
  'function balanceOf(address owner) external view returns (uint256)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function approve(address spender, uint256 amount) external returns (bool)'
];

export const useWrapUnwrap = (): UseWrapUnwrapReturn => {
  const [isWrapping, setIsWrapping] = useState(false);
  const [isUnwrapping, setIsUnwrapping] = useState(false);
  const [wrapError, setWrapError] = useState<string | null>(null);
  const [unwrapError, setUnwrapError] = useState<string | null>(null);

  // Get the current provider and signer
  const getProviderAndSigner = useCallback(async () => {
    if (typeof window === 'undefined') return { provider: null, signer: null };

    const savedWalletType = localStorage.getItem('reachswap_wallet_type');
    let provider = null;

    if (savedWalletType === 'MetaMask' && (window as any).ethereum?.isMetaMask) {
      provider = (window as any).ethereum;
    } else if (savedWalletType === 'OKX Wallet' && (window as any).okxwallet) {
      provider = (window as any).okxwallet;
    }

    if (!provider) {
      throw new Error('No wallet provider available');
    }

    return { provider, signer: provider };
  }, []);

  // Check if token pair is wrap/unwrap operation
  const isWrapUnwrapPair = useCallback((tokenIn: Token, tokenOut: Token): 'wrap' | 'unwrap' | null => {
    const isNativeLOOP = (token: Token) => 
      token.address === '0x0000000000000000000000000000000000000000' || 
      token.symbol === 'LOOP';
    
    const isWLOOP = (token: Token) => 
      token.address.toLowerCase() === SPHYNX_CONTRACTS.WLOOP.toLowerCase() || 
      token.symbol === 'wLOOP';

    if (isNativeLOOP(tokenIn) && isWLOOP(tokenOut)) {
      return 'wrap';
    }
    
    if (isWLOOP(tokenIn) && isNativeLOOP(tokenOut)) {
      return 'unwrap';
    }
    
    return null;
  }, []);

  // Execute wrap operation (LOOP → wLOOP)
  const executeWrap = useCallback(async (amountIn: string): Promise<WrapUnwrapResult> => {
    setIsWrapping(true);
    setWrapError(null);

    try {
      const { provider } = await getProviderAndSigner();
      if (!provider) throw new Error('No provider available');

      const walletAddress = localStorage.getItem('reachswap_wallet_address');
      if (!walletAddress) throw new Error('No wallet address found');

      // Convert amount to wei (18 decimals for LOOP)
      const amountInWei = BigInt(parseFloat(amountIn) * Math.pow(10, 18)).toString();

      console.log(`🔄 Wrapping ${amountIn} LOOP to wLOOP...`);

      // Check LOOP balance
      const loopBalance = await provider.request({
        method: 'eth_getBalance',
        params: [walletAddress, 'latest']
      });

      const loopBalanceBig = BigInt(loopBalance);
      const requiredAmount = BigInt(amountInWei);

      if (loopBalanceBig < requiredAmount) {
        throw new Error(`Insufficient LOOP balance. Required: ${amountIn}, Available: ${(Number(loopBalanceBig) / 1e18).toFixed(6)}`);
      }

      // Build deposit() transaction
      const depositSignature = '0xd0e30db0'; // deposit()
      const txData = depositSignature;

      // Estimate gas
      let gasLimit = '0x15F90'; // 90,000 default
      try {
        const gasEstimate = await provider.request({
          method: 'eth_estimateGas',
          params: [{
            from: walletAddress,
            to: SPHYNX_CONTRACTS.WLOOP,
            data: txData,
            value: '0x' + BigInt(amountInWei).toString(16)
          }]
        });
        
        const estimatedGas = parseInt(gasEstimate, 16);
        const bufferedGas = Math.floor(estimatedGas * 1.2);
        gasLimit = '0x' + bufferedGas.toString(16);
      } catch (gasError) {
        console.warn('Gas estimation failed for wrap, using default:', gasError);
      }

      // Execute wrap transaction
      const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: walletAddress,
          to: SPHYNX_CONTRACTS.WLOOP,
          data: txData,
          value: '0x' + BigInt(amountInWei).toString(16),
          gas: gasLimit
        }]
      });

      console.log(`✅ Wrap transaction sent: ${txHash}`);

      return {
        success: true,
        txHash,
        operation: 'wrap'
      };

    } catch (error: any) {
      console.error('❌ Wrap error:', error);
      
      let errorMessage = error.message || 'Wrap operation failed';
      
      if (error.message.includes('user rejected') || error.message.includes('User denied')) {
        errorMessage = 'Transaction was cancelled by user';
      } else if (error.message.includes('insufficient funds')) {
        errorMessage = 'Insufficient LOOP for gas fees';
      }
      
      setWrapError(errorMessage);
      
      return {
        success: false,
        error: errorMessage,
        operation: 'wrap'
      };
    } finally {
      setIsWrapping(false);
    }
  }, [getProviderAndSigner]);

  // Execute unwrap operation (wLOOP → LOOP)
  const executeUnwrap = useCallback(async (amountIn: string): Promise<WrapUnwrapResult> => {
    setIsUnwrapping(true);
    setUnwrapError(null);

    try {
      const { provider } = await getProviderAndSigner();
      if (!provider) throw new Error('No provider available');

      const walletAddress = localStorage.getItem('reachswap_wallet_address');
      if (!walletAddress) throw new Error('No wallet address found');

      // Convert amount to wei (18 decimals for wLOOP)
      const amountInWei = BigInt(parseFloat(amountIn) * Math.pow(10, 18)).toString();

      console.log(`🔄 Unwrapping ${amountIn} wLOOP to LOOP...`);

      // Check wLOOP balance
      const balanceOfSignature = '0x70a08231';
      const paddedAddress = walletAddress.slice(2).padStart(64, '0');
      const balanceData = balanceOfSignature + paddedAddress;

      const wloopBalance = await provider.request({
        method: 'eth_call',
        params: [{
          to: SPHYNX_CONTRACTS.WLOOP,
          data: balanceData
        }, 'latest']
      });

      const wloopBalanceBig = BigInt(wloopBalance || '0x0');
      const requiredAmount = BigInt(amountInWei);

      if (wloopBalanceBig < requiredAmount) {
        throw new Error(`Insufficient wLOOP balance. Required: ${amountIn}, Available: ${(Number(wloopBalanceBig) / 1e18).toFixed(6)}`);
      }

      // Build withdraw(uint256) transaction
      const withdrawSignature = '0x2e1a7d4d'; // withdraw(uint256)
      const paddedAmount = BigInt(amountInWei).toString(16).padStart(64, '0');
      const txData = withdrawSignature + paddedAmount;

      // Estimate gas
      let gasLimit = '0x15F90'; // 90,000 default
      try {
        const gasEstimate = await provider.request({
          method: 'eth_estimateGas',
          params: [{
            from: walletAddress,
            to: SPHYNX_CONTRACTS.WLOOP,
            data: txData
          }]
        });
        
        const estimatedGas = parseInt(gasEstimate, 16);
        const bufferedGas = Math.floor(estimatedGas * 1.2);
        gasLimit = '0x' + bufferedGas.toString(16);
      } catch (gasError) {
        console.warn('Gas estimation failed for unwrap, using default:', gasError);
      }

      // Execute unwrap transaction
      const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: walletAddress,
          to: SPHYNX_CONTRACTS.WLOOP,
          data: txData,
          gas: gasLimit
        }]
      });

      console.log(`✅ Unwrap transaction sent: ${txHash}`);

      return {
        success: true,
        txHash,
        operation: 'unwrap'
      };

    } catch (error: any) {
      console.error('❌ Unwrap error:', error);
      
      let errorMessage = error.message || 'Unwrap operation failed';
      
      if (error.message.includes('user rejected') || error.message.includes('User denied')) {
        errorMessage = 'Transaction was cancelled by user';
      } else if (error.message.includes('insufficient funds')) {
        errorMessage = 'Insufficient LOOP for gas fees';
      }
      
      setUnwrapError(errorMessage);
      
      return {
        success: false,
        error: errorMessage,
        operation: 'unwrap'
      };
    } finally {
      setIsUnwrapping(false);
    }
  }, [getProviderAndSigner]);

  return {
    executeWrap,
    executeUnwrap,
    isWrapping,
    isUnwrapping,
    wrapError,
    unwrapError,
    isWrapUnwrapPair
  };
};