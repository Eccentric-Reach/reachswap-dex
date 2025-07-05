import React from 'react';
import { Gift, TrendingUp } from 'lucide-react';

interface TotalRewardsProps {
  totalRewards: number;
  rewardsToday: number;
  isLoading: boolean;
}

const TotalRewards: React.FC<TotalRewardsProps> = ({ 
  totalRewards, 
  rewardsToday, 
  isLoading 
}) => {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-24 animate-pulse"></div>
          <div className="w-5 h-5 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
        </div>
        <div className="space-y-2">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-20 animate-pulse"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24 animate-pulse"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">
          Total Rewards
        </h3>
        <Gift className="w-5 h-5 text-blue-500" />
      </div>
      
      <div className="space-y-2">
        <div className="text-2xl font-bold text-gray-900 dark:text-white">
          ${totalRewards.toFixed(2)}
        </div>
        
        <div className="flex items-center space-x-1 text-green-600 dark:text-green-400">
          <TrendingUp className="w-3 h-3" />
          <span className="text-sm">
            +${rewardsToday.toFixed(2)} today
          </span>
        </div>
      </div>
      
      <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <div className="text-xs text-blue-700 dark:text-blue-300">
          <p className="font-medium mb-1">Liquidity Rewards</p>
          <p>
            Earn 0.3% of trading fees from your liquidity positions. 
            Rewards compound automatically.
          </p>
        </div>
      </div>
    </div>
  );
};

export default TotalRewards;