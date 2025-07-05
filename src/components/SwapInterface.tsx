import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { ArrowUpDown, Settings, RefreshCcw, AlertCircle } from 'lucide-react';
import { Token } from '../types';
import { TOKENS } from '../constants/tokens';
import { useTokenBalances } from '../hooks/useTokenBalances';
import { useOptimizedSwapMetrics } from '../hooks/useOptimizedSwapMetrics';
import { useBidirectionalSwap } from '../hooks/useBidirectionalSwap';
import { useSwapExecution } from '../hooks/useSwapExecution';
import { useDebounce } from '../hooks/useDebounce';
import { useInstantEstimate } from '../hooks/useInstantEstimate';
import { useOptimizedMulticall } from '../hooks/useOptimizedMulticall';
import { normalizeToken, isValidToken, getTokenDisplayName, getTokenLogoUrl } from '../utils/tokenUtils';
import TokenModal from './TokenModal';
import SwapConfirmModal from './SwapConfirmModal';
import SwapSettingsModal from './SwapSettingsModal';
import SwapMetricsDisplay from './SwapMetricsDisplay';
import { LoadingState, SwapLoading } from './LoadingStates';

interface SwapInterfaceProps {
  isWalletConnected: boolean;
  onConnectWallet: () => void;
}

const SwapInterface: React.FC<SwapInterfaceProps> = ({ isWalletConnected, onConnectWallet }) => {
  // Swap state
  const [tokenIn, setTokenIn] = useState<Token>(TOKENS.LOOP);
  const [tokenOut, setTokenOut] = useState<Token>(TOKENS.GIKO);
  const [amountIn, setAmountIn] = useState('');
  const [amountOut, setAmountOut] = useState('');
  const [lastEditedField, setLastEditedField] = useState<'in' | 'out'>('in'); // Track which field was edited last
  const [isTokenInModalOpen, setIsTokenInModalOpen] = useState(false);
  const [isTokenOutModalOpen, setIsTokenOutModalOpen] = useState(false);
  const [isSwapConfirmModalOpen, setIsSwapConfirmModalOpen] = useState(false);
  const [isSwapSettingsModalOpen, setIsSwapSettingsModalOpen] = useState(false);
  
  // Settings state
  const [slippage, setSlippage] = useState('0.5');
  const [gasPrice, setGasPrice] = useState('10');
  const [expertMode, setExpertMode] = useState(false);
  
  // Swap metrics state
  const [swapMetrics, setSwapMetrics] = useState<any>(null);
  
  // Loading states
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [swapStage, setSwapStage] = useState<'route' | 'quote' | 'approval' | 'swap'>('route');
  const [swapProgress, setSwapProgress] = useState(0);
  
  // Debounced amounts for performance optimization
  const debouncedAmountIn = useDebounce(amountIn, 200);
  const debouncedAmountOut = useDebounce(amountOut, 200);
  
  // Hooks
  const walletAddress = localStorage.getItem('reachswap_wallet_address');
  const { getTokenBalance, fetchBalanceForToken } = useTokenBalances(isWalletConnected, walletAddress || undefined);
  const { calculateSwapMetrics, isCalculating, metricsError, clearError } = useOptimizedSwapMetrics();
  const { calculateForwardQuote, calculateReverseQuote } = useBidirectionalSwap();
  const { executeSwap, isSwapping, swapError } = useSwapExecution();
  const { calculateInstantEstimate, getInstantEstimate, clearEstimate } = useInstantEstimate();
  const { batchTokenData, clearCache } = useOptimizedMulticall();

  // Memoized dependencies for swap metrics calculation
  const swapDependencies = useMemo(() => ({
    tokenInAddress: tokenIn.address,
    tokenOutAddress: tokenOut.address,
    debouncedAmountIn: lastEditedField === 'in' ? debouncedAmountIn : '',
    debouncedAmountOut: lastEditedField === 'out' ? debouncedAmountOut : '',
    slippage: parseFloat(slippage),
    lastEditedField
  }), [tokenIn.address, tokenOut.address, debouncedAmountIn, debouncedAmountOut, slippage, lastEditedField]);

  // Optimized token data fetching with batching
  const fetchTokenDataOptimized = useCallback(async (tokens: Token[]) => {
    if (!isWalletConnected || !walletAddress) return;

    try {
      const tokenAddresses = tokens.map(token => token.address);
      await batchTokenData(tokenAddresses, walletAddress);
    } catch (error) {
      console.error('Error fetching optimized token data:', error);
    }
  }, [isWalletConnected, walletAddress, batchTokenData]);

  // CRITICAL FIX: Calculate safe max amount with proper buffer
  const calculateSafeMaxAmount = useCallback((token: Token, balance: string): string => {
    try {
      const balanceNum = parseFloat(balance);
      if (balanceNum <= 0) return '0';

      // CRITICAL FIX: Apply buffer based on token type and decimals
      let buffer = 0;
      
      if (token.address === '0x0000000000000000000000000000000000000000') {
        // Native LOOP: Reserve gas for transaction (0.001 LOOP minimum)
        buffer = 0.001;
      } else {
        // ERC-20 tokens: Apply precision buffer based on decimals
        if (token.decimals >= 18) {
          buffer = 0.000001; // 1 microtoken for 18+ decimals
        } else if (token.decimals >= 12) {
          buffer = 0.0001; // 0.1 millitoken for 12-17 decimals
        } else if (token.decimals >= 6) {
          buffer = 0.001; // 1 millitoken for 6-11 decimals
        } else {
          buffer = 0.01; // 1 centitoken for <6 decimals
        }
      }

      // Calculate safe max (balance - buffer)
      const safeMax = Math.max(0, balanceNum - buffer);
      
      // CRITICAL FIX: Round down to avoid precision issues
      const precision = Math.min(6, token.decimals); // Max 6 decimal places for display
      const roundedSafeMax = Math.floor(safeMax * Math.pow(10, precision)) / Math.pow(10, precision);
      
      console.log(`🔧 Safe max calculation for ${token.symbol}:
        Original Balance: ${balanceNum}
        Buffer Applied: ${buffer}
        Safe Max: ${roundedSafeMax}
        Precision: ${precision} decimals`);

      return roundedSafeMax.toFixed(precision);
    } catch (error) {
      console.error('Error calculating safe max amount:', error);
      return '0';
    }
  }, []);

  // Handle amount input change with bidirectional support
  const handleAmountInChange = useCallback((value: string) => {
    setAmountIn(value);
    setLastEditedField('in');
    clearError();
    
    // FIXED: Clear the other field when editing this one
    if (value !== amountIn) {
      setAmountOut('');
    }
    
    // Provide instant estimate for immediate feedback
    if (value && parseFloat(value) > 0) {
      const estimate = calculateInstantEstimate(tokenIn, tokenOut, value);
      setAmountOut(estimate);
    } else {
      clearEstimate();
      setAmountOut('');
    }
  }, [amountIn, tokenIn, tokenOut, calculateInstantEstimate, clearEstimate, clearError]);

  // FIXED: Handle amount output change with bidirectional support
  const handleAmountOutChange = useCallback((value: string) => {
    setAmountOut(value);
    setLastEditedField('out');
    clearError();
    
    // CRITICAL FIX: Clear the other field when editing this one - no temporary values
    if (value !== amountOut) {
      setAmountIn(''); // Keep blank until accurate calculation is ready
    }
    
    // CRITICAL FIX: Don't show any estimate until accurate reverse calculation is complete
    if (!value || parseFloat(value) <= 0) {
      clearEstimate();
      setAmountIn('');
    }
  }, [amountOut, clearEstimate, clearError]);

  // Update swap metrics with bidirectional support
  const updateSwapMetrics = useCallback(async () => {
    const inputAmount = lastEditedField === 'in' ? debouncedAmountIn : '';
    const outputAmount = lastEditedField === 'out' ? debouncedAmountOut : '';
    
    if ((!inputAmount || parseFloat(inputAmount) <= 0) && (!outputAmount || parseFloat(outputAmount) <= 0)) {
      setSwapMetrics(null);
      return;
    }

    if (!isValidToken(tokenIn) || !isValidToken(tokenOut)) {
      setSwapMetrics(null);
      return;
    }

    try {
      setSwapStage('route');
      setSwapProgress(20);
      
      setSwapStage('quote');
      setSwapProgress(60);
      
      let metrics;
      
      if (lastEditedField === 'in' && inputAmount) {
        // Forward calculation: From → To
        metrics = await calculateSwapMetrics(tokenIn, tokenOut, inputAmount, parseFloat(slippage));
        setAmountOut(metrics.amountOut);
      } else if (lastEditedField === 'out' && outputAmount) {
        // CRITICAL FIX: Reverse calculation only after liquidity verification
        const reverseQuote = await calculateReverseQuote(tokenIn, tokenOut, outputAmount);
        
        // CRITICAL FIX: Only set the input amount if we get a valid result
        if (reverseQuote.liquidityAvailable && reverseQuote.amountOut !== '0') {
          setAmountIn(reverseQuote.amountOut); // This is actually the required input amount
          
          // Create metrics object for reverse calculation
          metrics = {
            exchangeRate: (parseFloat(outputAmount) / parseFloat(reverseQuote.amountOut)).toFixed(6),
            priceImpact: reverseQuote.priceImpact,
            minimumReceived: outputAmount,
            slippageTolerance: parseFloat(slippage),
            routerUsed: reverseQuote.router,
            estimatedGas: reverseQuote.gasEstimate,
            hasFeeOnTransfer: false,
            path: reverseQuote.path,
            amountOut: outputAmount,
            liquidityAvailable: reverseQuote.liquidityAvailable
          };
        } else {
          // CRITICAL FIX: If no liquidity, keep input field blank
          setAmountIn('');
          metrics = null;
        }
      }
      
      setSwapMetrics(metrics);
      clearEstimate();
      setSwapProgress(100);
      
      // Reset progress after a short delay
      setTimeout(() => setSwapProgress(0), 500);
    } catch (error: any) {
      console.error('Error calculating swap metrics:', error);
      setSwapMetrics(null);
      // CRITICAL FIX: Clear input field on error to avoid showing inaccurate amounts
      if (lastEditedField === 'out') {
        setAmountIn('');
      }
    }
  }, [tokenIn, tokenOut, debouncedAmountIn, debouncedAmountOut, lastEditedField, slippage, calculateSwapMetrics, calculateReverseQuote, clearEstimate]);

  // Only trigger swap metrics calculation when debounced amounts or dependencies change
  useEffect(() => {
    updateSwapMetrics();
  }, [swapDependencies, updateSwapMetrics]);

  // Handle refresh functionality with optimized parallel execution
  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    
    setIsRefreshing(true);
    console.log('🔄 Refreshing swap panel...');
    
    try {
      setSwapMetrics(null);
      setAmountIn('');
      setAmountOut('');
      clearEstimate();
      clearError();
      clearCache();
      
      if (isWalletConnected && walletAddress) {
        // Batch fetch token data for better performance
        await fetchTokenDataOptimized([tokenIn, tokenOut]);
      }
      
      console.log('✅ Swap panel refreshed successfully');
    } catch (error) {
      console.error('❌ Error refreshing swap panel:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, isWalletConnected, walletAddress, tokenIn, tokenOut, fetchTokenDataOptimized, clearEstimate, clearError, clearCache]);

  // CRITICAL FIX: Enhanced MAX button with proper buffer and precision handling
  const handleMaxClick = useCallback(() => {
    if (!isWalletConnected || !isValidToken(tokenIn)) return;
    
    const balance = getTokenBalance(tokenIn);
    const balanceNum = parseFloat(balance);
    
    if (balanceNum <= 0) return;
    
    // CRITICAL FIX: Use safe max calculation with buffer
    const safeMaxAmount = calculateSafeMaxAmount(tokenIn, balance);
    
    console.log(`🔧 MAX button clicked for ${tokenIn.symbol}:
      Raw Balance: ${balance}
      Safe Max Amount: ${safeMaxAmount}`);
    
    if (parseFloat(safeMaxAmount) > 0) {
      handleAmountInChange(safeMaxAmount);
    }
  }, [isWalletConnected, tokenIn, getTokenBalance, calculateSafeMaxAmount, handleAmountInChange]);

  // CRITICAL FIX: Enhanced MAX button active state detection
  const isMaxActive = useCallback(() => {
    if (!isWalletConnected || !amountIn || !isValidToken(tokenIn)) return false;
    
    const balance = getTokenBalance(tokenIn);
    const safeMaxAmount = calculateSafeMaxAmount(tokenIn, balance);
    const inputAmount = parseFloat(amountIn);
    const maxAmount = parseFloat(safeMaxAmount);
    
    // Consider "max" if within 0.1% of the safe max amount
    const tolerance = maxAmount * 0.001; // 0.1% tolerance
    const isWithinTolerance = Math.abs(inputAmount - maxAmount) <= tolerance;
    
    return isWithinTolerance && maxAmount > 0;
  }, [isWalletConnected, amountIn, tokenIn, getTokenBalance, calculateSafeMaxAmount]);

  // Handle token swapping
  const handleSwapTokens = () => {
    const tempToken = tokenIn;
    setTokenIn(tokenOut);
    setTokenOut(tempToken);
    
    // Swap amounts as well
    const tempAmountIn = amountIn;
    setAmountIn(amountOut);
    setAmountOut(tempAmountIn);
    
    // Flip the last edited field
    setLastEditedField(lastEditedField === 'in' ? 'out' : 'in');
    
    setSwapMetrics(null);
    clearEstimate();
    clearError();
  };

  // Handle token selection with validation and normalization
  const handleTokenInSelect = (token: Token) => {
    try {
      if (!isValidToken(token)) {
        console.error('Invalid token selected for tokenIn:', token);
        alert('Invalid token selected. Please try again.');
        return;
      }
      
      const normalizedToken = normalizeToken(token);
      setTokenIn(normalizedToken);
      setIsTokenInModalOpen(false);
      
      setAmountIn('');
      setAmountOut('');
      setSwapMetrics(null);
      clearEstimate();
      clearError();
      
      if (isWalletConnected && walletAddress) {
        fetchTokenDataOptimized([normalizedToken]);
        fetchBalanceForToken(normalizedToken);
      }
    } catch (error) {
      console.error('Error selecting tokenIn:', error);
      alert('Error selecting token. Please try again.');
    }
  };

  const handleTokenOutSelect = (token: Token) => {
    try {
      if (!isValidToken(token)) {
        console.error('Invalid token selected for tokenOut:', token);
        alert('Invalid token selected. Please try again.');
        return;
      }
      
      const normalizedToken = normalizeToken(token);
      setTokenOut(normalizedToken);
      setIsTokenOutModalOpen(false);
      
      setAmountIn('');
      setAmountOut('');
      setSwapMetrics(null);
      clearEstimate();
      clearError();
      
      if (isWalletConnected && walletAddress) {
        fetchTokenDataOptimized([normalizedToken]);
        fetchBalanceForToken(normalizedToken);
      }
    } catch (error) {
      console.error('Error selecting tokenOut:', error);
      alert('Error selecting token. Please try again.');
    }
  };

  // Handle swap execution
  const handleSwap = async () => {
    if (!isWalletConnected || !amountIn || !amountOut || !swapMetrics) return;

    try {
      setSwapStage('approval');
      setSwapProgress(25);
      
      setSwapStage('swap');
      setSwapProgress(75);
      
      const result = await executeSwap({
        tokenIn,
        tokenOut,
        amountIn,
        amountOutMin: swapMetrics.minimumReceived,
        slippage,
        routerUsed: swapMetrics.routerUsed,
        path: swapMetrics.path || [tokenIn.address, tokenOut.address],
        hasFeeOnTransfer: swapMetrics.hasFeeOnTransfer
      });

      if (result.success) {
        setSwapProgress(100);
        setIsSwapConfirmModalOpen(false);
        setAmountIn('');
        setAmountOut('');
        setSwapMetrics(null);
        clearEstimate();
        
        // Refresh balances after successful swap
        setTimeout(() => {
          if (isValidToken(tokenIn)) fetchBalanceForToken(tokenIn);
          if (isValidToken(tokenOut)) fetchBalanceForToken(tokenOut);
        }, 2000);
        
        alert(`Swap completed! Transaction: ${result.txHash}`);
      } else {
        alert(`Swap failed: ${result.error}`);
      }
      
      // Reset progress
      setTimeout(() => setSwapProgress(0), 1000);
    } catch (error: any) {
      console.error('❌ Swap error:', error);
      alert(`Swap error: ${error.message}`);
      setSwapProgress(0);
    }
  };

  // Validation functions
  const getInsufficientBalanceError = (token: Token, amount: string) => {
    if (!isWalletConnected || !amount || !isValidToken(token)) return null;
    const balance = parseFloat(getTokenBalance(token));
    const inputAmount = parseFloat(amount);
    return inputAmount > balance ? 'Insufficient balance' : null;
  };

  const canSwap = () => {
    if (!isWalletConnected || !amountIn || !amountOut || !isValidToken(tokenIn) || !isValidToken(tokenOut)) return false;
    const insufficientBalance = getInsufficientBalanceError(tokenIn, amountIn);
    return !insufficientBalance && swapMetrics && !isCalculating;
  };

  const getSwapButtonText = () => {
    if (!isWalletConnected) return 'Connect Wallet';
    if (!amountIn) return 'Enter Amount';
    if (!isValidToken(tokenIn) || !isValidToken(tokenOut)) return 'Invalid Token';
    const insufficientBalance = getInsufficientBalanceError(tokenIn, amountIn);
    if (insufficientBalance) return insufficientBalance;
    if (isCalculating) return 'Calculating...';
    if (metricsError) return 'Try Again';
    if (!swapMetrics) return 'Enter Amount';
    return 'Swap';
  };

  // Safe token rendering helpers
  const renderTokenButton = (token: Token, onClick: () => void) => {
    const logoUrl = getTokenLogoUrl(token);
    const displayName = getTokenDisplayName(token);
    
    return (
      <button
        onClick={onClick}
        className="flex items-center space-x-2 bg-white dark:bg-gray-600 hover:bg-gray-50 dark:hover:bg-gray-500 rounded-lg px-3 py-2 transition-colors"
      >
        {logoUrl ? (
          <img 
            src={logoUrl} 
            alt={displayName}
            className="w-6 h-6 rounded-full"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              const parent = target.parentElement;
              if (parent) {
                parent.innerHTML = `<div class="w-6 h-6 bg-gradient-to-br from-orange-400 to-blue-500 rounded-full flex items-center justify-center"><span class="text-white font-bold text-xs">${displayName.charAt(0)}</span></div>` + parent.innerHTML.substring(parent.innerHTML.indexOf('</div>') + 6);
              }
            }}
          />
        ) : (
          <div className="w-6 h-6 bg-gradient-to-br from-orange-400 to-blue-500 rounded-full flex items-center justify-center">
            <span className="text-white font-bold text-xs">{displayName.charAt(0)}</span>
          </div>
        )}
        <span className="font-medium text-gray-900 dark:text-white">{displayName}</span>
      </button>
    );
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Swap
            </h2>
            <div className="flex items-center space-x-2">
              {/* Refresh Button */}
              <button
                onClick={handleRefresh}
                disabled={isRefreshing || isCalculating || isSwapping}
                className={`p-2 rounded-lg transition-all duration-200 group relative ${
                  isRefreshing || isCalculating || isSwapping
                    ? 'cursor-not-allowed text-gray-300 dark:text-gray-600'
                    : 'cursor-pointer text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                title="Refresh Swap Panel"
              >
                <RefreshCcw 
                  className={`w-5 h-5 transition-transform duration-300 ${
                    isRefreshing ? 'animate-spin' : 'group-hover:rotate-180'
                  }`} 
                />
              </button>
              
              {/* Settings Button */}
              <button
                onClick={() => setIsSwapSettingsModalOpen(true)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <Settings className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Loading State for Swap Calculation */}
          {isCalculating && swapProgress > 0 && (
            <SwapLoading stage={swapStage} progress={swapProgress} />
          )}

          {/* From Token */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">From</label>
              {isWalletConnected && isValidToken(tokenIn) && (
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Balance: {getTokenBalance(tokenIn)}
                  </span>
                  {parseFloat(getTokenBalance(tokenIn)) > 0 && (
                    <button
                      onClick={handleMaxClick}
                      className={`text-xs font-medium px-2 py-1 rounded transition-all duration-200 ${
                        isMaxActive()
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                          : 'text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 hover:underline cursor-pointer'
                      }`}
                      title={`Use safe maximum amount (with ${tokenIn.address === '0x0000000000000000000000000000000000000000' ? 'gas' : 'precision'} buffer)`}
                    >
                      MAX
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3">
              <div className="flex items-center justify-between">
                <input
                  type="number"
                  placeholder="0.0"
                  value={amountIn}
                  onChange={(e) => handleAmountInChange(e.target.value)}
                  className="bg-transparent text-2xl font-semibold text-gray-900 dark:text-white placeholder-gray-400 border-none outline-none flex-1"
                />
                {renderTokenButton(tokenIn, () => setIsTokenInModalOpen(true))}
              </div>
              {getInsufficientBalanceError(tokenIn, amountIn) && (
                <div className="mt-1 text-xs text-red-500">
                  {getInsufficientBalanceError(tokenIn, amountIn)}
                </div>
              )}
            </div>
          </div>

          {/* Swap Button */}
          <div className="flex justify-center">
            <button
              onClick={handleSwapTokens}
              className="p-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
            >
              <ArrowUpDown className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
          </div>

          {/* CRITICAL FIX: To Token - Always shows token info, never "Calculating best route" */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">To</label>
              {isWalletConnected && isValidToken(tokenOut) && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Balance: {getTokenBalance(tokenOut)}
                </span>
              )}
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 flex-1">
                  <input
                    type="number"
                    placeholder="0.0"
                    value={amountOut || getInstantEstimate()}
                    onChange={(e) => handleAmountOutChange(e.target.value)}
                    className="bg-transparent text-2xl font-semibold text-gray-900 dark:text-white placeholder-gray-400 border-none outline-none flex-1"
                  />
                  {(isCalculating || isRefreshing) && (
                    <LoadingState type="calculating" size="sm" />
                  )}
                  {getInstantEstimate() && !amountOut && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">~</span>
                  )}
                </div>
                {/* CRITICAL FIX: Always show token info, never replace with "Calculating best route" */}
                {renderTokenButton(tokenOut, () => setIsTokenOutModalOpen(true))}
              </div>
            </div>
          </div>

          {/* Swap Metrics */}
          {swapMetrics && (
            <SwapMetricsDisplay
              metrics={swapMetrics}
              tokenInSymbol={getTokenDisplayName(tokenIn)}
              tokenOutSymbol={getTokenDisplayName(tokenOut)}
            />
          )}

          {/* Error Display */}
          {metricsError && (
            <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3 border border-red-200 dark:border-red-800">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-red-500" />
                <div className="text-sm text-red-700 dark:text-red-300">
                  <p className="font-medium">Unable to get quote</p>
                  <p className="mt-1">{metricsError}</p>
                  <button
                    onClick={handleRefresh}
                    className="mt-2 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-sm font-medium hover:underline transition-colors"
                  >
                    Try Again
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Swap Execution Error */}
          {swapError && (
            <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3 border border-red-200 dark:border-red-800">
              <div className="text-sm text-red-700 dark:text-red-300">
                <p className="font-medium">Swap Error</p>
                <p className="mt-1">{swapError}</p>
              </div>
            </div>
          )}

          {/* Swap Button */}
          <button
            onClick={canSwap() ? () => setIsSwapConfirmModalOpen(true) : onConnectWallet}
            disabled={isSwapping || isCalculating || isRefreshing || (isWalletConnected && !canSwap())}
            className={`w-full py-4 rounded-xl font-semibold transition-all duration-200 ${
              isSwapping || isCalculating || isRefreshing
                ? 'bg-gray-400 dark:bg-gray-600 text-gray-200 cursor-not-allowed'
                : canSwap() || !isWalletConnected
                ? 'bg-gradient-to-r from-orange-500 to-blue-600 hover:from-orange-600 hover:to-blue-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
                : 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
            }`}
          >
            {isSwapping ? (
              <div className="flex items-center justify-center space-x-2">
                <LoadingState type="swapping" size="sm" />
              </div>
            ) : isRefreshing ? (
              <div className="flex items-center justify-center space-x-2">
                <LoadingState type="refreshing" size="sm" />
              </div>
            ) : (
              getSwapButtonText()
            )}
          </button>

          {/* CRITICAL FIX: Max Button Helper Tooltip */}
          {isMaxActive() && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2 border border-blue-200 dark:border-blue-800">
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-xs">ℹ</span>
                </div>
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  Using safe maximum amount with {tokenIn.address === '0x0000000000000000000000000000000000000000' ? 'gas reserve' : 'precision buffer'} to prevent transaction failures.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <TokenModal
        isOpen={isTokenInModalOpen}
        onClose={() => setIsTokenInModalOpen(false)}
        onSelectToken={handleTokenInSelect}
        selectedToken={tokenIn}
        title="Select Token to Swap From"
        isWalletConnected={isWalletConnected}
      />

      <TokenModal
        isOpen={isTokenOutModalOpen}
        onClose={() => setIsTokenOutModalOpen(false)}
        onSelectToken={handleTokenOutSelect}
        selectedToken={tokenOut}
        title="Select Token to Swap To"
        isWalletConnected={isWalletConnected}
      />

      <SwapConfirmModal
        isOpen={isSwapConfirmModalOpen}
        onClose={() => setIsSwapConfirmModalOpen(false)}
        onConfirm={handleSwap}
        tokenIn={tokenIn}
        tokenOut={tokenOut}
        amountIn={amountIn}
        amountOut={amountOut}
        priceImpact={swapMetrics?.priceImpact.toFixed(2) || '< 0.1'}
        minimumReceived={swapMetrics?.minimumReceived || '0'}
        slippage={slippage}
        gasPrice={gasPrice}
        isLoading={isSwapping}
        swapMetrics={swapMetrics}
      />

      <SwapSettingsModal
        isOpen={isSwapSettingsModalOpen}
        onClose={() => setIsSwapSettingsModalOpen(false)}
        slippage={slippage}
        onSlippageChange={setSlippage}
        gasPrice={gasPrice}
        onGasPriceChange={setGasPrice}
        expertMode={expertMode}
        onExpertModeChange={setExpertMode}
      />
    </div>
  );
};

export default SwapInterface;