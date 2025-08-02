import { useState, useCallback } from 'react';
import { Token } from '../types';
import { SPHYNX_CONTRACTS, SPHYNX_ROUTER_ABI, ERC20_ABI } from '../constants/sphynx';
import { REACHSWAP_CONTRACTS, REACHSWAP_ROUTER_ABI } from '../constants/reachswap';
import { getProviderAndSigner, waitForTransaction } from '../utils/web3Utils';
import { useTokenFeeDetection } from './useTokenFeeDetection';
import { useUniversalRouter } from './useUniversalRouter';

interface SwapParams {
  tokenIn: Token;
  tokenOut: Token;
  amountIn: string;
  amountOutMin: string;
  slippage: string;
  deadline?: number;
  routerUsed: 'sphynx' | 'reachswap';
  path: string[];
  hasFeeOnTransfer: boolean;
}

interface SwapResult {
  success: boolean;
  txHash?: string;
  error?: string;
  routerUsed: 'reachswap' | 'sphynx';
  amountOut?: string;
}

interface UseSwapExecutionReturn {
  executeSwap: (params: SwapParams) => Promise<SwapResult>;
  isSwapping: boolean;
  swapError: string | null;
}

// FIXED: Native LOOP token address detection
const NATIVE_LOOP = '0x0000000000000000000000000000000000000000';

// FIXED: Swap type enumeration with correct native detection
type SwapType = 'ETH_FOR_TOKENS' | 'TOKENS_FOR_ETH' | 'TOKENS_FOR_TOKENS';

// Swap method enumeration
type SwapMethod = 
  | 'swapExactETHForTokens'
  | 'swapExactETHForTokensSupportingFeeOnTransferTokens'
  | 'swapExactTokensForETH'
  | 'swapExactTokensForETHSupportingFeeOnTransferTokens'
  | 'swapExactTokensForTokens'
  | 'swapExactTokensForTokensSupportingFeeOnTransferTokens';

export const useSwapExecution = (): UseSwapExecutionReturn => {
  const [isSwapping, setIsSwapping] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);
  const { detectTokenFees } = useTokenFeeDetection();
  const { getRouterForPair } = useUniversalRouter();

  // FIXED: Determine swap type based on native LOOP detection
  const getSwapType = useCallback((tokenIn: Token, tokenOut: Token): SwapType => {
    const isNativeIn = tokenIn.address === NATIVE_LOOP;
    const isNativeOut = tokenOut.address === NATIVE_LOOP;

    if (isNativeIn && !isNativeOut) {
      return 'ETH_FOR_TOKENS'; // LOOP → Token
    }
    if (!isNativeIn && isNativeOut) {
      return 'TOKENS_FOR_ETH'; // Token → LOOP
    }
    return 'TOKENS_FOR_TOKENS'; // Token → Token
  }, []);

  // CRITICAL FIX: Get correct swap method - Fixed logic for Token → LOOP swaps
  const getSwapMethod = useCallback((hasFeeOnTransfer: boolean, swapType: SwapType): SwapMethod => {
    switch (swapType) {
      case 'ETH_FOR_TOKENS':
        // For LOOP → Token, use non-supporting variant to avoid INVALID_PATH
        return 'swapExactETHForTokens';
      case 'TOKENS_FOR_ETH':
        // CRITICAL FIX: For Token → LOOP, use supporting variant if ANY token in path has fees
        // This is safer and handles edge cases better
        return hasFeeOnTransfer ? 'swapExactTokensForETHSupportingFeeOnTransferTokens' : 'swapExactTokensForETH';
      case 'TOKENS_FOR_TOKENS':
        // For Token → Token, use supporting variant if input token has fees
        return hasFeeOnTransfer ? 'swapExactTokensForTokensSupportingFeeOnTransferTokens' : 'swapExactTokensForTokens';
      default:
        return 'swapExactTokensForTokens';
    }
  }, []);

  // Get function signature for swap method
  const getSwapMethodSignature = useCallback((method: SwapMethod): string => {
    const signatures: Record<SwapMethod, string> = {
      'swapExactETHForTokens': '0x7ff36ab5',
      'swapExactETHForTokensSupportingFeeOnTransferTokens': '0xb6f9de95',
      'swapExactTokensForETH': '0x18cbafe5',
      'swapExactTokensForETHSupportingFeeOnTransferTokens': '0x791ac947',
      'swapExactTokensForTokens': '0x38ed1739',
      'swapExactTokensForTokensSupportingFeeOnTransferTokens': '0x5c11d795'
    };
    
    return signatures[method];
  }, []);

  // FIXED: Enhanced fee detection for input tokens
  const detectInputTokenFees = useCallback(async (tokenAddress: string, swapType: SwapType) => {
    try {
      // For ETH_FOR_TOKENS (LOOP → Token), input is native LOOP (no fees)
      if (swapType === 'ETH_FOR_TOKENS') {
        return {
          hasTransferFee: false,
          requiresSpecialHandling: false,
          recommendedSlippage: 1
        };
      }

      // For other swap types, detect input token fees
      const feeInfo = await detectTokenFees(tokenAddress);
      
      // CRITICAL FIX: Be more conservative with fee detection for Token → LOOP swaps
      const requiresSpecialHandling = feeInfo.hasTransferFee || (swapType === 'TOKENS_FOR_ETH' && feeInfo.sellFee > 0);
      
      return {
        hasTransferFee: feeInfo.hasTransferFee,
        requiresSpecialHandling,
        recommendedSlippage: requiresSpecialHandling ? Math.max(8, (feeInfo.sellFee || 0.05) * 100 + 3) : 1
      };
    } catch (error) {
      console.error('Error detecting input token fees:', error);
      // CRITICAL FIX: Default to safe handling for unknown tokens
      return {
        hasTransferFee: swapType === 'TOKENS_FOR_ETH', // Assume fees for Token → LOOP if detection fails
        requiresSpecialHandling: swapType === 'TOKENS_FOR_ETH',
        recommendedSlippage: swapType === 'TOKENS_FOR_ETH' ? 8 : 1
      };
    }
  }, [detectTokenFees]);

  // CRITICAL FIX: Enhanced token balance checking with fresh state and proper decimals
  const checkTokenBalance = useCallback(async (
    tokenAddress: string,
    ownerAddress: string,
    tokenDecimals: number = 18,
    forceRefresh: boolean = false
  ): Promise<{ balance: string; balanceFormatted: string; balanceBig: bigint }> => {
    try {
      const { provider } = await getProviderAndSigner();
      if (!provider) throw new Error('No provider available');

      let result: string;

      if (tokenAddress === NATIVE_LOOP) {
        // Native LOOP balance
        result = await provider.request({
          method: 'eth_getBalance',
          params: [ownerAddress, 'latest']
        });
      } else {
        // ERC-20 token balance
        const balanceOfSignature = '0x70a08231'; // balanceOf(address)
        const paddedOwner = ownerAddress.slice(2).padStart(64, '0');
        const data = balanceOfSignature + paddedOwner;

        result = await provider.request({
          method: 'eth_call',
          params: [{
            to: tokenAddress,
            data: data
          }, 'latest']
        });
      }

      const balanceWei = result || '0x0';
      const balanceBig = BigInt(balanceWei);
      
      // CRITICAL FIX: Use correct decimals for formatting
      const balanceFormatted = (Number(balanceBig) / Math.pow(10, tokenDecimals)).toFixed(6);

      return {
        balance: balanceWei,
        balanceFormatted,
        balanceBig
      };
    } catch (error) {
      console.error('Error checking token balance:', error);
      return {
        balance: '0x0',
        balanceFormatted: '0.000000',
        balanceBig: BigInt(0)
      };
    }
  }, [getProviderAndSigner]);

  // Check token allowance
  const checkTokenAllowance = useCallback(async (
    tokenAddress: string,
    ownerAddress: string,
    spenderAddress: string
  ): Promise<string> => {
    try {
      const { provider } = await getProviderAndSigner();
      if (!provider) throw new Error('No provider available');

      const allowanceSignature = '0xdd62ed3e'; // allowance(address,address)
      const paddedOwner = ownerAddress.slice(2).padStart(64, '0');
      const paddedSpender = spenderAddress.slice(2).padStart(64, '0');
      const data = allowanceSignature + paddedOwner + paddedSpender;

      const result = await provider.request({
        method: 'eth_call',
        params: [{
          to: tokenAddress,
          data: data
        }, 'latest']
      });

      return result || '0x0';
    } catch (error) {
      console.error('Error checking token allowance:', error);
      return '0x0';
    }
  }, [getProviderAndSigner]);

  // CRITICAL FIX: Enhanced approval with better error handling and gas optimization
  const approveToken = useCallback(async (
    tokenAddress: string,
    spenderAddress: string,
    amount: string,
    tokenDecimals: number = 18,
    feeBuffer: number = 2.0 // Increased default buffer
  ): Promise<string> => {
    try {
      const { provider } = await getProviderAndSigner();
      if (!provider) throw new Error('No provider available');

      const walletAddress = localStorage.getItem('reachswap_wallet_address');
      if (!walletAddress) throw new Error('No wallet address found');

      // CRITICAL FIX: Check fresh balance with correct decimals
      const { balanceBig } = await checkTokenBalance(tokenAddress, walletAddress, tokenDecimals, true);
      const requiredAmount = BigInt(amount);

      if (balanceBig < requiredAmount) {
        const balanceFormatted = (Number(balanceBig) / Math.pow(10, tokenDecimals)).toFixed(6);
        const requiredFormatted = (Number(requiredAmount) / Math.pow(10, tokenDecimals)).toFixed(6);
        throw new Error(`Insufficient token balance. Required: ${requiredFormatted}, Available: ${balanceFormatted}`);
      }

      // CRITICAL FIX: Use max approval for problematic tokens to avoid repeated approvals
      const maxApproval = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
      
      // Check if we should use max approval (for tokens with fees or if amount is large)
      const shouldUseMaxApproval = feeBuffer > 1.5 || requiredAmount > balanceBig / BigInt(2);
      
      let approvalAmount: bigint;
      if (shouldUseMaxApproval) {
        approvalAmount = maxApproval;
        console.log('🔐 Using max approval for safer token handling');
      } else {
        approvalAmount = requiredAmount * BigInt(Math.floor(feeBuffer * 100)) / BigInt(100);
      }

      const approveSignature = '0x095ea7b3'; // approve(address,uint256)
      const paddedSpender = spenderAddress.slice(2).padStart(64, '0');
      const paddedAmount = approvalAmount.toString(16).padStart(64, '0');
      const data = approveSignature + paddedSpender + paddedAmount;

      // CRITICAL FIX: Enhanced gas estimation for approval
      let gasLimit = '0x15F90'; // 90,000 gas (increased from default)
      
      try {
        // Try to estimate gas first
        const gasEstimate = await provider.request({
          method: 'eth_estimateGas',
          params: [{
            from: walletAddress,
            to: tokenAddress,
            data: data
          }]
        });
        
        // Add 20% buffer to estimated gas
        const estimatedGas = parseInt(gasEstimate, 16);
        const bufferedGas = Math.floor(estimatedGas * 1.2);
        gasLimit = '0x' + bufferedGas.toString(16);
        
        console.log(`⛽ Estimated gas for approval: ${estimatedGas}, using: ${bufferedGas}`);
      } catch (gasError) {
        console.warn('Gas estimation failed, using default gas limit:', gasError);
        // Use higher default gas limit for problematic tokens
        gasLimit = '0x1C9C380'; // 30,000,000 gas
      }

      // CRITICAL FIX: Enhanced transaction parameters
      const txParams = {
        from: walletAddress,
        to: tokenAddress,
        data: data,
        gas: gasLimit,
        // CRITICAL FIX: Let wallet handle gas price automatically
        // gasPrice: undefined // Remove manual gas price setting
      };

      console.log('🔐 Sending approval transaction with params:', {
        to: tokenAddress,
        gas: gasLimit,
        approvalAmount: approvalAmount.toString()
      });

      const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [txParams]
      });

      console.log(`✅ Token approval transaction sent: ${txHash}`);
      return txHash;
    } catch (error: any) {
      console.error('Error approving token:', error);
      
      // CRITICAL FIX: Enhanced error analysis for better user feedback
      let errorMessage = 'Failed to approve token';
      
      if (error.message) {
        if (error.message.includes('user rejected') || error.message.includes('User denied')) {
          errorMessage = 'Transaction was cancelled by user';
        } else if (error.message.includes('insufficient funds')) {
          errorMessage = 'Insufficient LOOP for gas fees';
        } else if (error.message.includes('gas required exceeds allowance')) {
          errorMessage = 'Gas limit too low. Please try again with higher gas';
        } else if (error.message.includes('nonce too low')) {
          errorMessage = 'Transaction nonce error. Please try again';
        } else if (error.message.includes('replacement transaction underpriced')) {
          errorMessage = 'Transaction underpriced. Please try again';
        } else if (error.message.includes('Internal JSON-RPC error')) {
          errorMessage = 'Network error. Please check your connection and try again';
        } else if (error.message.includes('execution reverted')) {
          errorMessage = 'Token approval failed. This token may have restrictions';
        } else {
          errorMessage = `Approval failed: ${error.message}`;
        }
      }
      
      throw new Error(errorMessage);
    }
  }, [getProviderAndSigner, checkTokenBalance]);

  // CRITICAL FIX: Enhanced transaction waiting with better error handling
  // Note: waitForTransaction is now imported from web3Utils

  // CRITICAL FIX: Build swap transaction data with correct path offsets
  const buildSwapTransaction = useCallback((
    method: SwapMethod,
    params: {
      amountIn?: string;
      amountOut?: string;
      amountInMax?: string;
      amountOutMin?: string;
      path: string[];
      to: string;
      deadline: number;
    }
  ): string => {
    const { path, to, deadline } = params;
    const signature = getSwapMethodSignature(method);
    const paddedTo = to.slice(2).padStart(64, '0');
    const paddedDeadline = deadline.toString(16).padStart(64, '0');
    
    // Calculate path encoding
    const pathLength = path.length.toString(16).padStart(64, '0');
    const pathData = path.map(addr => addr.slice(2).padStart(64, '0')).join('');

    switch (method) {
      case 'swapExactETHForTokens':
      case 'swapExactETHForTokensSupportingFeeOnTransferTokens': {
        // swapExactETHForTokens(uint amountOutMin, address[] path, address to, uint deadline)
        const pathOffset = '0000000000000000000000000000000000000000000000000000000000000080';
        const paddedAmountOutMin = BigInt(params.amountOutMin!).toString(16).padStart(64, '0');
        return signature + paddedAmountOutMin + pathOffset + paddedTo + paddedDeadline + pathLength + pathData;
      }

      case 'swapExactTokensForETH':
      case 'swapExactTokensForETHSupportingFeeOnTransferTokens': {
        // swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline)
        const pathOffset = '00000000000000000000000000000000000000000000000000000000000000a0';
        const paddedAmountIn = BigInt(params.amountIn!).toString(16).padStart(64, '0');
        const paddedAmountOutMin = BigInt(params.amountOutMin!).toString(16).padStart(64, '0');
        return signature + paddedAmountIn + paddedAmountOutMin + pathOffset + paddedTo + paddedDeadline + pathLength + pathData;
      }

      case 'swapExactTokensForTokens':
      case 'swapExactTokensForTokensSupportingFeeOnTransferTokens': {
        // swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline)
        const pathOffset = '00000000000000000000000000000000000000000000000000000000000000a0';
        const paddedAmountIn = BigInt(params.amountIn!).toString(16).padStart(64, '0');
        const paddedAmountOutMin = BigInt(params.amountOutMin!).toString(16).padStart(64, '0');
        return signature + paddedAmountIn + paddedAmountOutMin + pathOffset + paddedTo + paddedDeadline + pathLength + pathData;
      }

      default:
        throw new Error(`Unsupported swap method: ${method}`);
    }
  }, [getSwapMethodSignature]);

  // CRITICAL FIX: Enhanced Sphynx swap execution with proper balance verification
  const executeSwapOnSphynx = useCallback(async (params: SwapParams): Promise<SwapResult> => {
    try {
      const { provider } = await getProviderAndSigner();
      if (!provider) throw new Error('No provider available');

      const walletAddress = localStorage.getItem('reachswap_wallet_address');
      if (!walletAddress) throw new Error('No wallet address found');

      // Verify liquidity exists before attempting swap
      const routerInfo = await getRouterForPair(params.tokenIn, params.tokenOut);
      if (!routerInfo.pairExists) {
        throw new Error('No liquidity available for this pair on Sphynx');
      }

      const deadline = params.deadline || Math.floor(Date.now() / 1000) + 1200; // 20 minutes
      
      // Determine swap type and method
      const swapType = getSwapType(params.tokenIn, params.tokenOut);
      console.log(`🔄 Swap type detected: ${swapType}`);
      console.log(`🔄 Token IN: ${params.tokenIn.symbol} (${params.tokenIn.address})`);
      console.log(`🔄 Token OUT: ${params.tokenOut.symbol} (${params.tokenOut.address})`);

      // Check input token fees for method selection
      const inputTokenFees = await detectInputTokenFees(params.tokenIn.address, swapType);
      const hasFeeOnTransfer = inputTokenFees.requiresSpecialHandling;

      // Get correct swap method
      const swapMethod = getSwapMethod(hasFeeOnTransfer, swapType);
      console.log(`🔄 Swap method selected: ${swapMethod}`);
      console.log(`🔍 Input token fee analysis: ${hasFeeOnTransfer ? 'Has fees' : 'No fees'}`);

      // Calculate amounts based on swap type
      let amountInWei: string;
      let amountOutMinWei: string;
      let transactionValue = '0x0';

      if (swapType === 'ETH_FOR_TOKENS') {
        // LOOP → Token: amountIn is in LOOP (native)
        amountInWei = BigInt(parseFloat(params.amountIn) * Math.pow(10, 18)).toString();
        amountOutMinWei = hasFeeOnTransfer ? '1' : BigInt(parseFloat(params.amountOutMin) * Math.pow(10, params.tokenOut.decimals)).toString();
        transactionValue = '0x' + BigInt(amountInWei).toString(16);
      } else {
        // Token → LOOP or Token → Token
        amountInWei = BigInt(parseFloat(params.amountIn) * Math.pow(10, params.tokenIn.decimals)).toString();
        
        if (swapType === 'TOKENS_FOR_ETH') {
          // Token → LOOP: amountOutMin is in LOOP (18 decimals)
          amountOutMinWei = hasFeeOnTransfer ? '1' : BigInt(parseFloat(params.amountOutMin) * Math.pow(10, 18)).toString();
        } else {
          // Token → Token: amountOutMin is in output token decimals
          amountOutMinWei = hasFeeOnTransfer ? '1' : BigInt(parseFloat(params.amountOutMin) * Math.pow(10, params.tokenOut.decimals)).toString();
        }
      }

      // CRITICAL FIX: Enhanced balance verification with proper decimals and precision
      if (swapType !== 'ETH_FOR_TOKENS') {
        console.log('🔍 Performing comprehensive balance verification...');
        
        // CRITICAL FIX: Get fresh balance with correct token decimals
        const { balanceBig, balanceFormatted } = await checkTokenBalance(
          params.tokenIn.address, 
          walletAddress, 
          params.tokenIn.decimals,
          true // Force refresh
        );
        
        const requiredAmount = BigInt(amountInWei);

        console.log(`💰 Fresh balance check for ${params.tokenIn.symbol}:
          Balance: ${balanceFormatted} (${balanceBig.toString()} wei)
          Required: ${params.amountIn} (${requiredAmount.toString()} wei)
          Decimals: ${params.tokenIn.decimals}`);

        // CRITICAL FIX: More precise balance comparison with buffer consideration
        if (balanceBig < requiredAmount) {
          const errorMsg = `Insufficient ${params.tokenIn.symbol} balance. Required: ${params.amountIn}, Available: ${balanceFormatted}`;
          console.error('❌ Balance verification failed:', errorMsg);
          throw new Error(errorMsg);
        }

        // Check current allowance
        const currentAllowance = await checkTokenAllowance(
          params.tokenIn.address,
          walletAddress,
          SPHYNX_CONTRACTS.ROUTER
        );

        const currentAllowanceBig = BigInt(currentAllowance);
        const requiredAllowance = hasFeeOnTransfer ? requiredAmount * BigInt(200) / BigInt(100) : requiredAmount;

        console.log(`💰 Allowance check:
          Current: ${currentAllowanceBig.toString()}
          Required: ${requiredAllowance.toString()}`);

        if (currentAllowanceBig < requiredAllowance) {
          console.log('🔐 Token approval required for Sphynx router...');
          
          // CRITICAL FIX: Reset allowance to 0 first for some tokens (like USDT)
          try {
            if (currentAllowanceBig > BigInt(0)) {
              console.log('🔄 Resetting allowance to 0 first...');
              const resetTx = await approveToken(params.tokenIn.address, SPHYNX_CONTRACTS.ROUTER, '0', params.tokenIn.decimals, 1.0);
              const resetConfirmed = await waitForTransaction(resetTx, 30);
              if (!resetConfirmed) {
                console.warn('⚠️ Reset allowance transaction may have failed, but continuing...');
              }
              await new Promise(resolve => setTimeout(resolve, 3000));
            }
          } catch (error) {
            console.warn('⚠️ Could not reset allowance, proceeding with direct approval:', error);
          }

          // Approve the required amount with correct decimals
          const approvalTx = await approveToken(
            params.tokenIn.address,
            SPHYNX_CONTRACTS.ROUTER,
            amountInWei,
            params.tokenIn.decimals,
            hasFeeOnTransfer ? 2.0 : 1.2
          );
          
          // Wait for approval to be confirmed
          const approvalConfirmed = await waitForTransaction(approvalTx, 60); // Increased timeout
          if (!approvalConfirmed) {
            throw new Error('Token approval transaction failed or timed out');
          }

          // Additional wait to ensure blockchain state is updated
          await new Promise(resolve => setTimeout(resolve, 5000)); // Increased wait time

          // Verify approval was successful
          const newAllowance = await checkTokenAllowance(
            params.tokenIn.address,
            walletAddress,
            SPHYNX_CONTRACTS.ROUTER
          );

          const newAllowanceBig = BigInt(newAllowance);
          if (newAllowanceBig < requiredAmount) {
            throw new Error(`Approval verification failed. Expected: ${requiredAmount.toString()}, Got: ${newAllowanceBig.toString()}`);
          }

          console.log('✅ Token approval confirmed');
        }

        // CRITICAL FIX: Final balance check right before swap execution
        console.log('🔍 Final balance verification before swap execution...');
        const { balanceBig: finalBalanceBig, balanceFormatted: finalBalanceFormatted } = await checkTokenBalance(
          params.tokenIn.address, 
          walletAddress, 
          params.tokenIn.decimals,
          true
        );
        
        if (finalBalanceBig < requiredAmount) {
          const errorMsg = `Final balance check failed. Required: ${params.amountIn} ${params.tokenIn.symbol}, Available: ${finalBalanceFormatted} ${params.tokenIn.symbol}`;
          console.error('❌ Final balance verification failed:', errorMsg);
          throw new Error(errorMsg);
        }

        console.log('✅ All balance and allowance verifications passed');
      }

      // Build transaction data
      const txData = buildSwapTransaction(swapMethod, {
        amountIn: amountInWei,
        amountOutMin: amountOutMinWei,
        path: params.path,
        to: walletAddress,
        deadline
      });

      // CRITICAL FIX: Enhanced gas estimation for swap
      let gasLimit = '0x7A120'; // 500,000 default
      
      try {
        const gasEstimate = await provider.request({
          method: 'eth_estimateGas',
          params: [{
            from: walletAddress,
            to: SPHYNX_CONTRACTS.ROUTER,
            data: txData,
            value: transactionValue
          }]
        });
        
        // Add 30% buffer to estimated gas
        const estimatedGas = parseInt(gasEstimate, 16);
        const bufferedGas = Math.floor(estimatedGas * 1.3);
        gasLimit = '0x' + bufferedGas.toString(16);
        
        console.log(`⛽ Estimated gas for swap: ${estimatedGas}, using: ${bufferedGas}`);
      } catch (gasError) {
        console.warn('Gas estimation failed, using higher default:', gasError);
        gasLimit = '0xF4240'; // 1,000,000 gas for complex swaps
      }

      // Execute the swap transaction
      console.log(`🚀 Executing ${swapMethod} with value: ${transactionValue}`);
      console.log(`📊 Amount in: ${amountInWei} (${params.amountIn} ${params.tokenIn.symbol})`);
      console.log(`📊 Min amount out: ${amountOutMinWei} (${params.amountOutMin} ${params.tokenOut.symbol})`);
      
      const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: walletAddress,
          to: SPHYNX_CONTRACTS.ROUTER,
          data: txData,
          value: transactionValue,
          gas: gasLimit,
          // Let wallet handle gas price automatically
        }]
      });

      console.log(`✅ Sphynx swap transaction sent (${swapMethod}): ${txHash}`);

      return {
        success: true,
        txHash,
        routerUsed: 'sphynx',
        amountOut: params.amountOutMin
      };

    } catch (error: any) {
      console.error('❌ Sphynx swap error:', error);
      
      // CRITICAL FIX: Enhanced error analysis to provide accurate feedback
      let errorMessage = error.message || 'Sphynx swap failed';
      
      // Analyze the actual error to provide accurate feedback
      if (error.message.includes('Failed to approve token')) {
        // Pass through approval errors as-is since they're already user-friendly
        errorMessage = error.message;
      } else if (error.message.includes('user rejected') || error.message.includes('User denied')) {
        errorMessage = 'Transaction was cancelled by user';
      } else if (error.message.includes('insufficient funds')) {
        errorMessage = 'Insufficient LOOP for gas fees';
      } else if (error.message.includes('transferFrom failed') || error.message.includes('TRANSFER_FROM_FAILED')) {
        errorMessage = 'Token transfer failed. Please check token approval and try again';
      } else if (error.message.includes('INVALID_PATH')) {
        errorMessage = 'Invalid swap path. Please try a different token pair';
      } else if (error.message.includes('Sphynx: K') || error.message.includes('UniswapV2: K')) {
        errorMessage = 'Swap failed due to price impact. Try reducing amount or increasing slippage';
      } else if (error.message.includes('INSUFFICIENT_OUTPUT_AMOUNT')) {
        errorMessage = 'Insufficient output amount. Try increasing slippage tolerance';
      } else if (error.message.includes('execution reverted')) {
        errorMessage = 'Transaction failed. This may be due to slippage, insufficient liquidity, or network congestion';
      } else if (error.message.includes('Internal JSON-RPC error')) {
        errorMessage = 'Network error. Please check your connection and try again';
      } else if (error.message.includes('network') || error.message.includes('timeout')) {
        errorMessage = 'Network error. Please check your connection and try again';
      } else if (error.message.includes('gas required exceeds allowance')) {
        errorMessage = 'Gas limit too low. Please try again';
      } else if (error.message.includes('nonce too low')) {
        errorMessage = 'Transaction nonce error. Please try again';
      }

      return {
        success: false,
        error: errorMessage,
        routerUsed: 'sphynx'
      };
    }
  }, [
    getProviderAndSigner, 
    getRouterForPair, 
    getSwapType,
    getSwapMethod,
    detectInputTokenFees, 
    checkTokenBalance,
    checkTokenAllowance, 
    approveToken,
    waitForTransaction,
    buildSwapTransaction
  ]);

  // Execute swap on ReachSwap (mock implementation)
  const executeSwapOnReachSwap = useCallback(async (params: SwapParams): Promise<SwapResult> => {
    try {
      // Verify liquidity exists before attempting swap
      const routerInfo = await getRouterForPair(params.tokenIn, params.tokenOut);
      if (!routerInfo.pairExists) {
        throw new Error('No liquidity available for this pair on ReachSwap');
      }

      const { provider } = await getProviderAndSigner();
      if (!provider) throw new Error('No provider available');

      const walletAddress = localStorage.getItem('reachswap_wallet_address');
      if (!walletAddress) throw new Error('No wallet address found');

      const deadline = params.deadline || Math.floor(Date.now() / 1000) + 1200; // 20 minutes
      
      // Determine swap type and method
      const swapType = getSwapType(params.tokenIn, params.tokenOut);
      console.log(`🔄 ReachSwap ${swapType}: ${params.amountIn} ${params.tokenIn.symbol} → ${params.tokenOut.symbol}`);

      // Check input token fees for method selection
      const inputTokenFees = await detectInputTokenFees(params.tokenIn.address, swapType);
      const hasFeeOnTransfer = inputTokenFees.requiresSpecialHandling;

      // Get correct swap method
      const swapMethod = getSwapMethod(hasFeeOnTransfer, swapType);
      console.log(`🔄 ReachSwap method selected: ${swapMethod}`);

      // Calculate amounts based on swap type
      let amountInWei: string;
      let amountOutMinWei: string;
      let transactionValue = '0x0';

      if (swapType === 'ETH_FOR_TOKENS') {
        // LOOP → Token: amountIn is in LOOP (native)
        amountInWei = BigInt(parseFloat(params.amountIn) * Math.pow(10, 18)).toString();
        amountOutMinWei = hasFeeOnTransfer ? '1' : BigInt(parseFloat(params.amountOutMin) * Math.pow(10, params.tokenOut.decimals)).toString();
        transactionValue = '0x' + BigInt(amountInWei).toString(16);
      } else {
        // Token → LOOP or Token → Token
        amountInWei = BigInt(parseFloat(params.amountIn) * Math.pow(10, params.tokenIn.decimals)).toString();
        
        if (swapType === 'TOKENS_FOR_ETH') {
          // Token → LOOP: amountOutMin is in LOOP (18 decimals)
          amountOutMinWei = hasFeeOnTransfer ? '1' : BigInt(parseFloat(params.amountOutMin) * Math.pow(10, 18)).toString();
        } else {
          // Token → Token: amountOutMin is in output token decimals
          amountOutMinWei = hasFeeOnTransfer ? '1' : BigInt(parseFloat(params.amountOutMin) * Math.pow(10, params.tokenOut.decimals)).toString();
        }
      }

      // Enhanced balance verification for ReachSwap
      if (swapType !== 'ETH_FOR_TOKENS') {
        console.log('🔍 Performing ReachSwap balance verification...');
        
        const { balanceBig, balanceFormatted } = await checkTokenBalance(
          params.tokenIn.address, 
          walletAddress, 
          params.tokenIn.decimals,
          true
        );
        
        const requiredAmount = BigInt(amountInWei);

        if (balanceBig < requiredAmount) {
          const errorMsg = `Insufficient ${params.tokenIn.symbol} balance. Required: ${params.amountIn}, Available: ${balanceFormatted}`;
          console.error('❌ ReachSwap balance verification failed:', errorMsg);
          throw new Error(errorMsg);
        }

        // Check current allowance for ReachSwap router
        const currentAllowance = await checkTokenAllowance(
          params.tokenIn.address,
          walletAddress,
          REACHSWAP_CONTRACTS.ROUTER
        );

        const currentAllowanceBig = BigInt(currentAllowance);
        const requiredAllowance = hasFeeOnTransfer ? requiredAmount * BigInt(200) / BigInt(100) : requiredAmount;

        if (currentAllowanceBig < requiredAllowance) {
          console.log('🔐 Token approval required for ReachSwap router...');
          
          // Approve the required amount for ReachSwap
          const approvalTx = await approveToken(
            params.tokenIn.address,
            REACHSWAP_CONTRACTS.ROUTER,
            amountInWei,
            params.tokenIn.decimals,
            hasFeeOnTransfer ? 2.0 : 1.2
          );
          
          // Wait for approval to be confirmed
          const approvalConfirmed = await waitForTransaction(approvalTx, 60);
          if (!approvalConfirmed) {
            throw new Error('Token approval transaction failed or timed out');
          }

          // Additional wait to ensure blockchain state is updated
          await new Promise(resolve => setTimeout(resolve, 5000));

          console.log('✅ ReachSwap token approval confirmed');
        }
      }

      // Build transaction data for ReachSwap
      const txData = buildSwapTransaction(swapMethod, {
        amountIn: amountInWei,
        amountOutMin: amountOutMinWei,
        path: params.path,
        to: walletAddress,
        deadline
      });

      // Enhanced gas estimation for ReachSwap
      let gasLimit = '0x7A120'; // 500,000 default
      
      try {
        const gasEstimate = await provider.request({
          method: 'eth_estimateGas',
          params: [{
            from: walletAddress,
            to: REACHSWAP_CONTRACTS.ROUTER,
            data: txData,
            value: transactionValue
          }]
        });
        
        // Add 30% buffer to estimated gas
        const estimatedGas = parseInt(gasEstimate, 16);
        const bufferedGas = Math.floor(estimatedGas * 1.3);
        gasLimit = '0x' + bufferedGas.toString(16);
        
        console.log(`⛽ Estimated gas for ReachSwap swap: ${estimatedGas}, using: ${bufferedGas}`);
      } catch (gasError) {
        console.warn('Gas estimation failed for ReachSwap, using higher default:', gasError);
        gasLimit = '0xF4240'; // 1,000,000 gas for complex swaps
      }

      // Execute the ReachSwap transaction
      console.log(`🚀 Executing ReachSwap ${swapMethod} with value: ${transactionValue}`);
      
      const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: walletAddress,
          to: REACHSWAP_CONTRACTS.ROUTER,
          data: txData,
          value: transactionValue,
          gas: gasLimit
        }]
      });

      console.log(`✅ ReachSwap swap transaction sent (${swapMethod}): ${txHash}`);
      
      return {
        success: true,
        txHash,
        routerUsed: 'reachswap',
        amountOut: params.amountOutMin
      };

    } catch (error: any) {
      console.error('❌ ReachSwap swap error:', error);
      
      // Enhanced error analysis for ReachSwap
      let errorMessage = error.message || 'ReachSwap swap failed';
      
      if (error.message.includes('user rejected') || error.message.includes('User denied')) {
        errorMessage = 'Transaction was cancelled by user';
      } else if (error.message.includes('insufficient funds')) {
        errorMessage = 'Insufficient LOOP for gas fees';
      } else if (error.message.includes('transferFrom failed') || error.message.includes('TRANSFER_FROM_FAILED')) {
        errorMessage = 'Token transfer failed. Please check token approval and try again';
      } else if (error.message.includes('INSUFFICIENT_OUTPUT_AMOUNT')) {
        errorMessage = 'Insufficient output amount. Try increasing slippage tolerance';
      } else if (error.message.includes('execution reverted')) {
        errorMessage = 'Transaction failed. This may be due to slippage, insufficient liquidity, or network congestion';
      }
      
      return {
        success: false,
        error: errorMessage,
        routerUsed: 'reachswap'
      };
    }
  }, [
    getProviderAndSigner, 
    getRouterForPair, 
    getSwapType,
    getSwapMethod,
    detectInputTokenFees, 
    checkTokenBalance,
    checkTokenAllowance, 
    approveToken,
    waitForTransaction,
    buildSwapTransaction
  ]);

  // Main swap execution function
  const executeSwap = useCallback(async (params: SwapParams): Promise<SwapResult> => {
    setIsSwapping(true);
    setSwapError(null);

    try {
      console.log(`🚀 Executing swap via ${params.routerUsed.toUpperCase()}:`, params);

      let result: SwapResult;

      if (params.routerUsed === 'sphynx') {
        result = await executeSwapOnSphynx(params);
      } else {
        result = await executeSwapOnReachSwap(params);
      }

      if (!result.success) {
        setSwapError(result.error || 'Swap failed');
      }

      return result;
    } catch (error: any) {
      console.error('❌ Swap execution error:', error);
      const errorMessage = error.message || 'Swap execution failed';
      setSwapError(errorMessage);
      
      return {
        success: false,
        error: errorMessage,
        routerUsed: params.routerUsed
      };
    } finally {
      setIsSwapping(false);
    }
  }, [executeSwapOnSphynx, executeSwapOnReachSwap]);

  return {
    executeSwap,
    isSwapping,
    swapError
  };
};