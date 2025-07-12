import React, { useState, useEffect } from 'react';
import { X, Minus, AlertTriangle, Info, Zap } from 'lucide-react';
import { LiquidityPosition } from '../hooks/usePortfolioData';

interface RemoveLiquidityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (position: LiquidityPosition, percentage: number) => void;
  position: LiquidityPosition | null;
  isLoading?: boolean;
}

const RemoveLiquidityModal: React.FC<RemoveLiquidityModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  position,
  isLoading = false
}) => {
  const [removePercentage, setRemovePercentage] = useState('0');
  const [customPercentage, setCustomPercentage] = useState('');

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

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setRemovePercentage('0');
      setCustomPercentage('');
    }
  }, [isOpen]);

  if (!isOpen || !position) return null;

  const percentage = parseFloat(removePercentage);
  const lpTokensToRemove = (parseFloat(position.lpTokenBalance) * percentage / 100);
  const valueToRemove = (position.value * percentage / 100);
  
  // Calculate estimated token outputs (simplified calculation)
  const estimatedToken0 = lpTokensToRemove * 0.5; // Mock calculation
  const estimatedToken1 = lpTokensToRemove * 0.5; // Mock calculation
  
  const estimatedGasFee = '0.05'; // Mock gas fee
  const priceImpact = percentage > 50 ? '0.5' : '0.1'; // Mock price impact

  const handlePercentageSelect = (percent: string) => {
    setRemovePercentage(percent);
    setCustomPercentage('');
  };

  const handleCustomPercentageChange = (value: string) => {
    const numValue = parseFloat(value);
    if (numValue >= 0 && numValue <= 100) {
      setCustomPercentage(value);
      setRemovePercentage(value);
    }
  };

  const handleSliderChange = (value: string) => {
    setRemovePercentage(value);
    setCustomPercentage('');
  };

  const handleConfirm = () => {
    if (percentage > 0 && percentage <= 100) {
      onConfirm(position, percentage);
    }
  };

  const canConfirm = percentage > 0 && percentage <= 100 && !isLoading;
  const isHighPercentage = percentage > 75;

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
            disabled={isLoading}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Scrollable Content */}
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

            {/* Remove Amount Selection */}
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
                    disabled={isLoading}
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
                  disabled={isLoading}
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
                  disabled={isLoading}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-red-500 focus:border-transparent disabled:opacity-50"
                  min="0"
                  max="100"
                  step="0.1"
                />
              </div>
            </div>

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
                </div>
              </div>
            )}

            {/* High Percentage Warning */}
            {isHighPercentage && (
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
                  <p className="font-medium mb-1">Liquidity Removal</p>
                  <p>
                    Removing liquidity will burn your LP tokens and return the underlying tokens to your wallet. 
                    You will stop earning fees on the removed portion.
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
            disabled={isLoading}
            className="flex-1 py-3 px-4 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-xl transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-all duration-200 flex items-center justify-center space-x-2 ${
              !canConfirm
                ? 'bg-gray-400 dark:bg-gray-600 text-gray-200 cursor-not-allowed'
                : isLoading
                ? 'bg-red-400 dark:bg-red-600 text-red-100 cursor-not-allowed'
                : 'bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-600 hover:to-orange-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
            }`}
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Removing...</span>
              </>
            ) : (
              <>
                <Minus className="w-4 h-4" />
                <span>Confirm Remove</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Custom Slider Styles */}
      <style jsx>{`
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