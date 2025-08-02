  // Enhanced Web3 utility functions with improved transaction handling for ReachSwap

  export interface ProviderAndSigner {
    provider: any;
    signer: any;
  }

  export interface TransactionReceipt {
    transactionHash: string;
    status: string;
    blockNumber: string;
    gasUsed: string;
  }

  // Get the current provider and signer
  export const getProviderAndSigner = async (): Promise<ProviderAndSigner> => {
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
  };

  // ENHANCED: Wait for transaction confirmation with detailed logging and timeout handling
  export const waitForTransaction = async (
    txHash: string, 
    maxAttempts: number = 60,
    intervalMs: number = 2000
  ): Promise<boolean> => {
    try {
      const { provider } = await getProviderAndSigner();
      if (!provider) throw new Error('No provider available');

      console.log(`⏳ Waiting for transaction confirmation: ${txHash}`);
      console.log(`📊 Parameters: maxAttempts=${maxAttempts}, interval=${intervalMs}ms`);

      for (let i = 0; i < maxAttempts; i++) {
        try {
          // Check transaction receipt
          const receipt = await provider.request({
            method: 'eth_getTransactionReceipt',
            params: [txHash]
          });

          if (receipt) {
            console.log(`📄 Transaction receipt received:`, {
              hash: receipt.transactionHash,
              status: receipt.status,
              blockNumber: receipt.blockNumber,
              gasUsed: receipt.gasUsed
            });

            if (receipt.status === '0x1') {
              console.log(`✅ Transaction confirmed successfully: ${txHash}`);
              return true;
            } else {
              console.error(`❌ Transaction failed: ${txHash}`);
              console.error(`📊 Receipt status: ${receipt.status}`);
              
              // Try to get revert reason
              try {
                const tx = await provider.request({
                  method: 'eth_getTransactionByHash',
                  params: [txHash]
                });
                console.error(`📋 Transaction details:`, tx);
              } catch (txError) {
                console.warn('Could not fetch transaction details:', txError);
              }
              
              return false;
            }
          }

          // Log progress every 10 attempts
          if (i % 10 === 0 || i < 5) {
            console.log(`⏳ Waiting for confirmation... (${i + 1}/${maxAttempts})`);
          }

        } catch (error) {
          // Continue waiting if receipt not available yet
          if (i % 20 === 0) {
            console.log(`⏳ Still waiting for transaction receipt... (${i + 1}/${maxAttempts})`);
          }
        }

        // Wait before next check
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }

      console.warn(`⚠️ Transaction confirmation timeout after ${maxAttempts * intervalMs / 1000}s: ${txHash}`);
      console.warn(`⚠️ This doesn't necessarily mean the transaction failed - it might still be processing`);
      
      // For ReachSwap, we'll be more lenient with timeouts since transactions might still succeed
      return true; // Assume success on timeout to avoid blocking UX
      
    } catch (error) {
      console.error('❌ Error waiting for transaction confirmation:', error);
      return false;
    }
  };

  // ENHANCED: Get transaction status with detailed information
  export const getTransactionStatus = async (txHash: string): Promise<{
    found: boolean;
    success?: boolean;
    receipt?: TransactionReceipt;
    error?: string;
  }> => {
    try {
      const { provider } = await getProviderAndSigner();
      if (!provider) {
        return { found: false, error: 'No provider available' };
      }

      const receipt = await provider.request({
        method: 'eth_getTransactionReceipt',
        params: [txHash]
      });

      if (!receipt) {
        return { found: false, error: 'Transaction not found or still pending' };
      }

      return {
        found: true,
        success: receipt.status === '0x1',
        receipt: {
          transactionHash: receipt.transactionHash,
          status: receipt.status,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed
        }
      };
    } catch (error) {
      return { 
        found: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  };

  // ENHANCED: Estimate gas with buffer and fallback
  export const estimateGasWithBuffer = async (
    txParams: {
      from: string;
      to: string;
      data: string;
      value?: string;
    },
    bufferMultiplier: number = 1.3  // Reduced from 1.5 to 1.3 for efficiency
  ): Promise<string> => {
    try {
      const { provider } = await getProviderAndSigner();
      if (!provider) throw new Error('No provider available');

      console.log('⛽ Estimating gas for transaction...');

      const gasEstimate = await provider.request({
        method: 'eth_estimateGas',
        params: [txParams]
      });

      const estimatedGas = parseInt(gasEstimate, 16);
      const bufferedGas = Math.floor(estimatedGas * bufferMultiplier);
      const gasLimitHex = '0x' + bufferedGas.toString(16);

      console.log(`⛽ Gas estimation: ${estimatedGas} → ${bufferedGas} (${bufferMultiplier}x buffer)`);

      return gasLimitHex;
    } catch (error) {
      console.warn('⚠️ Gas estimation failed:', error);
      
      // 🎯 BETTER: Smart fallback based on function signatures (your current approach but enhanced)
      const functionSig = txParams.data.slice(0, 10);
      
      if (functionSig === '0xe43b4ee2') {
        // removeLiquidityETH - use your successful transaction's gas
        console.log('⛽ Using fallback for removeLiquidityETH: 280k');
        return '0x44570'; // 280k gas (slightly more than your successful 270k)
      } else if (functionSig === '0x7fd4e7e5') {
        // addLiquidityETH
        console.log('⛽ Using fallback for addLiquidityETH: 320k');
        return '0x4E200'; // 320k gas
      } else if (functionSig === '0x095ea7b3') {
        // approve - matches your handleApproval pattern
        console.log('⛽ Using fallback for approve: 60k');
        return '0xEA60'; // 60k gas
      } else {
        // Generic fallback
        console.log('⛽ Using generic fallback gas: 250k');
        return '0x3D090'; // 250k gas
      }
    }
  };

  // ENHANCED: Check allowance with retry logic
  export const checkAllowance = async (
    tokenAddress: string,
    ownerAddress: string,
    spenderAddress: string,
    maxRetries: number = 5
  ): Promise<string> => {
    try {
      const { provider } = await getProviderAndSigner();
      if (!provider) throw new Error('No provider available');

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
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

          const allowance = result || '0x0';
          console.log(`🔍 Allowance check (attempt ${attempt}): ${BigInt(allowance).toString()}`);
          
          return allowance;
        } catch (error) {
          console.warn(`⚠️ Allowance check attempt ${attempt} failed:`, error);
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }
      
      throw new Error(`Failed to check allowance after ${maxRetries} attempts`);
    } catch (error) {
      console.error('❌ Error checking allowance:', error);
      throw error;
    }
  };

  // ENHANCED: Send transaction with comprehensive error handling
  export const sendTransaction = async (
    txParams: {
      from: string;
      to: string;
      data: string;
      gas?: string;
      value?: string;
    }
  ): Promise<string> => {
    try {
      const { provider } = await getProviderAndSigner();
      if (!provider) throw new Error('No provider available');

      console.log('🚀 Sending transaction...');

      // 🎯 ENHANCED: Auto-estimate gas if not provided (this already exists in your code)
      if (!txParams.gas) {
        console.log('⛽ Auto-estimating gas...');
        txParams.gas = await estimateGasWithBuffer(txParams);
      }

      const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [txParams]
      });

      console.log(`✅ Transaction sent successfully: ${txHash}`);
      return txHash;
    } catch (error) {
      console.error('❌ Error sending transaction:', error);
      throw error;
    }
  };

  // ENHANCED: Approve tokens with comprehensive handling
  export const approveToken = async (
    tokenAddress: string,
    spenderAddress: string,
    amount: string,
    ownerAddress: string
  ): Promise<string> => {
    try {
      console.log('🔐 Approving token...');
      console.log(`📊 Token: ${tokenAddress}`);
      console.log(`📊 Spender: ${spenderAddress}`);
      console.log(`📊 Amount: ${amount} (${BigInt(amount).toString()} wei)`);

      // Build approve transaction data
      const approveSignature = '0x095ea7b3'; // approve(address,uint256)
      const paddedSpender = spenderAddress.slice(2).padStart(64, '0');
      const paddedAmount = BigInt(amount).toString(16).padStart(64, '0');
      const data = approveSignature + paddedSpender + paddedAmount;

      const txParams = {
        from: ownerAddress,
        to: tokenAddress,
        data: data
      };

      const txHash = await sendTransaction(txParams);
      console.log(`✅ Approve transaction sent: ${txHash}`);

      return txHash;
    } catch (error) {
      console.error('❌ Error approving token:', error);
      throw error;
    }
  };

  // ENHANCED: Wait for allowance to be updated after approval
  export const waitForAllowanceUpdate = async (
    tokenAddress: string,
    ownerAddress: string,
    spenderAddress: string,
    expectedMinimum: string,
    maxAttempts: number = 30,
    intervalMs: number = 2000
  ): Promise<boolean> => {
    console.log('🔍 Waiting for allowance to update...');
    console.log(`📊 Expected minimum: ${BigInt(expectedMinimum).toString()}`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const currentAllowance = await checkAllowance(tokenAddress, ownerAddress, spenderAddress, 1);
        const allowanceBigInt = BigInt(currentAllowance);
        const expectedBigInt = BigInt(expectedMinimum);

        console.log(`🔍 Allowance check ${attempt}/${maxAttempts}:`);
        console.log(`   Current: ${allowanceBigInt.toString()}`);
        console.log(`   Required: ${expectedBigInt.toString()}`);
        console.log(`   Sufficient: ${allowanceBigInt >= expectedBigInt}`);

        if (allowanceBigInt >= expectedBigInt) {
          console.log('✅ Allowance successfully updated');
          return true;
        }

        if (attempt < maxAttempts) {
          console.log(`⏳ Waiting for allowance update... (${attempt}/${maxAttempts})`);
          await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
      } catch (error) {
        console.warn(`⚠️ Allowance check ${attempt} failed:`, error);
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
      }
    }

    console.error('❌ Allowance update timeout');
    return false;
  };

  // ENHANCED: Check token balance
  export const getTokenBalance = async (
    tokenAddress: string,
    accountAddress: string
  ): Promise<string> => {
    try {
      const { provider } = await getProviderAndSigner();
      if (!provider) throw new Error('No provider available');

      if (tokenAddress === '0x0000000000000000000000000000000000000000') {
        // Native ETH/LOOP balance
        const balance = await provider.request({
          method: 'eth_getBalance',
          params: [accountAddress, 'latest']
        });
        return balance;
      } else {
        // ERC20 token balance
        const balanceOfSignature = '0x70a08231'; // balanceOf(address)
        const paddedAccount = accountAddress.slice(2).padStart(64, '0');
        const data = balanceOfSignature + paddedAccount;

        const balance = await provider.request({
          method: 'eth_call',
          params: [{
            to: tokenAddress,
            data: data
          }, 'latest']
        });

        return balance || '0x0';
      }
    } catch (error) {
      console.error('Error getting token balance:', error);
      return '0x0';
    }
  };

  // ENHANCED: Get current wallet address with validation
  export const getWalletAddress = (): string | null => {
    const address = localStorage.getItem('reachswap_wallet_address');
    
    // Validate address format
    if (address && /^0x[a-fA-F0-9]{40}$/.test(address)) {
      return address;
    }
    
    return null;
  };

  // ENHANCED: Check if wallet is connected with full validation
  export const isWalletConnected = (): boolean => {
    const isConnected = localStorage.getItem('reachswap_wallet_connected') === 'true';
    const walletType = localStorage.getItem('reachswap_wallet_type');
    const walletAddress = getWalletAddress();
    
    return isConnected && !!walletType && !!walletAddress;
  };

  // ENHANCED: Get current network/chain ID
  export const getCurrentChainId = async (): Promise<string | null> => {
    try {
      const { provider } = await getProviderAndSigner();
      if (!provider) return null;

      const chainId = await provider.request({
        method: 'eth_chainId'
      });

      return chainId;
    } catch (error) {
      console.error('Error getting chain ID:', error);
      return null;
    }
  };

  // ENHANCED: Format error messages for user display
  export const formatUserError = (error: any): string => {
    if (!error) return 'Unknown error occurred';
    
    const message = error.message || error.toString();
    
    // Common error patterns and user-friendly messages
    const errorPatterns = [
      {
        pattern: /user denied|user rejected/i,
        message: 'Transaction was cancelled by user'
      },
      {
        pattern: /insufficient funds/i,
        message: 'Insufficient funds for this transaction'
      },
      {
        pattern: /gas required exceeds allowance|out of gas/i,
        message: 'Transaction requires more gas than available'
      },
      {
        pattern: /nonce too low|nonce too high/i,
        message: 'Transaction nonce issue - please refresh and try again'
      },
      {
        pattern: /allowance/i,
        message: 'Token allowance issue - please approve tokens first'
      },
      {
        pattern: /deadline/i,
        message: 'Transaction deadline expired - please try again'
      },
      {
        pattern: /slippage|insufficient.*amount/i,
        message: 'Price impact too high - adjust slippage tolerance'
      },
      {
        pattern: /transfer.*failed/i,
        message: 'Token transfer failed - check token contract'
      },
      {
        pattern: /pair.*not.*exist/i,
        message: 'Trading pair does not exist'
      },
      {
        pattern: /insufficient.*liquidity/i,
        message: 'Insufficient liquidity in pool'
      }
    ];

    for (const { pattern, message: userMessage } of errorPatterns) {
      if (pattern.test(message)) {
        return userMessage;
      }
    }

    // Return original message if no pattern matches, but clean it up
    return message
      .replace(/execution reverted:?\s*/i, '')
      .replace(/^Error:\s*/, '')
      .substring(0, 200); // Limit length
  };

  // ENHANCED: Retry mechanism for failed transactions
  export const retryTransaction = async (
    txFunction: () => Promise<string>,
    maxRetries: number = 3,
    delayMs: number = 2000
  ): Promise<string> => {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 Transaction attempt ${attempt}/${maxRetries}`);
        const txHash = await txFunction();
        console.log(`✅ Transaction succeeded on attempt ${attempt}: ${txHash}`);
        return txHash;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`⚠️ Transaction attempt ${attempt} failed:`, lastError.message);
        
        // Don't retry user-rejected transactions
        if (lastError.message.includes('denied') || lastError.message.includes('rejected')) {
          throw lastError;
        }
        
        if (attempt < maxRetries) {
          console.log(`⏳ Waiting ${delayMs}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }

    throw lastError || new Error('Transaction failed after all retries');
  };