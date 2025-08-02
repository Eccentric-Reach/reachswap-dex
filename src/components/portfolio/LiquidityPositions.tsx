import React, { useState } from 'react';
import { Droplets, ExternalLink, Minus, Plus } from 'lucide-react';
import { LiquidityPosition } from '../../hooks/usePortfolioData';
import RemoveLiquidityModal from '../RemoveLiquidityModal';

interface LiquidityPositionsProps {
  positions: LiquidityPosition[];
  isLoading: boolean;
}

const LiquidityPositions: React.FC<LiquidityPositionsProps> = ({ positions, isLoading }) => {
  const [isRemoveModalOpen, setIsRemoveModalOpen] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<LiquidityPosition | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const handleRemoveClick = (position: LiquidityPosition) => {
    setSelectedPosition(position);
    setIsRemoveModalOpen(true);
  };

  const handleAddLiquidityClick = (position: LiquidityPosition) => {
    // Navigate to liquidity tab with pre-selected tokens
    console.log(`Navigate to add liquidity for ${position.pair}`);
    // This could be enhanced to actually navigate and pre-populate the liquidity form
  };

  const handleRemoveConfirm = async (position: LiquidityPosition, percentage: number) => {
    setIsRemoving(true);
    
    try {
      // Mock remove liquidity transaction
      console.log(`Removing ${percentage}% of ${position.pair} liquidity...`);
      
      // Simulate transaction delay
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      console.log('Liquidity removed successfully!');
      setIsRemoveModalOpen(false);
      setSelectedPosition(null);
      
      // Here you would typically refresh the positions data
      // refreshPositions();
      
    } catch (error) {
      console.error('Remove liquidity failed:', error);
    } finally {
      setIsRemoving(false);
    }
  };

  const handleViewOnExplorer = (pairAddress: string) => {
    window.open(`https://explorer.mainnetloop.com/address/${pairAddress}`, '_blank');
  };

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-40 animate-pulse"></div>
        </div>
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24 animate-pulse"></div>
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16 animate-pulse"></div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-32 animate-pulse"></div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20 animate-pulse"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Liquidity Positions
            </h3>
            <Droplets className="w-5 h-5 text-blue-500" />
          </div>
          {positions.length > 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {positions.length} active position{positions.length !== 1 ? 's' : ''} providing liquidity
            </p>
          )}
        </div>
        
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {positions.length > 0 ? (
            positions.map((position) => (
              <div 
                key={position.pairAddress} 
                className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
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
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {position.pair}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {position.lpTokenBalance} LP tokens
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="font-medium text-gray-900 dark:text-white">
                        ${position.value.toFixed(2)}
                      </div>
                      <div className="flex items-center space-x-1">
                        <div className="text-sm bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-1 rounded-full">
                          APR {position.apr}
                        </div>
                        <div className="text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 px-1.5 py-0.5 rounded-full font-medium">
                          ReachSwap
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center space-x-4">
                      <span className="text-gray-500 dark:text-gray-400">
                        Pool Share: {position.poolShare.toFixed(4)}%
                      </span>
                      <span className="text-blue-600 dark:text-blue-400">
                        Rewards: ${position.rewards.toFixed(2)}
                      </span>
                      <span className="text-purple-600 dark:text-purple-400">
                        ReachSwap
                      </span>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <button 
                        onClick={() => handleAddLiquidityClick(position)}
                        className="flex items-center space-x-1 text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 transition-colors bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add</span>
                      </button>
                      
                      <button 
                        onClick={() => handleRemoveClick(position)}
                        className="flex items-center space-x-1 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30"
                      >
                        <Minus className="w-3 h-3" />
                        <span>Remove</span>
                      </button>
                      
                      <button 
                        onClick={() => handleViewOnExplorer(position.pairAddress)}
                        className="flex items-center space-x-1 text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 transition-colors"
                      >
                        <span>View</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                <Droplets className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                No Liquidity Positions Found
              </h3>
              <p className="text-sm">
                You don't have any active liquidity positions. Start providing liquidity to earn fees from trading pairs.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Remove Liquidity Modal */}
      <RemoveLiquidityModal
        isOpen={isRemoveModalOpen}
        onClose={() => {
          setIsRemoveModalOpen(false);
          setSelectedPosition(null);
        }}
        onConfirm={handleRemoveConfirm}
        position={selectedPosition}
        isLoading={isRemoving}
      />
    </>
  );
};

export default LiquidityPositions;