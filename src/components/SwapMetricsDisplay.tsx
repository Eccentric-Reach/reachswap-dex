import React from 'react';
import { Info, TrendingUp, TrendingDown, ExternalLink, Zap } from 'lucide-react';

interface SwapMetrics {
  exchangeRate: string;
  priceImpact: number;
  minimumReceived: string;
  slippageTolerance: number;
  routerUsed: 'sphynx' | 'reachswap';
  estimatedGas: string;
  hasFeeOnTransfer: boolean;
  path?: string[];
  amountOut: string;
  liquidityAvailable?: boolean;
  recommendedSlippage?: number;
  swapStrategy?: 'exactInput' | 'exactOutput' | 'supportingFee';
  // FIXED: Add price impact calculation state
  isPriceImpactCalculated?: boolean;
  priceImpactError?: string;
}

interface SwapMetricsDisplayProps {
  metrics: SwapMetrics;
  tokenInSymbol: string;
  tokenOutSymbol: string;
  className?: string;
  // FIXED: Add prop to control warning display
  showPriceImpactWarning?: boolean;
}

const SwapMetricsDisplay: React.FC<SwapMetricsDisplayProps> = ({
  metrics,
  tokenInSymbol,
  tokenOutSymbol,
  className = '',
  showPriceImpactWarning = true // Default to true for backward compatibility
}) => {
  // FIXED: Only show price impact if it's been properly calculated
  const shouldShowPriceImpact = metrics.isPriceImpactCalculated !== false;
  const isHighPriceImpact = shouldShowPriceImpact && metrics.priceImpact > 5;
  const isMediumPriceImpact = shouldShowPriceImpact && metrics.priceImpact > 1;

  const getPriceImpactColor = () => {
    if (!shouldShowPriceImpact) return 'text-gray-500 dark:text-gray-400';
    if (isHighPriceImpact) return 'text-red-600 dark:text-red-400';
    if (isMediumPriceImpact) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-green-600 dark:text-green-400';
  };

  const getPriceImpactIcon = () => {
    if (!shouldShowPriceImpact) return <Info className="w-3 h-3" />;
    if (isHighPriceImpact) return <TrendingDown className="w-3 h-3" />;
    if (isMediumPriceImpact) return <Info className="w-3 h-3" />;
    return <TrendingUp className="w-3 h-3" />;
  };

  const getRouterDisplayName = (router: string) => {
    return router === 'sphynx' ? 'Sphynx DEX' : 'ReachSwap';
  };

  const getRouterColor = (router: string) => {
    return router === 'sphynx' ? 'text-purple-600 dark:text-purple-400' : 'text-orange-600 dark:text-orange-400';
  };

  const getRouterUrl = (router: string) => {
    return router === 'sphynx' ? 'https://thesphynx.co/swap' : '#';
  };

  // Show no liquidity message if liquidity is not available
  if (metrics.liquidityAvailable === false) {
    return (
      <div className={`bg-red-50 dark:bg-red-900/20 rounded-xl p-4 border border-red-200 dark:border-red-800 ${className}`}>
        <div className="flex items-center space-x-2 mb-2">
          <TrendingDown className="w-4 h-4 text-red-500" />
          <h4 className="font-medium text-red-700 dark:text-red-400">No Liquidity Available</h4>
        </div>
        <p className="text-sm text-red-600 dark:text-red-400">
          No liquidity available for this pair. Try a different token pair or check back later.
        </p>
      </div>
    );
  }

  return (
    <div className={`bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 space-y-2 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-medium text-gray-900 dark:text-white text-sm">Swap Details</h4>
        <div className="flex items-center space-x-1">
          <span className="text-xs text-gray-600 dark:text-gray-400">via</span>
          <button
            onClick={() => window.open(getRouterUrl(metrics.routerUsed), '_blank')}
            className={`flex items-center space-x-1 text-xs font-medium ${getRouterColor(metrics.routerUsed)} hover:underline transition-colors`}
          >
            <span>{getRouterDisplayName(metrics.routerUsed)}</span>
            {metrics.routerUsed === 'sphynx' && <ExternalLink className="w-2.5 h-2.5" />}
          </button>
        </div>
      </div>

      {/* Router-specific notice */}
      {metrics.routerUsed === 'sphynx' && (
        <div className="mb-3 p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
          <div className="flex items-center space-x-2">
            <Info className="w-3 h-3 text-purple-500" />
            <span className="text-xs text-purple-700 dark:text-purple-300 font-medium">
              Routed via Sphynx DEX
            </span>
          </div>
          <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
            Using Sphynx DEX for optimal liquidity and pricing.
          </p>
        </div>
      )}
      
      <div className="space-y-1.5">
        {/* Exchange Rate */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-600 dark:text-gray-400">Exchange Rate</span>
          <span className="font-medium text-gray-900 dark:text-white">
            1 {tokenInSymbol} = {metrics.exchangeRate} {tokenOutSymbol}
          </span>
        </div>
        
        {/* FIXED: Price Impact with proper calculation state */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center space-x-1">
            <span className="text-gray-600 dark:text-gray-400">Price Impact</span>
            <div className="group relative">
              <Info className="w-2.5 h-2.5 text-gray-400 cursor-help" />
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                How much the price moves due to your trade
              </div>
            </div>
          </div>
          <div className={`flex items-center space-x-1 font-medium ${getPriceImpactColor()}`}>
            {getPriceImpactIcon()}
            <span>
              {shouldShowPriceImpact ? (
                `${metrics.priceImpact.toFixed(2)}%`
              ) : (
                metrics.priceImpactError ? 'Error' : 'Calculating...'
              )}
            </span>
          </div>
        </div>
        
        {/* Minimum Received */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center space-x-1">
            <span className="text-gray-600 dark:text-gray-400">Minimum Received</span>
            <div className="group relative">
              <Info className="w-2.5 h-2.5 text-gray-400 cursor-help" />
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                Minimum amount you'll receive after slippage
              </div>
            </div>
          </div>
          <span className="font-medium text-gray-900 dark:text-white">
            {metrics.minimumReceived === '0.000000' ? '0 (Auto)' : `${metrics.minimumReceived} ${tokenOutSymbol}`}
          </span>
        </div>
        
        {/* Slippage Tolerance */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-600 dark:text-gray-400">Slippage Tolerance</span>
          <span className="font-medium text-gray-900 dark:text-white">
            {metrics.slippageTolerance}%
          </span>
        </div>
        
        {/* Network Fee */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center space-x-1">
            <span className="text-gray-600 dark:text-gray-400">Network Fee</span>
            <Zap className="w-2.5 h-2.5 text-yellow-500" />
          </div>
          <span className="font-medium text-gray-900 dark:text-white">
            ~{metrics.estimatedGas} LOOP
          </span>
        </div>

        {/* Route Path (if multi-hop) */}
        {metrics.path && metrics.path.length > 2 && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600 dark:text-gray-400">Route</span>
            <span className="font-medium text-gray-900 dark:text-white text-right">
              {metrics.path.length - 1} hop{metrics.path.length > 2 ? 's' : ''} via WLOOP
            </span>
          </div>
        )}
      </div>

      {/* FIXED: High Price Impact Warning - Only show if enabled and properly calculated */}
      {showPriceImpactWarning && shouldShowPriceImpact && isHighPriceImpact && (
        <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
          <div className="flex items-center space-x-2">
            <TrendingDown className="w-3 h-3 text-red-500" />
            <div className="text-xs text-red-700 dark:text-red-300">
              <p className="font-medium">High Price Impact Warning</p>
              <p className="mt-0.5">
                This swap has a price impact of {metrics.priceImpact.toFixed(2)}%. You may receive significantly less than expected.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SwapMetricsDisplay;