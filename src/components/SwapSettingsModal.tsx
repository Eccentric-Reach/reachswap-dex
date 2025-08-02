import React, { useState, useEffect } from 'react';
import { X, Info, AlertTriangle } from 'lucide-react';

interface SwapSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  slippage: string;
  onSlippageChange: (value: string) => void;
  gasPrice: string;
  onGasPriceChange: (value: string) => void;
  expertMode: boolean;
  onExpertModeChange: (enabled: boolean) => void;
}

const SwapSettingsModal: React.FC<SwapSettingsModalProps> = ({
  isOpen,
  onClose,
  slippage,
  onSlippageChange,
  gasPrice,
  onGasPriceChange,
  expertMode,
  onExpertModeChange
}) => {
  const [customSlippage, setCustomSlippage] = useState('');
  const [customGasPrice, setCustomGasPrice] = useState('');
  const [showExpertWarning, setShowExpertWarning] = useState(false);

  // Handle click outside to close modal
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (isOpen && target.classList.contains('modal-backdrop') && !showExpertWarning) {
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
  }, [isOpen, onClose, showExpertWarning]);

  if (!isOpen) return null;

  const presetSlippages = ['0.1', '0.5', '1.0'];
  const presetGasPrices = ['5', '10', '15', '20'];

  const handleSlippageSelect = (value: string) => {
    onSlippageChange(value);
    setCustomSlippage('');
  };

  const handleCustomSlippageChange = (value: string) => {
    setCustomSlippage(value);
    if (value) {
      onSlippageChange(value);
    }
  };

  const handleGasPriceSelect = (value: string) => {
    onGasPriceChange(value);
    setCustomGasPrice('');
  };

  const handleCustomGasPriceChange = (value: string) => {
    setCustomGasPrice(value);
    if (value) {
      onGasPriceChange(value);
    }
  };

  const handleExpertModeToggle = () => {
    if (!expertMode) {
      setShowExpertWarning(true);
    } else {
      onExpertModeChange(false);
    }
  };

  const confirmExpertMode = () => {
    onExpertModeChange(true);
    setShowExpertWarning(false);
  };

  const isHighSlippage = parseFloat(slippage) > 5;
  const isLowSlippage = parseFloat(slippage) < 0.1;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 modal-backdrop">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm max-h-[85vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Swap Settings
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-4 space-y-5">
            {/* Slippage Tolerance */}
            <div>
              <div className="flex items-center space-x-2 mb-3">
                <h4 className="text-base font-medium text-gray-900 dark:text-white">
                  Slippage Tolerance
                </h4>
                <div className="group relative">
                  <Info className="w-3 h-3 text-gray-400 cursor-help" />
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                    Maximum price movement you're willing to accept
                  </div>
                </div>
              </div>
              
              <div className="flex space-x-2 mb-3">
                {presetSlippages.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => handleSlippageSelect(preset)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      slippage === preset && !customSlippage
                        ? 'bg-orange-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {preset}%
                  </button>
                ))}
                <div className="flex-1">
                  <input
                    type="number"
                    placeholder="Custom"
                    value={customSlippage}
                    onChange={(e) => handleCustomSlippageChange(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    min="0"
                    max="50"
                    step="0.1"
                  />
                </div>
              </div>

              {/* Slippage Warnings */}
              {isHighSlippage && (
                <div className="flex items-center space-x-2 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                  <AlertTriangle className="w-3 h-3 text-red-500" />
                  <p className="text-xs text-red-700 dark:text-red-400">
                    High slippage tolerance may result in unfavorable trades
                  </p>
                </div>
              )}
              
              {isLowSlippage && (
                <div className="flex items-center space-x-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <AlertTriangle className="w-3 h-3 text-yellow-500" />
                  <p className="text-xs text-yellow-700 dark:text-yellow-400">
                    Low slippage tolerance may cause transaction failures
                  </p>
                </div>
              )}
            </div>

            {/* Gas Price */}
            <div>
              <div className="flex items-center space-x-2 mb-3">
                <h4 className="text-base font-medium text-gray-900 dark:text-white">
                  Transaction Speed (GWEI)
                </h4>
                <div className="group relative">
                  <Info className="w-3 h-3 text-gray-400 cursor-help" />
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                    Higher gas price = faster confirmation
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-1.5 mb-3">
                {presetGasPrices.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => handleGasPriceSelect(preset)}
                    className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      gasPrice === preset && !customGasPrice
                        ? 'bg-orange-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    <div className="font-semibold">{preset} GWEI</div>
                    <div className="text-xs opacity-75 leading-tight">
                      {preset === '5' && 'Slow'}
                      {preset === '10' && 'Standard'}
                      {preset === '15' && 'Fast'}
                      {preset === '20' && 'Instant'}
                    </div>
                  </button>
                ))}
              </div>
              
              <input
                type="number"
                placeholder="Custom GWEI"
                value={customGasPrice}
                onChange={(e) => handleCustomGasPriceChange(e.target.value)}
                className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                min="1"
                max="1000"
                step="1"
              />
            </div>

            {/* Expert Mode */}
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <h4 className="text-base font-medium text-gray-900 dark:text-white">
                    Expert Mode
                  </h4>
                  <div className="group relative">
                    <Info className="w-3 h-3 text-gray-400 cursor-help" />
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                      Disables confirmation prompts
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleExpertModeToggle}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    expertMode ? 'bg-orange-500' : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                >
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                      expertMode ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              
              {expertMode && (
                <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="w-3 h-3 text-red-500" />
                    <p className="text-xs text-red-700 dark:text-red-400 font-medium">
                      Expert Mode Enabled
                    </p>
                  </div>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                    Use at your own risk. Transactions may fail or result in significant losses.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Expert Mode Warning Modal */}
        {showExpertWarning && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 max-w-xs w-full">
              <div className="flex items-center space-x-2 mb-3">
                <div className="w-8 h-8 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
                </div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  Expert Mode Warning
                </h3>
              </div>
              
              <div className="space-y-2 mb-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Expert mode turns off the confirm transaction prompt and allows high slippage trades that often result in bad rates and lost funds.
                </p>
                <p className="text-sm font-medium text-red-600 dark:text-red-400">
                  ONLY USE THIS MODE IF YOU KNOW WHAT YOU'RE DOING.
                </p>
              </div>
              
              <div className="flex space-x-2">
                <button
                  onClick={() => setShowExpertWarning(false)}
                  className="flex-1 px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmExpertMode}
                  className="flex-1 px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors text-sm"
                >
                  Turn On Expert Mode
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SwapSettingsModal;