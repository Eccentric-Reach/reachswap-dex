import React, { useEffect } from 'react';
import { X, AlertTriangle, ArrowDown, Clock, Zap } from 'lucide-react';
import { Token } from '../types';
import SwapMetricsDisplay from './SwapMetricsDisplay';
import { getTokenDisplayName } from '../utils/tokenUtils';

interface SwapConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  tokenIn: Token;
  tokenOut: Token;
  amountIn: string;
  amountOut: string;
  priceImpact: string;
  minimumReceived: string;
  slippage: string;
  gasPrice: string;
  isLoading?: boolean;
  swapMetrics?: any;
}

// Helper function to detect wrap/unwrap operations
const isWrapUnwrapPair = (tokenIn: Token, tokenOut: Token): 'wrap' | 'unwrap' | null => {
  const isNativeLOOP = (token: Token) => 
    token.address === '0x0000000000000000000000000000000000000000' || 
    token.symbol === 'LOOP';
  
  const isWLOOP = (token: Token) => 
    token.address.toLowerCase() === '0x3936D20a39eD4b0d44EaBfC91757B182f14A38d5'.toLowerCase() || 
    token.symbol === 'wLOOP';

  if (isNativeLOOP(tokenIn) && isWLOOP(tokenOut)) {
    return 'wrap';
  }
  
  if (isWLOOP(tokenIn) && isNativeLOOP(tokenOut)) {
    return 'unwrap';
  }
  
  return null;
};

const SwapConfirmModal: React.FC<SwapConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  tokenIn,
  tokenOut,
  amountIn,
  amountOut,
  priceImpact,
  minimumReceived,
  slippage,
  gasPrice,
  isLoading = false,
  swapMetrics
}) => {
  // Detect if this is a wrap/unwrap operation
  const wrapUnwrapMode = isWrapUnwrapPair(tokenIn, tokenOut);
  const isWrapUnwrap = wrapUnwrapMode !== null;

  // Handle click outside to close modal
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (isOpen && target.classList.contains('modal-backdrop')) {
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
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 modal-backdrop">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm max-h-[85vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isWrapUnwrap 
              ? `Confirm ${wrapUnwrapMode === 'wrap' ? 'Wrap' : 'Unwrap'}`
              : 'Confirm Swap'
            }
          </h3>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-4 space-y-4">
            {/* Swap Preview */}
            <div className="space-y-3">
              {/* From Token */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-600 flex items-center justify-center">
                      <img 
                        src={tokenIn.logoUrl} 
                        alt={tokenIn.symbol}
                        className="w-6 h-6 object-contain"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent) {
                            parent.className = 'w-8 h-8 bg-gradient-to-br from-orange-400 to-blue-500 rounded-full flex items-center justify-center';
                            parent.innerHTML = `<span class="text-white font-bold text-xs">${getTokenDisplayName(tokenIn).charAt(0)}</span>`;
                          }
                        }}
                      />
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white text-sm">
                        {getTokenDisplayName(tokenIn)}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {tokenIn.name}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold text-gray-900 dark:text-white">
                      {amountIn}
                    </div>
                    {/* Only show USD value for regular swaps, not wrap/unwrap */}
                    {!isWrapUnwrap && tokenIn.price && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        ~${(parseFloat(amountIn) * tokenIn.price).toFixed(2)}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Arrow */}
              <div className="flex justify-center">
                <div className="p-1.5 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                  <ArrowDown className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                </div>
              </div>

              {/* To Token */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-600 flex items-center justify-center">
                      <img 
                        src={tokenOut.logoUrl} 
                        alt={tokenOut.symbol}
                        className="w-6 h-6 object-contain"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent) {
                            parent.className = 'w-8 h-8 bg-gradient-to-br from-orange-400 to-blue-500 rounded-full flex items-center justify-center';
                            parent.innerHTML = `<span class="text-white font-bold text-xs">${getTokenDisplayName(tokenOut).charAt(0)}</span>`;
                          }
                        }}
                      />
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white text-sm">
                        {getTokenDisplayName(tokenOut)}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {tokenOut.name}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold text-gray-900 dark:text-white">
                      {amountOut}
                    </div>
                    {/* Only show USD value for regular swaps, not wrap/unwrap */}
                    {!isWrapUnwrap && tokenOut.price && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        ~${(parseFloat(amountOut) * tokenOut.price).toFixed(2)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Transaction Details - Completely separate logic for wrap/unwrap vs regular swaps */}
            {isWrapUnwrap ? (
              /* Clean Wrap/Unwrap Details - No AMM metrics */
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 space-y-2">
                <h4 className="font-medium text-gray-900 dark:text-white text-sm mb-2">
                  {wrapUnwrapMode === 'wrap' ? 'Wrap Details' : 'Unwrap Details'}
                </h4>
                
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600 dark:text-gray-400">Exchange Rate</span>
                    <span className="font-medium text-gray-900 dark:text-white">1:1</span>
                  </div>
                  
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600 dark:text-gray-400">You will receive</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {amountOut} {getTokenDisplayName(tokenOut)}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600 dark:text-gray-400">Network Fee</span>
                    <span className="font-medium text-gray-900 dark:text-white">~0.001 LOOP</span>
                  </div>
                  
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600 dark:text-gray-400">Operation</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {wrapUnwrapMode === 'wrap' ? 'wLOOP.deposit()' : 'wLOOP.withdraw()'}
                    </span>
                  </div>
                </div>
                
                <div className="mt-2 p-2 bg-blue-100 dark:bg-blue-800/30 rounded-lg">
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    {wrapUnwrapMode === 'wrap' 
                      ? 'Direct conversion of native LOOP to wLOOP tokens at 1:1 ratio.'
                      : 'Direct conversion of wLOOP tokens back to native LOOP at 1:1 ratio.'
                    }
                  </p>
                </div>
              </div>
            ) : (
              /* Regular Swap Metrics - Only for non-wrap/unwrap operations */
              <>
                {swapMetrics ? (
                  <SwapMetricsDisplay
                    metrics={swapMetrics}
                    tokenInSymbol={getTokenDisplayName(tokenIn)}
                    tokenOutSymbol={getTokenDisplayName(tokenOut)}
                    showPriceImpactWarning={true}
                    showRouterComparison={true}
                  />
                ) : (
                  /* Fallback Transaction Details for Regular Swaps */
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 space-y-2">
                    <h4 className="font-medium text-gray-900 dark:text-white text-sm mb-2">Transaction Details</h4>
                    
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-600 dark:text-gray-400">Exchange Rate</span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          1 {getTokenDisplayName(tokenIn)} = {(parseFloat(amountOut) / parseFloat(amountIn)).toFixed(6)} {getTokenDisplayName(tokenOut)}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-600 dark:text-gray-400">Price Impact</span>
                        <span className={`font-medium ${
                          parseFloat(priceImpact) > 5 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                        }`}>
                          {priceImpact}%
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-600 dark:text-gray-400">Minimum Received</span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {minimumReceived} {getTokenDisplayName(tokenOut)}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-600 dark:text-gray-400">Slippage Tolerance</span>
                        <span className="font-medium text-gray-900 dark:text-white">{slippage}%</span>
                      </div>
                      
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center space-x-1">
                          <span className="text-gray-600 dark:text-gray-400">Network Fee</span>
                          <Zap className="w-2.5 h-2.5 text-yellow-500" />
                        </div>
                        <span className="font-medium text-gray-900 dark:text-white">
                          ~${(parseFloat(gasPrice) * 0.000021 * 2000).toFixed(4)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* AMM Disclaimer - Only for regular swaps */}
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                  Output is estimated. You will receive at least {minimumReceived} {getTokenDisplayName(tokenOut)} or the transaction will revert.
                </p>
              </>
            )}
          </div>
        </div>

        {/* Fixed Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`w-full py-3 rounded-xl font-semibold transition-all duration-200 flex items-center justify-center space-x-2 ${
              isLoading
                ? 'bg-gray-400 dark:bg-gray-600 text-gray-200 cursor-not-allowed'
                : 'bg-gradient-to-r from-orange-500 to-blue-600 hover:from-orange-600 hover:to-blue-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
            }`}
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>
                  {isWrapUnwrap 
                    ? `${wrapUnwrapMode === 'wrap' ? 'Wrapping' : 'Unwrapping'}...`
                    : 'Swapping...'
                  }
                </span>
              </>
            ) : (
              <>
                <Clock className="w-4 h-4" />
                <span>
                  {isWrapUnwrap 
                    ? `Confirm ${wrapUnwrapMode === 'wrap' ? 'Wrap' : 'Unwrap'}`
                    : 'Confirm Swap'
                  }
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SwapConfirmModal;