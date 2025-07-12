import React from 'react';
import { RefreshCw, Zap, TrendingUp } from 'lucide-react';

interface LoadingStateProps {
  type: 'calculating' | 'fetching' | 'swapping' | 'refreshing';
  message?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const LoadingState: React.FC<LoadingStateProps> = ({ 
  type, 
  message, 
  size = 'md' 
}) => {
  const getIcon = () => {
    switch (type) {
      case 'calculating':
        return <TrendingUp className={`${size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-6 h-6' : 'w-5 h-5'} animate-pulse`} />;
      case 'fetching':
        return <RefreshCw className={`${size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-6 h-6' : 'w-5 h-5'} animate-spin`} />;
      case 'swapping':
        return <Zap className={`${size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-6 h-6' : 'w-5 h-5'} animate-bounce`} />;
      case 'refreshing':
        return <RefreshCw className={`${size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-6 h-6' : 'w-5 h-5'} animate-spin`} />;
      default:
        return <RefreshCw className={`${size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-6 h-6' : 'w-5 h-5'} animate-spin`} />;
    }
  };

  const getMessage = () => {
    if (message) return message;
    
    switch (type) {
      case 'calculating':
        return 'Calculating best route...';
      case 'fetching':
        return 'Fetching quote...';
      case 'swapping':
        return 'Processing swap...';
      case 'refreshing':
        return 'Refreshing data...';
      default:
        return 'Loading...';
    }
  };

  return (
    <div className="flex items-center space-x-2 text-blue-600 dark:text-blue-400">
      {getIcon()}
      <span className={`${size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-base' : 'text-sm'} font-medium`}>
        {getMessage()}
      </span>
    </div>
  );
};

interface ProgressBarProps {
  progress: number;
  message?: string;
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ 
  progress, 
  message, 
  className = '' 
}) => {
  return (
    <div className={`w-full ${className}`}>
      {message && (
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-600 dark:text-gray-400">{message}</span>
          <span className="text-sm font-medium text-gray-900 dark:text-white">{Math.round(progress)}%</span>
        </div>
      )}
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div 
          className="bg-gradient-to-r from-orange-500 to-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
    </div>
  );
};

interface PulseSkeletonProps {
  className?: string;
  lines?: number;
}

export const PulseSkeleton: React.FC<PulseSkeletonProps> = ({ 
  className = '', 
  lines = 1 
}) => {
  return (
    <div className={`animate-pulse ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div 
          key={i}
          className={`bg-gray-200 dark:bg-gray-700 rounded ${
            lines > 1 ? 'h-4 mb-2 last:mb-0' : 'h-4'
          }`}
          style={{ 
            width: lines > 1 ? `${100 - (i * 10)}%` : '100%' 
          }}
        />
      ))}
    </div>
  );
};

interface SwapLoadingProps {
  stage: 'route' | 'quote' | 'approval' | 'swap';
  progress: number;
}

export const SwapLoading: React.FC<SwapLoadingProps> = ({ stage, progress }) => {
  const getStageMessage = () => {
    switch (stage) {
      case 'route':
        return 'Finding optimal route...';
      case 'quote':
        return 'Getting best quote...';
      case 'approval':
        return 'Approving token...';
      case 'swap':
        return 'Executing swap...';
      default:
        return 'Processing...';
    }
  };

  const getStageIcon = () => {
    switch (stage) {
      case 'route':
        return <TrendingUp className="w-5 h-5 animate-pulse" />;
      case 'quote':
        return <RefreshCw className="w-5 h-5 animate-spin" />;
      case 'approval':
        return <Zap className="w-5 h-5 animate-bounce" />;
      case 'swap':
        return <Zap className="w-5 h-5 animate-bounce" />;
      default:
        return <RefreshCw className="w-5 h-5 animate-spin" />;
    }
  };

  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
      <div className="flex items-center space-x-3 mb-3">
        <div className="text-blue-600 dark:text-blue-400">
          {getStageIcon()}
        </div>
        <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
          {getStageMessage()}
        </span>
      </div>
      <ProgressBar progress={progress} className="mb-2" />
      <div className="text-xs text-blue-600 dark:text-blue-400">
        This usually takes a few seconds...
      </div>
    </div>
  );
};