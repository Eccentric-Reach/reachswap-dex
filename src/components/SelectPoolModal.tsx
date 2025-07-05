import React, { useState, useEffect, useCallback } from 'react';
import { X, RefreshCw, Search } from 'lucide-react';
import { LiquidityPosition } from '../hooks/usePortfolioData';
import { TOKENS } from '../constants/tokens';

interface SelectPoolModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPool: (position: LiquidityPosition) => void;
  isWalletConnected: boolean;
}

const SelectPoolModal: React.FC<SelectPoolModalProps> = ({
  isOpen,
  onClose,
  onSelectPool,
  isWalletConnected
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [liquidityPositions, setLiquidityPositions] = useState<LiquidityPosition[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Mock function to fetch user's liquidity positions
  const fetchUserLiquidityPositions = useCallback(async (): Promise<LiquidityPosition[]> => {
    if (!isWalletConnected) return [];

    const walletAddress = localStorage.getItem('reachswap_wallet_address');
    if (!walletAddress) return [];

    try {
      // In a real implementation, this would:
      // 1. Get all pair addresses from the factory contract
      // 2. For each pair, check if user has LP token balance > 0
      // 3. Fetch pair reserves and calculate user's share
      
      // For now, return mock data based on common pairs
      const mockPositions: LiquidityPosition[] = [
        {
          pair: 'LOOP/GIKO',
          token0: TOKENS.LOOP,
          token1: TOKENS.GIKO,
          lpTokenBalance: '2.450000',
          poolShare: 0.0234,
          value: 2450.00,
          rewards: 12.34,
          apr: '25.4%'
        },
        {
          pair: 'LOOP/wLOOP',
          token0: TOKENS.LOOP,
          token1: TOKENS.wLOOP,
          lpTokenBalance: '1.890000',
          poolShare: 0.0189,
          value: 1890.00,
          rewards: 8.92,
          apr: '22.1%'
        },
        {
          pair: 'LOOP/KYC',
          token0: TOKENS.LOOP,
          token1: TOKENS.KYC,
          lpTokenBalance: '0.750000',
          poolShare: 0.0075,
          value: 750.00,
          rewards: 3.21,
          apr: '18.7%'
        },
        {
          pair: 'GIKO/LMEME',
          token0: TOKENS.GIKO,
          token1: TOKENS.LMEME,
          lpTokenBalance: '5.200000',
          poolShare: 0.0520,
          value: 520.00,
          rewards: 2.15,
          apr: '15.3%'
        }
      ];

      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      return mockPositions;
    } catch (error) {
      console.error('Error fetching liquidity positions:', error);
      throw error;
    }
  }, [isWalletConnected]);

  // Load liquidity positions when modal opens
  useEffect(() => {
    if (isOpen && isWalletConnected) {
      setIsLoading(true);
      setError(null);
      
      fetchUserLiquidityPositions()
        .then(positions => {
          setLiquidityPositions(positions);
        })
        .catch(err => {
          console.error('Failed to fetch liquidity positions:', err);
          setError('Failed to load your liquidity positions');
          setLiquidityPositions([]);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else if (!isOpen) {
      // Reset state when modal closes
      setSearchQuery('');
      setLiquidityPositions([]);
      setError(null);
    }
  }, [isOpen, isWalletConnected, fetchUserLiquidityPositions]);

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

  // Filter positions based on search query
  const filteredPositions = liquidityPositions.filter(position =>
    position.pair.toLowerCase().includes(searchQuery.toLowerCase()) ||
    position.token0.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
    position.token1.symbol.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handlePoolSelect = (position: LiquidityPosition) => {
    onSelectPool(position);
    onClose();
  };

  const handleRefresh = () => {
    if (isWalletConnected) {
      setIsLoading(true);
      setError(null);
      
      fetchUserLiquidityPositions()
        .then(positions => {
          setLiquidityPositions(positions);
        })
        .catch(err => {
          console.error('Failed to refresh liquidity positions:', err);
          setError('Failed to refresh your liquidity positions');
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 modal-backdrop">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            Select a Pool
          </h3>
          <div className="flex items-center space-x-1">
            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
              disabled={isLoading || !isWalletConnected}
              className={`p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors ${
                isLoading || !isWalletConnected ? 'cursor-not-allowed opacity-50' : ''
              }`}
              title="Refresh pools"
            >
              <RefreshCw className={`w-4 h-4 text-gray-500 dark:text-gray-400 ${
                isLoading ? 'animate-spin' : ''
              }`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="p-3 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search pools..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900 dark:text-white placeholder-gray-500 text-sm"
            />
          </div>
          
          {/* Status Indicator */}
          <div className="mt-2 flex items-center justify-center text-xs">
            {isWalletConnected ? (
              <div className="flex items-center space-x-1.5 text-green-600 dark:text-green-400">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                <span>Showing your active pools</span>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5 text-gray-500 dark:text-gray-400">
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full"></div>
                <span>Connect wallet to see your pools</span>
              </div>
            )}
          </div>
        </div>

        {/* Pool List - Scrollable */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="pb-2">
            {/* Loading State */}
            {isLoading && (
              <div className="p-6 space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg animate-pulse">
                    <div className="flex items-center space-x-3">
                      <div className="flex items-center -space-x-1">
                        <div className="w-8 h-8 bg-gray-200 dark:bg-gray-600 rounded-full"></div>
                        <div className="w-8 h-8 bg-gray-200 dark:bg-gray-600 rounded-full"></div>
                      </div>
                      <div className="space-y-1">
                        <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-20"></div>
                        <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded w-16"></div>
                      </div>
                    </div>
                    <div className="text-right space-y-1">
                      <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-16"></div>
                      <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded w-12"></div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Error State */}
            {error && !isLoading && (
              <div className="p-6 text-center">
                <div className="text-red-500 dark:text-red-400 text-sm mb-2">
                  {error}
                </div>
                <button
                  onClick={handleRefresh}
                  className="text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 text-sm transition-colors"
                >
                  Try again
                </button>
              </div>
            )}

            {/* Empty State */}
            {!isLoading && !error && filteredPositions.length === 0 && liquidityPositions.length === 0 && (
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                  <div className="w-8 h-8 text-gray-400 dark:text-gray-500">
                    💧
                  </div>
                </div>
                <div className="text-gray-500 dark:text-gray-400 text-sm mb-2">
                  You don't have any active liquidity pools yet.
                </div>
                <div className="text-gray-400 dark:text-gray-500 text-xs">
                  Add liquidity to start earning fees from trading pairs.
                </div>
              </div>
            )}

            {/* No Search Results */}
            {!isLoading && !error && liquidityPositions.length > 0 && filteredPositions.length === 0 && searchQuery && (
              <div className="p-6 text-center">
                <div className="text-gray-500 dark:text-gray-400 text-sm">
                  No pools found matching "{searchQuery}"
                </div>
              </div>
            )}

            {/* Pool List */}
            {!isLoading && !error && filteredPositions.length > 0 && (
              <div className="space-y-1 px-2">
                {filteredPositions.map((position) => (
                  <button
                    key={position.pair}
                    onClick={() => handlePoolSelect(position)}
                    className="w-full p-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors group"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="flex items-center -space-x-1">
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700 flex items-center justify-center border-2 border-white dark:border-gray-800">
                          <img 
                            src={position.token0.logoUrl} 
                            alt={position.token0.symbol}
                            className="w-6 h-6 object-contain"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              const parent = target.parentElement;
                              if (parent) {
                                parent.className = 'w-8 h-8 bg-gradient-to-br from-orange-400 to-blue-500 rounded-full flex items-center justify-center border-2 border-white dark:border-gray-800';
                                parent.innerHTML = `<span class="text-white font-bold text-xs">${position.token0.symbol.charAt(0)}</span>`;
                              }
                            }}
                          />
                        </div>
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700 flex items-center justify-center border-2 border-white dark:border-gray-800">
                          <img 
                            src={position.token1.logoUrl} 
                            alt={position.token1.symbol}
                            className="w-6 h-6 object-contain"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              const parent = target.parentElement;
                              if (parent) {
                                parent.className = 'w-8 h-8 bg-gradient-to-br from-orange-400 to-blue-500 rounded-full flex items-center justify-center border-2 border-white dark:border-gray-800';
                                parent.innerHTML = `<span class="text-white font-bold text-xs">${position.token1.symbol.charAt(0)}</span>`;
                              }
                            }}
                          />
                        </div>
                      </div>
                      <div className="text-left min-w-0">
                        <div className="font-medium text-gray-900 dark:text-white text-sm group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
                          {position.pair}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {position.lpTokenBalance} LP tokens
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right flex-shrink-0">
                      <div className="font-medium text-gray-900 dark:text-white text-sm">
                        ${position.value.toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {position.poolShare.toFixed(4)}% share
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Info */}
        {!isLoading && liquidityPositions.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 flex-shrink-0">
            <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
              {filteredPositions.length} of {liquidityPositions.length} pools shown
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SelectPoolModal;