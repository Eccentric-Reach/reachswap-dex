import React, { useState, useEffect, useCallback } from 'react';
import { X, Minus, AlertTriangle, Info, Zap, RefreshCcw } from 'lucide-react';
import { LiquidityPosition } from '../hooks/usePortfolioData';
import { REACHSWAP_CONTRACTS } from '../constants/reachswap';
import { useLiquidityManagement } from '../hooks/useLiquidityManagement';
import { 
  waitForTransaction, 
  checkAllowance, 
  approveToken, 
  formatUserError,
  retryTransaction
} from '../utils/web3Utils';

interface RemoveLiquidityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (position: LiquidityPosition, percentage: number) => void;
  position: LiquidityPosition | null;
  isLoading?: boolean;
}

interface RemovalState {
  step: 'input' | 'approving' | 'approved' | 'removing' | 'success' | 'error';
  approvalTxHash?: string;
  removalTxHash?: string;
  error?: string;
}

const RemoveLiquidityModal: React.FC<RemoveLiquidityModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  position,
}) => {
  // ALL STATE HOOKS FIRST
  const [removePercentage, setRemovePercentage] = useState('0');
  const [customPercentage, setCustomPercentage] = useState('');
  const [removalState, setRemovalState] = useState<RemovalState>({ step: 'input' });
  const [currentAllowance, setCurrentAllowance] = useState<string>('0');

  const {
    executeRemoveLiquidityETH,
    executeRemoveLiquidity,
  } = useLiquidityManagement();

  // CALCULATE DERIVED VALUES SAFELY
  const percentage = parseFloat(removePercentage);
  const lpTokensToRemove = position ? (parseFloat(position.lpTokenBalance) * percentage / 100) : 0;
  const lpTokensToRemoveWei = (lpTokensToRemove * Math.pow(10, 18)).toString();
  const valueToRemove = position ? (position.value * percentage / 100) : 0;
  
  // Calculate estimated token outputs (simplified calculation)
  const estimatedToken0 = lpTokensToRemove * 0.5;
  const estimatedToken1 = lpTokensToRemove * 0.5;
  
  const estimatedGasFee = '0.05'; // Mock gas fee
  const priceImpact = percentage > 50 ? '0.5' : '0.1'; // Mock price impact

  // Check if approval is needed
  const needsApproval = lpTokensToRemoveWei ? 
  BigInt(currentAllowance) < BigInt(lpTokensToRemoveWei) : 
  true;

  // ALL CALLBACK HOOKS NEXT
  const checkCurrentAllowance = useCallback(async () => {
    if (!position) return;

    try {
      const walletAddr = localStorage.getItem('reachswap_wallet_address');
      if (!walletAddr) return;

      console.log('🔍 Checking current LP token allowance...');
      const allowance = await checkAllowance(
        position.pairAddress,
        walletAddr,
        REACHSWAP_CONTRACTS.ROUTER
      );

      const allowanceBigInt = BigInt(allowance);
      setCurrentAllowance(allowanceBigInt.toString());
      
      console.log(`🔍 Current allowance: ${allowanceBigInt.toString()} wei (${(Number(allowanceBigInt) / 1e18).toFixed(6)} LP)`);
    } catch (error) {
      console.warn('Failed to check allowance:', error);
      setCurrentAllowance('0');
    }
  }, [position]);

  const handleApproval = useCallback(async () => {
    if (!position) return;

    try {
      const walletAddr = localStorage.getItem('reachswap_wallet_address');
      if (!walletAddr) throw new Error('No wallet address found');

      setRemovalState({ step: 'approving' });

      console.log('🔐 Starting MAX LP token approval...');

      // 🎯 SIMPLE FIX: Just approve maximum amount
      const maxApproval = '115792089237316195423570985008687907853269984665640564039457584007913129639935'; // type(uint256).max

      const approvalTxHash = await retryTransaction(
        () => approveToken(
          position.pairAddress,
          REACHSWAP_CONTRACTS.ROUTER,
          maxApproval,
          walletAddr
        ),
        3
      );

      setRemovalState({ 
        step: 'approving', 
        approvalTxHash 
      });

      // Wait for approval transaction to be mined
      console.log('⏳ Waiting for approval transaction to be mined...');
      const approvalSuccess = await waitForTransaction(approvalTxHash);

      if (!approvalSuccess) {
        throw new Error('Approval transaction failed');
      }

      // Update current allowance
      await checkCurrentAllowance();

      setRemovalState({ 
        step: 'approved', 
        approvalTxHash 
      });

      console.log('✅ MAX LP token approval completed successfully');

    } catch (error) {
      console.error('❌ Approval failed:', error);
      const userError = formatUserError(error);
      setRemovalState({ 
        step: 'error', 
        error: `Approval failed: ${userError}` 
      });
    }
  }, [position, checkCurrentAllowance]);

  const handleRemoveLiquidity = useCallback(async () => {
    if (!position || !lpTokensToRemoveWei || percentage <= 0) return;

    try {
      const walletAddr = localStorage.getItem('reachswap_wallet_address');
      if (!walletAddr) throw new Error('No wallet address found');

      setRemovalState(prev => ({ ...prev, step: 'removing' }));

      console.log('🔥 Starting liquidity removal process...');

      // 🔥 CRITICAL FIX 1: Check LP balance BEFORE transfer
      // Get provider using the same pattern as your existing code
      const savedWalletType = localStorage.getItem('reachswap_wallet_type');
      let provider;
      
      if (savedWalletType === 'MetaMask' && (window as any).ethereum?.isMetaMask) {
        provider = (window as any).ethereum;
      } else if (savedWalletType === 'OKX Wallet' && (window as any).okxwallet) {
        provider = (window as any).okxwallet;
      }
      
      if (!provider) throw new Error('No provider available');

      // Check user's LP balance
      const balanceOfSignature = '0x70a08231';
      const paddedUser = walletAddr.slice(2).padStart(64, '0');
      const balanceData = balanceOfSignature + paddedUser;

      const lpBalanceResult = await provider.request({
        method: 'eth_call',
        params: [{
          to: position.pairAddress,
          data: balanceData
        }, 'latest']
      });

      const userLPBalance = BigInt(lpBalanceResult);
      const requiredLP = BigInt(lpTokensToRemoveWei);

      console.log(`💰 User LP Balance: ${userLPBalance.toString()}`);
      console.log(`💰 Required LP: ${requiredLP.toString()}`);

      if (userLPBalance < requiredLP) {
        throw new Error(`Insufficient LP tokens: have ${userLPBalance.toString()}, need ${requiredLP.toString()}`);
      }

      // 🔥 CRITICAL FIX 2: Proper LP token approval for router
      console.log('🔐 Checking/Setting LP token approval...');
      
      const allowanceSignature = '0xdd62ed3e';
      const allowanceData = allowanceSignature + 
        walletAddr.slice(2).padStart(64, '0') + 
        REACHSWAP_CONTRACTS.ROUTER.slice(2).padStart(64, '0');

      const allowanceResult = await provider.request({
        method: 'eth_call',
        params: [{
          to: position.pairAddress,
          data: allowanceData
        }, 'latest']
      });

      const currentAllowance = BigInt(allowanceResult);
      console.log(`🔐 Current allowance: ${currentAllowance.toString()}`);

      if (currentAllowance < requiredLP) {
        console.log('🔐 Approving LP tokens for router...');
        
        // Approve LP tokens for router
        const approveSignature = '0x095ea7b3';
        const maxApproval = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
        const approveData = approveSignature + 
          REACHSWAP_CONTRACTS.ROUTER.slice(2).padStart(64, '0') + 
          maxApproval;

        const approveTx = await provider.request({
          method: 'eth_sendTransaction',
          params: [{
            from: walletAddr,
            to: position.pairAddress,
            data: approveData,
            gas: '0x15F90' // 90,000 gas for approval
          }]
        });

        console.log(`🔐 Approval transaction: ${approveTx}`);
        
        // Wait for approval
        const approvalSuccess = await waitForTransaction(approveTx);
        if (!approvalSuccess) {
          throw new Error('LP token approval failed');
        }
      }

      // Determine if this is an ETH pair
      const isNativeLoop0 = position.token0.address === '0x0000000000000000000000000000000000000000';
      const isNativeLoop1 = position.token1.address === '0x0000000000000000000000000000000000000000';
      const isETHPair = isNativeLoop0 || isNativeLoop1;

      let removalTxHash: string;

      if (isETHPair) {
        // 🔥 CRITICAL FIX 3: Use correct parameters for ETH pairs
        const nonNativeToken = isNativeLoop0 ? position.token1 : position.token0;
        
        // Calculate minimums with slippage (5% slippage)
        const tokenAmountMin = "0.001";  // Very low minimum for any token
        const ethAmountMin = "0.001";    // Very low minimum for LOOP/ETH
        
        console.log(`🔥 Using MINIMAL slippage protection (for testing):`);
        console.log(`   Token: ${nonNativeToken.symbol}`);
        console.log(`   Liquidity: ${lpTokensToRemove.toFixed(6)}`);
        console.log(`   Token Min: ${tokenAmountMin} (MINIMAL)`);
        console.log(`   ETH Min: ${ethAmountMin} (MINIMAL)`);

        removalTxHash = await executeRemoveLiquidityETH(
          nonNativeToken,
          lpTokensToRemove.toFixed(6),
          tokenAmountMin,  // ← MINIMAL minimum
          ethAmountMin,    // ← MINIMAL minimum
          walletAddr
        );
      } else {
        // Use hook's executeRemoveLiquidity for token-token pairs
        const amount0Min = (estimatedToken0 * 0.95).toFixed(6);
        const amount1Min = (estimatedToken1 * 0.95).toFixed(6);

        removalTxHash = await executeRemoveLiquidity(
          position.token0,
          position.token1,
          lpTokensToRemove.toFixed(6), // 🔥 FIX: Use decimal amount, not wei
          amount0Min,
          amount1Min,
          walletAddr
        );
      }

      setRemovalState(prev => ({ 
        ...prev, 
        removalTxHash 
      }));

      // Wait for removal transaction
      console.log('⏳ Waiting for removal transaction to be mined...');
      const removalSuccess = await waitForTransaction(removalTxHash);

      if (!removalSuccess) {
        throw new Error('Liquidity removal transaction failed');
      }

      setRemovalState({ 
        step: 'success', 
        approvalTxHash: removalState.approvalTxHash,
        removalTxHash 
      });

      console.log('🎉 Liquidity removal completed successfully!');

      // Call parent callback after short delay
      setTimeout(() => {
        onConfirm(position, percentage);
      }, 2000);

    } catch (error) {
      console.error('❌ Liquidity removal failed:', error);
      const userError = formatUserError(error);
      setRemovalState(prev => ({ 
        ...prev,
        step: 'error', 
        error: `Removal failed: ${userError}` 
      }));
    }
  }, [
    position, 
    lpTokensToRemoveWei, 
    percentage, 
    removalState.approvalTxHash, 
    onConfirm, 
    executeRemoveLiquidityETH,
    executeRemoveLiquidity,
    estimatedToken0,
    estimatedToken1,
    lpTokensToRemove
  ]);

  // ALL EFFECT HOOKS NEXT
  useEffect(() => {
    if (!isOpen) {
      setRemovePercentage('0');
      setCustomPercentage('');
      setRemovalState({ step: 'input' });
      setCurrentAllowance('0');
    } else if (isOpen && position) {
      // Check current allowance when modal opens
      checkCurrentAllowance();
    }
  }, [isOpen, position, checkCurrentAllowance]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (isOpen && target.classList.contains('modal-backdrop') && removalState.step === 'input') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose, removalState.step]);

  // EARLY RETURNS AFTER ALL HOOKS
  console.log('🚀 RemoveLiquidityModal render:', { isOpen, position: position?.pair || 'null' });
  
  if (!isOpen) {
    console.log('❌ RemoveLiquidityModal closed - returning null');
    return null;
  }
  
  if (!position) {
    console.log('⚠️ RemoveLiquidityModal no position - showing loading');
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm p-6">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Loading pool data...</p>
          </div>
        </div>
      </div>
    );
  }

  // EVENT HANDLERS
  const handlePercentageSelect = (percent: string) => {
    if (removalState.step !== 'input') return;
    setRemovePercentage(percent);
    setCustomPercentage('');
  };

  const handleCustomPercentageChange = (value: string) => {
    if (removalState.step !== 'input') return;
    const numValue = parseFloat(value);
    if (numValue >= 0 && numValue <= 100) {
      setCustomPercentage(value);
      setRemovePercentage(value);
    }
  };

  const handleSliderChange = (value: string) => {
    if (removalState.step !== 'input') return;
    setRemovePercentage(value);
    setCustomPercentage('');
  };

  // Main action handler based on current state
  const handleMainAction = () => {
    if (removalState.step === 'input' && needsApproval) {
      handleApproval();
    } else if (removalState.step === 'input' && !needsApproval) {
      handleRemoveLiquidity();
    } else if (removalState.step === 'approved') {
      handleRemoveLiquidity();
    } else if (removalState.step === 'error') {
      // Reset to input state to allow retry
      setRemovalState({ step: 'input' });
      checkCurrentAllowance(); // Refresh allowance
    }
  };

  // Get appropriate button text and state
  const getButtonConfig = () => {
    switch (removalState.step) {
      case 'input':
        if (percentage <= 0) {
          return { text: 'Enter Amount', disabled: true, color: 'gray' };
        }
        if (needsApproval) {
          return { text: 'Approve LP Tokens', disabled: false, color: 'blue' };
        }
        return { text: 'Remove Liquidity', disabled: false, color: 'red' };
      
      case 'approving':
        return { text: 'Approving...', disabled: true, color: 'blue' };
      
      case 'approved':
        return { text: 'Remove Liquidity', disabled: false, color: 'red' };
      
      case 'removing':
        return { text: 'Removing...', disabled: true, color: 'red' };
      
      case 'success':
        return { text: 'Success!', disabled: true, color: 'green' };
      
      case 'error':
        return { text: 'Try Again', disabled: false, color: 'orange' };
      
      default:
        return { text: 'Remove', disabled: true, color: 'gray' };
    }
  };

  const buttonConfig = getButtonConfig();
  const canConfirm = percentage > 0 && percentage <= 100 && !buttonConfig.disabled;
  const isHighPercentage = percentage > 75;
  const showProgress = ['approving', 'removing'].includes(removalState.step);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 modal-backdrop">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Remove Liquidity
          </h3>
          <button
            onClick={onClose}
            disabled={showProgress}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Rest of the component JSX remains the same... */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-4 space-y-4">
            {/* Pool Information */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-3">
                  <div className="flex items-center -space-x-1">
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-600 flex items-center justify-center border-2 border-white dark:border-gray-700">
                      <img 
                        src={position.token0.logoUrl} 
                        alt={position.token0.symbol}
                        className="w-6 h-6 object-contain"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent) {
                            parent.className = 'w-8 h-8 bg-gradient-to-br from-orange-400 to-blue-500 rounded-full flex items-center justify-center border-2 border-white dark:border-gray-700';
                            parent.innerHTML = `<span class="text-white font-bold text-xs">${position.token0.symbol.charAt(0)}</span>`;
                          }
                        }}
                      />
                    </div>
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-600 flex items-center justify-center border-2 border-white dark:border-gray-700">
                      <img 
                        src={position.token1.logoUrl} 
                        alt={position.token1.symbol}
                        className="w-6 h-6 object-contain"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent) {
                            parent.className = 'w-8 h-8 bg-gradient-to-br from-orange-400 to-blue-500 rounded-full flex items-center justify-center border-2 border-white dark:border-gray-700';
                            parent.innerHTML = `<span class="text-white font-bold text-xs">${position.token1.symbol.charAt(0)}</span>`;
                          }
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-white">
                      {position.pair}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      Pool Position
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-gray-900 dark:text-white">
                    {position.lpTokenBalance} LP
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    ${position.value.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>

            {/* Process Status */}
            {removalState.step !== 'input' && (
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
                <div className="space-y-3">
                  <h4 className="font-medium text-gray-900 dark:text-white text-sm">
                    Removal Progress
                  </h4>
                  
                  {/* Step 1: Approval */}
                  <div className="flex items-center space-x-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      removalState.step === 'approving' ? 'bg-blue-500 text-white' :
                      ['approved', 'removing', 'success'].includes(removalState.step) ? 'bg-green-500 text-white' :
                      removalState.step === 'error' ? 'bg-red-500 text-white' :
                      'bg-gray-300 text-gray-600'
                    }`}>
                      {removalState.step === 'approving' ? <RefreshCcw className="w-3 h-3 animate-spin" /> :
                       ['approved', 'removing', 'success'].includes(removalState.step) ? '✓' :
                       removalState.step === 'error' ? '✗' : '1'}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        Approve LP Tokens
                      </div>
                      {removalState.approvalTxHash && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          Tx: {removalState.approvalTxHash.slice(0, 10)}...
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Step 2: Removal */}
                  <div className="flex items-center space-x-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      removalState.step === 'removing' ? 'bg-blue-500 text-white' :
                      removalState.step === 'success' ? 'bg-green-500 text-white' :
                      removalState.step === 'error' ? 'bg-red-500 text-white' :
                      'bg-gray-300 text-gray-600'
                    }`}>
                      {removalState.step === 'removing' ? <RefreshCcw className="w-3 h-3 animate-spin" /> :
                       removalState.step === 'success' ? '✓' :
                       removalState.step === 'error' ? '✗' : '2'}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        Remove Liquidity
                      </div>
                      {removalState.removalTxHash && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          Tx: {removalState.removalTxHash.slice(0, 10)}...
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Error Display */}
                {removalState.error && (
                  <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                    <div className="flex items-start space-x-2">
                      <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-red-700 dark:text-red-400">
                        {removalState.error}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Remove Amount Selection - Only show in input state */}
            {removalState.step === 'input' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-gray-900 dark:text-white">
                    Amount to Remove
                  </h4>
                  <span className="text-lg font-semibold text-gray-900 dark:text-white">
                    {removePercentage}%
                  </span>
                </div>

                {/* Percentage Buttons */}
                <div className="grid grid-cols-4 gap-2">
                  {['25', '50', '75', '100'].map((percent) => (
                    <button
                      key={percent}
                      onClick={() => handlePercentageSelect(percent)}
                      disabled={showProgress}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                        removePercentage === percent && !customPercentage
                          ? 'bg-red-500 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {percent}%
                    </button>
                  ))}
                </div>

                {/* Slider */}
                <div className="space-y-2">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={removePercentage}
                    onChange={(e) => handleSliderChange(e.target.value)}
                    disabled={showProgress}
                    className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer slider disabled:opacity-50"
                  />
                </div>

                {/* Custom Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Custom Percentage
                  </label>
                  <input
                    type="number"
                    placeholder="Enter percentage (0-100)"
                    value={customPercentage}
                    onChange={(e) => handleCustomPercentageChange(e.target.value)}
                    disabled={showProgress}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-red-500 focus:border-transparent disabled:opacity-50"
                    min="0"
                    max="100"
                    step="0.1"
                  />
                </div>
              </div>
            )}

            {/* Estimated Outputs */}
            {percentage > 0 && (
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 space-y-3">
                <h4 className="font-medium text-gray-900 dark:text-white text-sm">
                  You will receive:
                </h4>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center space-x-2">
                      <div className="w-5 h-5 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-600 flex items-center justify-center">
                        <img 
                          src={position.token0.logoUrl} 
                          alt={position.token0.symbol}
                          className="w-4 h-4 object-contain"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            const parent = target.parentElement;
                            if (parent) {
                              parent.className = 'w-5 h-5 bg-gradient-to-br from-orange-400 to-blue-500 rounded-full flex items-center justify-center';
                              parent.innerHTML = `<span class="text-white font-bold text-xs">${position.token0.symbol.charAt(0)}</span>`;
                            }
                          }}
                        />
                      </div>
                      <span className="text-gray-600 dark:text-gray-400">
                        {position.token0.symbol}
                      </span>
                    </div>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {estimatedToken0.toFixed(6)}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center space-x-2">
                      <div className="w-5 h-5 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-600 flex items-center justify-center">
                        <img 
                          src={position.token1.logoUrl} 
                          alt={position.token1.symbol}
                          className="w-4 h-4 object-contain"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            const parent = target.parentElement;
                            if (parent) {
                              parent.className = 'w-5 h-5 bg-gradient-to-br from-orange-400 to-blue-500 rounded-full flex items-center justify-center';
                              parent.innerHTML = `<span class="text-white font-bold text-xs">${position.token1.symbol.charAt(0)}</span>`;
                            }
                          }}
                        />
                      </div>
                      <span className="text-gray-600 dark:text-gray-400">
                        {position.token1.symbol}
                      </span>
                    </div>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {estimatedToken1.toFixed(6)}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-blue-200 dark:border-blue-800 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600 dark:text-gray-400">LP Tokens to Remove</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {lpTokensToRemove.toFixed(6)}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600 dark:text-gray-400">Total Value</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      ${valueToRemove.toFixed(2)}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600 dark:text-gray-400">Price Impact</span>
                    <span className={`font-medium ${
                      parseFloat(priceImpact) > 0.3 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                    }`}>
                      {priceImpact}%
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-1">
                      <span className="text-gray-600 dark:text-gray-400">Network Fee</span>
                      <Zap className="w-2.5 h-2.5 text-yellow-500" />
                    </div>
                    <span className="font-medium text-gray-900 dark:text-white">
                      ~${estimatedGasFee}
                    </span>
                  </div>
                  
                  {/* Approval Status */}
                  {removalState.step === 'input' && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-600 dark:text-gray-400">Approval Status</span>
                      <span className={`font-medium ${
                        needsApproval ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'
                      }`}>
                        {needsApproval ? 'Approval Required' : 'Already Approved'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* High Percentage Warning */}
            {isHighPercentage && removalState.step === 'input' && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-3 border border-yellow-200 dark:border-yellow-800">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-500" />
                  <div>
                    <p className="text-xs font-medium text-yellow-700 dark:text-yellow-400">
                      High Removal Percentage
                    </p>
                    <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-0.5">
                      Removing {removePercentage}% will significantly reduce your position and potential rewards.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Info Box */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3">
              <div className="flex items-start space-x-2">
                <Info className="w-3 h-3 text-gray-500 mt-0.5" />
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  <p className="font-medium mb-1">Liquidity Removal Process</p>
                  <p>
                    {needsApproval && removalState.step === 'input' 
                      ? 'First approve your LP tokens, then remove liquidity. This process requires two transactions.'
                      : 'Removing liquidity will burn your LP tokens and return the underlying tokens to your wallet. You will stop earning fees on the removed portion.'
                    }
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Fixed Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex space-x-3 flex-shrink-0">
          <button
            onClick={onClose}
            disabled={showProgress}
            className="flex-1 py-3 px-4 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-xl transition-colors disabled:opacity-50"
          >
            {removalState.step === 'success' ? 'Close' : 'Cancel'}
          </button>
          
          <button
            onClick={handleMainAction}
            disabled={!canConfirm}
            className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-all duration-200 flex items-center justify-center space-x-2 ${
              !canConfirm
                ? 'bg-gray-400 dark:bg-gray-600 text-gray-200 cursor-not-allowed'
                : buttonConfig.color === 'blue'
                ? 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
                : buttonConfig.color === 'red'
                ? 'bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-600 hover:to-orange-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
                : buttonConfig.color === 'green'
                ? 'bg-gradient-to-r from-green-500 to-green-600 text-white'
                : buttonConfig.color === 'orange'
                ? 'bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
                : 'bg-gray-400 dark:bg-gray-600 text-gray-200 cursor-not-allowed'
            }`}
          >
            {showProgress ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>{buttonConfig.text}</span>
              </>
            ) : (
              <>
                {removalState.step === 'success' ? (
                  <span>✅ {buttonConfig.text}</span>
                ) : (
                  <>
                    <Minus className="w-4 h-4" />
                    <span>{buttonConfig.text}</span>
                  </>
                )}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Custom Slider Styles */}
      <style>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #ef4444;
          cursor: pointer;
          border: 2px solid #ffffff;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        .slider::-moz-range-thumb {
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #ef4444;
          cursor: pointer;
          border: 2px solid #ffffff;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
      `}</style>
    </div>
  );
};

export default RemoveLiquidityModal;
