import React from 'react';
import { Info, TrendingUp, TrendingDown, ExternalLink, Zap, Shield, Star, AlertTriangle } from 'lucide-react';

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
  isPriceImpactCalculated?: boolean;
  priceImpactError?: string;
  routerAddress?: string;
  routerPriority?: number;
  liquidityInfo?: {
    reserve0: string;
    reserve1: string;
    pairAddress: string;
    totalLiquidity: string;
  };
  feeStructure?: {
    swapFee: string;
    protocolFee: string;
    lpFee: string;
  };
  performance?: {
    gasEstimate: string;
    estimatedTime: string;
    reliability: 'high' | 'medium' | 'low';
  };
  executionDetails?: {
    totalFees: string;
    priceImpactWarning: boolean;
    slippageRecommendation: number;
  };
}

interface SwapMetricsDisplayProps {
  metrics: SwapMetrics;
  tokenInSymbol: string;
  tokenOutSymbol: string;
  className?: string;
  showPriceImpactWarning?: boolean;
  showRouterComparison?: boolean;
  onRouterChange?: (router: 'reachswap' | 'sphynx') => void;
}

const SwapMetricsDisplay: React.FC<SwapMetricsDisplayProps> = ({
  metrics,
  tokenInSymbol,
  tokenOutSymbol,
  className = '',
  showPriceImpactWarning = true,
  showRouterComparison = false,
  onRouterChange
}) => {
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
    return router === 'reachswap' ? 'ReachSwap DEX' : 'Sphynx DEX';
  };

  const getRouterColor = (router: string) => {
    return router === 'reachswap' 
      ? 'text-blue-600 dark:text-blue-400' 
      : 'text-purple-600 dark:text-purple-400';
  };

  const getRouterUrl = (router: string) => {
    return router === 'reachswap' 
      ? 'https://explorer.mainnetloop.com' 
      : 'https://thesphynx.co/swap';
  };

  const getRouterIcon = (router: string) => {
    return router === 'reachswap' ? <Shield className="w-3 h-3" /> : <Star className="w-3 h-3" />;
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
          No liquidity available for this pair on either ReachSwap or Sphynx DEX. Try a different token pair or check back later.
        </p>
        {showRouterComparison && (
          <div className="mt-3 text-xs text-red-500 dark:text-red-400">
            💡 Tip: You can create the first liquidity pool for this pair on ReachSwap
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800 ${className}`}>
      {/* Header with Router Selection */}
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-gray-900 dark:text-white text-sm">Swap Details</h4>
        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-600 dark:text-gray-400">via</span>
          <div className="flex items-center space-x-1">
            {getRouterIcon(metrics.routerUsed)}
            <button
              onClick={() => window.open(getRouterUrl(metrics.routerUsed), '_blank')}
              className={`flex items-center space-x-1 text-xs font-medium ${getRouterColor(metrics.routerUsed)} hover:underline transition-colors`}
            >
              <span>{getRouterDisplayName(metrics.routerUsed)}</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </button>
          </div>
          {metrics.routerPriority === 1 && (
            <div className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 rounded-full">
              <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Native</span>
            </div>
          )}
        </div>
      </div>

      {/* Enhanced Router Notice */}
      {metrics.routerUsed === 'reachswap' ? (
        <div className="mb-3 p-3 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/30 dark:to-cyan-900/30 rounded-lg border border-blue-200 dark:border-blue-700">
          <div className="flex items-center space-x-2 mb-1">
            <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm text-blue-800 dark:text-blue-200 font-semibold">
              ReachSwap Native DEX
            </span>
            <div className="px-2 py-0.5 bg-blue-600 text-white rounded-full text-xs font-medium">
              PRIORITY
            </div>
          </div>
          <p className="text-xs text-blue-700 dark:text-blue-300">
            ⚡ Lower fees ({metrics.feeStructure?.swapFee || '0.25%'}) • 🔐 Enhanced security • 🚀 Optimized for LOOP Network
          </p>
          {metrics.executionDetails && (
            <div className="mt-2 flex items-center space-x-4 text-xs">
              <span className="text-blue-600 dark:text-blue-400">
                💰 Total Fees: {metrics.executionDetails.totalFees} LOOP
              </span>
              <span className="text-blue-600 dark:text-blue-400">
                ⛽ Gas: ~{metrics.estimatedGas} LOOP
              </span>
              {metrics.performance && (
                <span className="text-blue-600 dark:text-blue-400">
                  ⏱️ ~{metrics.performance.estimatedTime}s
                </span>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="mb-3 p-3 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/30 dark:to-pink-900/30 rounded-lg border border-purple-200 dark:border-purple-700">
          <div className="flex items-center space-x-2 mb-1">
            <Star className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span className="text-sm text-purple-800 dark:text-purple-200 font-semibold">
              Sphynx DEX Fallback
            </span>
            <div className="px-2 py-0.5 bg-orange-500 text-white rounded-full text-xs font-medium">
              FALLBACK
            </div>
          </div>
          <p className="text-xs text-purple-700 dark:text-purple-300">
            🔄 Using Sphynx DEX (ReachSwap pair not available) • Fee: {metrics.feeStructure?.swapFee || '0.30%'}
          </p>
          {metrics.executionDetails && (
            <div className="mt-2 flex items-center space-x-4 text-xs">
              <span className="text-purple-600 dark:text-purple-400">
                💰 Total Fees: {metrics.executionDetails.totalFees} LOOP
              </span>
              <span className="text-purple-600 dark:text-purple-400">
                ⛽ Gas: ~{metrics.estimatedGas} LOOP
              </span>
              {metrics.performance && (
                <span className="text-purple-600 dark:text-purple-400">
                  ⏱️ ~{metrics.performance.estimatedTime}s
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Enhanced Swap Details */}
      <div className="space-y-2">
        {/* Exchange Rate */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-700 dark:text-gray-300 font-medium">Exchange Rate</span>
          <span className="font-semibold text-gray-900 dark:text-white">
            1 {tokenInSymbol} = {metrics.exchangeRate} {tokenOutSymbol}
          </span>
        </div>
        
        {/* Enhanced Price Impact */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center space-x-1">
            <span className="text-gray-700 dark:text-gray-300 font-medium">Price Impact</span>
            <div className="group relative">
              <Info className="w-3 h-3 text-gray-400 cursor-help" />
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                How much the price moves due to your trade size
              </div>
            </div>
          </div>
          <div className={`flex items-center space-x-1 font-semibold ${getPriceImpactColor()}`}>
            {getPriceImpactIcon()}
            <span>
              {shouldShowPriceImpact ? (
                `${metrics.priceImpact.toFixed(3)}%`
              ) : (
                metrics.priceImpactError ? 'Error' : 'Calculating...'
              )}
            </span>
          </div>
        </div>
        
        {/* Minimum Received */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center space-x-1">
            <span className="text-gray-700 dark:text-gray-300 font-medium">Minimum Received</span>
            <div className="group relative">
              <Info className="w-3 h-3 text-gray-400 cursor-help" />
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                Minimum amount guaranteed after slippage tolerance
              </div>
            </div>
          </div>
          <span className="font-semibold text-gray-900 dark:text-white">
            {metrics.minimumReceived === '0.000000' ? '0 (Auto)' : `${metrics.minimumReceived} ${tokenOutSymbol}`}
          </span>
        </div>
        
        {/* Enhanced Slippage Tolerance */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-700 dark:text-gray-300 font-medium">Slippage Tolerance</span>
          <div className="flex items-center space-x-1">
            <span className="font-semibold text-gray-900 dark:text-white">
              {metrics.slippageTolerance}%
            </span>
            {metrics.recommendedSlippage && metrics.recommendedSlippage > metrics.slippageTolerance && (
              <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                (Rec: {metrics.recommendedSlippage}%)
              </span>
            )}
          </div>
        </div>
        
        {/* Enhanced Network Fee */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center space-x-1">
            <span className="text-gray-700 dark:text-gray-300 font-medium">Network Fee</span>
            <Zap className="w-3 h-3 text-yellow-500" />
          </div>
          <span className="font-semibold text-gray-900 dark:text-white">
            ~{metrics.estimatedGas} LOOP
          </span>
        </div>

        {/* Route Path */}
        {metrics.path && metrics.path.length > 2 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-700 dark:text-gray-300 font-medium">Route</span>
            <span className="font-semibold text-gray-900 dark:text-white text-right">
              {metrics.path.length - 1} hop{metrics.path.length > 2 ? 's' : ''} via wLOOP
            </span>
          </div>
        )}

        {/* Liquidity Information */}
        {metrics.liquidityInfo && (
          <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-600 dark:text-gray-400 mb-2 font-medium">Liquidity Information:</div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600 dark:text-gray-400">Pair Address</span>
                <button
                  onClick={() => window.open(`https://explorer.mainnetloop.com/address/${metrics.liquidityInfo?.pairAddress}`, '_blank')}
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors font-mono"
                >
                  {metrics.liquidityInfo.pairAddress.slice(0, 6)}...{metrics.liquidityInfo.pairAddress.slice(-4)}
                </button>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600 dark:text-gray-400">Total Value Locked</span>
                <span className="text-gray-600 dark:text-gray-400">
                  ${(Number(metrics.liquidityInfo.totalLiquidity) / 1e36 * 0.15).toFixed(0)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Enhanced High Price Impact Warning */}
      {showPriceImpactWarning && shouldShowPriceImpact && isHighPriceImpact && (
        <div className="mt-4 p-3 bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-900/30 dark:to-orange-900/30 rounded-lg border border-red-200 dark:border-red-700">
          <div className="flex items-start space-x-2">
            <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-red-800 dark:text-red-200">High Price Impact Warning</p>
              <p className="mt-1 text-red-700 dark:text-red-300">
                This swap has a price impact of {metrics.priceImpact.toFixed(2)}%. You may receive significantly less than expected.
              </p>
              {metrics.executionDetails?.slippageRecommendation && (
                <p className="mt-1 text-red-600 dark:text-red-400 text-xs">
                  💡 Consider increasing slippage to {metrics.executionDetails.slippageRecommendation}% or reducing swap amount.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Router Performance Indicator */}
      {metrics.routerUsed === 'reachswap' && (
        <div className="mt-3 p-2 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg border border-green-200 dark:border-green-800">
          <div className="flex items-center space-x-2">
            <Shield className="w-3 h-3 text-green-600 dark:text-green-400" />
            <span className="text-xs text-green-800 dark:text-green-200 font-medium">
              Optimal Routing: Native ReachSwap DEX selected for best rates and lower fees
            </span>
          </div>
          {metrics.performance && (
            <div className="mt-1 text-xs text-green-700 dark:text-green-300">
              Reliability: {metrics.performance.reliability.toUpperCase()} • Est. Time: {metrics.performance.estimatedTime}s
            </div>
          )}
        </div>
      )}

      {/* Fee-on-Transfer Token Warning */}
      {metrics.hasFeeOnTransfer && (
        <div className="mt-3 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-3 h-3 text-yellow-600 dark:text-yellow-400" />
            <span className="text-xs text-yellow-800 dark:text-yellow-200 font-medium">
              Fee-on-Transfer Token Detected: Using supporting swap functions for safety
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default SwapMetricsDisplay;