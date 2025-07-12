import React, { useState } from 'react';
import { Droplets, Plus, Minus } from 'lucide-react';
import { LiquidityPosition } from '../../hooks/usePortfolioData';
import RemoveLiquidityModal from '../RemoveLiquidityModal';

interface ActivePoolsProps {
  positions: LiquidityPosition[];
  isLoading: boolean;
}

const ActivePools: React.FC<ActivePoolsProps> = ({ positions, isLoading }) => {
  const [isRemoveModalOpen, setIsRemoveModalOpen] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<LiquidityPosition | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const handleRemoveClick = (position: LiquidityPosition) => {
    setSelectedPosition(position);
    setIsRemoveModalOpen(true);
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

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-24 animate-pulse"></div>
          <div className="w-5 h-5 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
        </div>
        <div className="space-y-2">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-8 animate-pulse"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32 animate-pulse"></div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">
            Active Pools
          </h3>
          <Droplets className="w-5 h-5 text-blue-500" />
        </div>
        
        <div className="space-y-2">
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {positions.length}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Providing liquidity
          </div>
        </div>
        
        {positions.length > 0 && (
          <div className="mt-4 space-y-2">
            {positions.slice(0, 2).map((position) => (
              <div 
                key={position.pair}
                className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded-lg"
              >
                <div className="flex items-center space-x-2">
                  <div className="flex items-center -space-x-1">
                    <div className="w-5 h-5 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-600 flex items-center justify-center border border-white dark:border-gray-700">
                      <img 
                        src={position.token0.logoUrl} 
                        alt={position.token0.symbol}
                        className="w-4 h-4 object-contain"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent) {
                            parent.className = 'w-5 h-5 bg-gradient-to-br from-orange-400 to-blue-500 rounded-full flex items-center justify-center border border-white dark:border-gray-700';
                            parent.innerHTML = `<span class="text-white font-bold text-xs">${position.token0.symbol.charAt(0)}</span>`;
                          }
                        }}
                      />
                    </div>
                    <div className="w-5 h-5 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-600 flex items-center justify-center border border-white dark:border-gray-700">
                      <img 
                        src={position.token1.logoUrl} 
                        alt={position.token1.symbol}
                        className="w-4 h-4 object-contain"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent) {
                            parent.className = 'w-5 h-5 bg-gradient-to-br from-orange-400 to-blue-500 rounded-full flex items-center justify-center border border-white dark:border-gray-700';
                            parent.innerHTML = `<span class="text-white font-bold text-xs">${position.token1.symbol.charAt(0)}</span>`;
                          }
                        }}
                      />
                    </div>
                  </div>
                  <span className="text-xs font-medium text-gray-900 dark:text-white">
                    {position.pair}
                  </span>
                </div>
                
                <div className="flex items-center space-x-1">
                  <button className="p-1 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 rounded transition-colors">
                    <Plus className="w-3 h-3" />
                  </button>
                  <button 
                    onClick={() => handleRemoveClick(position)}
                    className="p-1 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
            
            {positions.length > 2 && (
              <div className="text-xs text-gray-500 dark:text-gray-400 text-center pt-1">
                +{positions.length - 2} more pools
              </div>
            )}
          </div>
        )}
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

export default ActivePools;