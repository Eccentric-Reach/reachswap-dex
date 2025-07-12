import React from 'react';
import { RefreshCw, Wallet, TrendingUp } from 'lucide-react';
import { usePortfolioData } from '../hooks/usePortfolioData';
import PortfolioSummary from './portfolio/PortfolioSummary';
import TokenHoldings from './portfolio/TokenHoldings';
import LiquidityPositions from './portfolio/LiquidityPositions';
import RecentTransactions from './portfolio/RecentTransactions';
import TotalRewards from './portfolio/TotalRewards';
import ActivePools from './portfolio/ActivePools';

interface PortfolioInterfaceProps {
  isWalletConnected: boolean;
  walletAddress: string;
  onConnectWallet: () => void;
}

const PortfolioInterface: React.FC<PortfolioInterfaceProps> = ({
  isWalletConnected,
  walletAddress,
  onConnectWallet
}) => {
  const { portfolioData, isLoading, error, refreshPortfolioData } = usePortfolioData(
    isWalletConnected,
    walletAddress
  );

  // Show wallet connection prompt if not connected
  if (!isWalletConnected) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <div className="w-20 h-20 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <Wallet className="w-10 h-10 text-orange-600 dark:text-orange-400" />
          </div>
          
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Connect Your Wallet
          </h2>
          
          <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-md mx-auto">
            Connect your wallet to view your portfolio, track your holdings, and monitor your DeFi positions on Loop Network.
          </p>
          
          <button
            onClick={onConnectWallet}
            className="bg-gradient-to-r from-orange-500 to-blue-600 hover:from-orange-600 hover:to-blue-700 text-white font-semibold px-8 py-3 rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
          >
            Connect Wallet
          </button>
          
          <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
            <div className="flex items-center justify-center space-x-2 text-blue-700 dark:text-blue-300">
              <TrendingUp className="w-5 h-5" />
              <span className="font-medium">Real-time Portfolio Tracking</span>
            </div>
            <p className="text-sm text-blue-600 dark:text-blue-400 mt-2">
              Get live data from Loop Network with smart caching for instant loading
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header with Refresh Button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Portfolio</h1>
          <p className="text-gray-600 dark:text-gray-400">
            {walletAddress}
          </p>
        </div>
        
        <button
          onClick={refreshPortfolioData}
          disabled={isLoading}
          className={`flex items-center justify-center space-x-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-400 text-white rounded-lg transition-all duration-200 ${
            isLoading ? 'cursor-not-allowed' : 'hover:shadow-lg transform hover:scale-105'
          }`}
          title={isLoading ? 'Refreshing portfolio data...' : 'Refresh portfolio data'}
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          <span className="font-medium">
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </span>
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
          <div className="flex items-center space-x-2">
            <div className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
              <span className="text-white text-xs">!</span>
            </div>
            <div>
              <p className="text-red-700 dark:text-red-400 font-medium">Error loading portfolio data</p>
              <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
              <button
                onClick={refreshPortfolioData}
                className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-sm font-medium hover:underline mt-1 transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Portfolio Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Portfolio Value - spans 2 columns */}
        <div className="md:col-span-2">
          <PortfolioSummary
            totalValue={portfolioData.totalValue}
            dailyChange={portfolioData.dailyChange}
            dailyChangePercent={portfolioData.dailyChangePercent}
            isLoading={isLoading}
          />
        </div>

        {/* Total Rewards */}
        <TotalRewards
          totalRewards={portfolioData.totalRewards}
          rewardsToday={portfolioData.rewardsToday}
          isLoading={isLoading}
        />

        {/* Active Pools */}
        <ActivePools
          positions={portfolioData.liquidityPositions}
          isLoading={isLoading}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Token Holdings */}
        <TokenHoldings
          holdings={portfolioData.tokenHoldings}
          isLoading={isLoading}
        />

        {/* Liquidity Positions */}
        <LiquidityPositions
          positions={portfolioData.liquidityPositions}
          isLoading={isLoading}
        />
      </div>

      {/* Recent Transactions - Full Width */}
      <RecentTransactions
        transactions={portfolioData.recentTransactions}
        isLoading={isLoading}
      />

      {/* Performance Stats */}
      {!isLoading && portfolioData.tokenHoldings.length > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-orange-50 dark:from-blue-900/20 dark:to-orange-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-center space-x-8 text-sm">
            <div className="text-center">
              <div className="font-semibold text-gray-900 dark:text-white">
                {portfolioData.tokenHoldings.length}
              </div>
              <div className="text-gray-600 dark:text-gray-400">Active Tokens</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-gray-900 dark:text-white">
                {portfolioData.liquidityPositions.length}
              </div>
              <div className="text-gray-600 dark:text-gray-400">LP Positions</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-gray-900 dark:text-white">
                {portfolioData.recentTransactions.length}
              </div>
              <div className="text-gray-600 dark:text-gray-400">Recent Txns</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-green-600 dark:text-green-400">
                ${portfolioData.totalRewards.toFixed(2)}
              </div>
              <div className="text-gray-600 dark:text-gray-400">Total Rewards</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PortfolioInterface;