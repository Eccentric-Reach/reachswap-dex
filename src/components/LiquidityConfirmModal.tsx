import React, { useEffect } from 'react';
import { X, Plus, Clock, Zap, Info } from 'lucide-react';
import { Token } from '../types';

interface LiquidityConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  token0: Token;
  token1: Token;
  amount0: string;
  amount1: string;
  poolShare: number;
  estimatedAPR: string;
  gasPrice: string;
  isLoading?: boolean;
}

const LiquidityConfirmModal: React.FC<LiquidityConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  token0,
  token1,
  amount0,
  amount1,
  poolShare,
  estimatedAPR,
  gasPrice,
  isLoading = false
}) => {
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

  const totalValue = (parseFloat(amount0) * (token0.price || 0)) + (parseFloat(amount1) * (token1.price || 0));
  const estimatedGasFee = (parseFloat(gasPrice) * 0.000021 * 2000).toFixed(4);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 modal-backdrop">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm max-h-[85vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Confirm Add Liquidity
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
            {/* Liquidity Preview */}
            <div className="space-y-3">
              <div className="text-center">
                <h4 className="text-base font-medium text-gray-900 dark:text-white mb-1">
                  You will receive
                </h4>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {((parseFloat(amount0) + parseFloat(amount1)) / 2).toFixed(6)}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {token0.symbol}/{token1.symbol} Pool Tokens
                </div>
              </div>

              {/* Token Amounts */}
              <div className="space-y-2">
                {/* Token 0 */}
                <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-6 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-600 flex items-center justify-center">
                        <img 
                          src={token0.logoUrl} 
                          alt={token0.symbol}
                          className="w-5 h-5 object-contain"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            const parent = target.parentElement;
                            if (parent) {
                              parent.className = 'w-6 h-6 bg-gradient-to-br from-orange-400 to-blue-500 rounded-full flex items-center justify-center';
                              parent.innerHTML = `<span class="text-white font-bold text-xs">${token0.symbol.charAt(0)}</span>`;
                            }
                          }}
                        />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white text-sm">
                          {token0.symbol}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-gray-900 dark:text-white text-sm">
                        {amount0}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        ~${(parseFloat(amount0) * (token0.price || 0)).toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Plus Icon */}
                <div className="flex justify-center">
                  <div className="p-1 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                    <Plus className="w-3 h-3 text-orange-600 dark:text-orange-400" />
                  </div>
                </div>

                {/* Token 1 */}
                <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-6 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-600 flex items-center justify-center">
                        <img 
                          src={token1.logoUrl} 
                          alt={token1.symbol}
                          className="w-5 h-5 object-contain"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            const parent = target.parentElement;
                            if (parent) {
                              parent.className = 'w-6 h-6 bg-gradient-to-br from-orange-400 to-blue-500 rounded-full flex items-center justify-center';
                              parent.innerHTML = `<span class="text-white font-bold text-xs">${token1.symbol.charAt(0)}</span>`;
                            }
                          }}
                        />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white text-sm">
                          {token1.symbol}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-gray-900 dark:text-white text-sm">
                        {amount1}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        ~${(parseFloat(amount1) * (token1.price || 0)).toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Pool Details */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 space-y-2">
              <h4 className="font-medium text-gray-900 dark:text-white text-sm mb-2">Pool Details</h4>
              
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-600 dark:text-gray-400">Total Deposit Value</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    ${totalValue.toFixed(2)}
                  </span>
                </div>
                
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-600 dark:text-gray-400">Pool Share</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {poolShare.toFixed(4)}%
                  </span>
                </div>
                
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-1">
                    <span className="text-gray-600 dark:text-gray-400">Estimated APR</span>
                    <Info className="w-2.5 h-2.5 text-gray-400" />
                  </div>
                  <span className="font-medium text-green-600 dark:text-green-400">
                    {estimatedAPR}
                  </span>
                </div>
                
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-600 dark:text-gray-400">Exchange Rate</span>
                  <div className="text-right">
                    <div className="font-medium text-gray-900 dark:text-white text-xs">
                      1 {token0.symbol} = {(parseFloat(amount1) / parseFloat(amount0)).toFixed(6)} {token1.symbol}
                    </div>
                    <div className="font-medium text-gray-900 dark:text-white text-xs">
                      1 {token1.symbol} = {(parseFloat(amount0) / parseFloat(amount1)).toFixed(6)} {token0.symbol}
                    </div>
                  </div>
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
              </div>
            </div>

            {/* Info Box */}
            <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-3 border border-orange-200 dark:border-orange-800">
              <div className="flex items-start space-x-2">
                <Info className="w-3 h-3 text-orange-500 mt-0.5" />
                <div className="text-xs text-orange-700 dark:text-orange-300">
                  <p className="font-medium mb-1">Liquidity Provider Rewards</p>
                  <p>
                    By adding liquidity, you'll earn 0.3% of all trades on this pair proportional to your share of the pool. 
                    Fees are added to the pool and accrue in real time.
                  </p>
                </div>
              </div>
            </div>

            {/* Disclaimer */}
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
              By adding liquidity you'll earn 0.3% of all trades on this pair proportional to your share of the pool.
            </p>
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
                <span>Adding Liquidity...</span>
              </>
            ) : (
              <>
                <Clock className="w-4 h-4" />
                <span>Confirm Add Liquidity</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LiquidityConfirmModal;