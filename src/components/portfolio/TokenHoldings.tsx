import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { TokenHolding } from '../../hooks/usePortfolioData';

interface TokenHoldingsProps {
  holdings: TokenHolding[];
  isLoading: boolean;
}

const TokenHoldings: React.FC<TokenHoldingsProps> = ({ holdings, isLoading }) => {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-32 animate-pulse"></div>
        </div>
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse"></div>
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16 animate-pulse"></div>
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-24 animate-pulse"></div>
                  </div>
                </div>
                <div className="text-right space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20 animate-pulse"></div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16 animate-pulse"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Token Holdings
        </h3>
        {holdings.length > 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Showing {holdings.length} tokens with active balances
          </p>
        )}
      </div>
      
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {holdings.length > 0 ? (
          holdings.map((holding) => (
            <div 
              key={holding.token.symbol} 
              className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                    <img 
                      src={holding.token.logoUrl} 
                      alt={holding.token.symbol}
                      className="w-8 h-8 object-contain"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const parent = target.parentElement;
                        if (parent) {
                          parent.className = 'w-10 h-10 bg-gradient-to-br from-orange-400 to-blue-500 rounded-full flex items-center justify-center';
                          parent.innerHTML = `<span class="text-white font-bold text-sm">${holding.token.symbol.charAt(0)}</span>`;
                        }
                      }}
                    />
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">
                      {holding.token.symbol}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {holding.balance}
                      {holding.price && (
                        <span className="ml-2">@ ${holding.price.toFixed(6)}</span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="font-medium text-gray-900 dark:text-white">
                    ${holding.value.toFixed(2)}
                  </div>
                  <div className={`text-sm flex items-center justify-end space-x-1 ${
                    holding.change24h >= 0 
                      ? 'text-green-600 dark:text-green-400' 
                      : 'text-red-600 dark:text-red-400'
                  }`}>
                    {holding.change24h >= 0 ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : (
                      <TrendingDown className="w-3 h-3" />
                    )}
                    <span>{Math.abs(holding.change24h).toFixed(2)}%</span>
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">💰</span>
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No Token Holdings Found
            </h3>
            <p className="text-sm">
              Your wallet doesn't contain any tokens with significant balances on Loop Network.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TokenHoldings;