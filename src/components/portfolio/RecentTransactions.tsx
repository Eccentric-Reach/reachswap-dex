import React from 'react';
import { Activity, TrendingUp, TrendingDown, ExternalLink, Clock, CheckCircle, XCircle, ArrowRightLeft, Zap } from 'lucide-react';
import { Transaction } from '../../hooks/usePortfolioData';

interface RecentTransactionsProps {
  transactions: Transaction[];
  isLoading: boolean;
}

const RecentTransactions: React.FC<RecentTransactionsProps> = ({ transactions, isLoading }) => {
  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'swap':
        return <ArrowRightLeft className="w-4 h-4" />;
      case 'add':
        return <TrendingUp className="w-4 h-4" />;
      case 'remove':
        return <TrendingDown className="w-4 h-4" />;
      case 'approval':
        return <CheckCircle className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case 'swap':
        return 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400';
      case 'add':
        return 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400';
      case 'remove':
        return 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400';
      case 'approval':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400';
      default:
        return 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400';
    }
  };

  const getTransactionDescription = (tx: Transaction) => {
    switch (tx.type) {
      case 'swap':
        // Check if this is a wrap/unwrap transaction
        if ((tx as any).isWrapUnwrap) {
          const wrapType = (tx as any).wrapUnwrapType;
          if (wrapType === 'wrap') {
            return `Wrapped ${tx.amount} ${tx.from} → ${tx.to}`;
          } else if (wrapType === 'unwrap') {
            return `Unwrapped ${tx.amount} ${tx.from} → ${tx.to}`;
          }
        }
        return `Swap ${tx.from} → ${tx.to}`;
      case 'add':
        return `Add Liquidity to ${tx.pair}`;
      case 'remove':
        return `Remove Liquidity from ${tx.pair}`;
      case 'approval':
        return `Approve ${tx.from} for trading`;
      default:
        return 'Unknown Transaction';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-3 h-3 text-green-500" />;
      case 'pending':
        return <Clock className="w-3 h-3 text-yellow-500 animate-spin" />;
      case 'failed':
        return <XCircle className="w-3 h-3 text-red-500" />;
      default:
        return <Clock className="w-3 h-3 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
      case 'pending':
        return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400';
      case 'failed':
        return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';
      default:
        return 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400';
    }
  };

  const handleViewTransaction = (hash: string) => {
    window.open(`https://explorer.mainnetloop.com/tx/${hash}`, '_blank');
  };

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-40 animate-pulse"></div>
        </div>
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse"></div>
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32 animate-pulse"></div>
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-24 animate-pulse"></div>
                  </div>
                </div>
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-16 animate-pulse"></div>
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
          Recent Transactions
        </h3>
        {transactions.length > 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Your latest {transactions.length} ReachSwap transaction{transactions.length !== 1 ? 's' : ''} on Loop Network
          </p>
        )}
      </div>
      
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {transactions.length > 0 ? (
          transactions.map((tx, index) => (
            <div 
              key={`${tx.hash}-${index}`} 
              className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${getTransactionColor(tx.type)}`}>
                    {getTransactionIcon(tx.type)}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">
                      {getTransactionDescription(tx)}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center space-x-2">
                      <span>${tx.value.toFixed(2)} • {tx.time}</span>
                      {tx.gasUsed && (
                        <span className="text-xs">• Gas: {tx.gasUsed} LOOP</span>
                      )}
                      {tx.blockNumber && (
                        <span className="text-xs">• Block #{tx.blockNumber}</span>
                      )}
                      <span className="inline-flex items-center space-x-1 text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 px-1.5 py-0.5 rounded-full">
                          <Zap className="w-2.5 h-2.5" />
                          <span>via ReachSwap</span>
                      </span>
                      <button 
                        onClick={() => handleViewTransaction(tx.hash)}
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                        title="View on Loop Explorer"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <div className={`px-2 py-1 rounded-full text-xs font-medium flex items-center space-x-1 ${getStatusColor(tx.status)}`}>
                    {getStatusIcon(tx.status)}
                    <span className="capitalize">{tx.status}</span>
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <Activity className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No Recent Transactions
            </h3>
            <p className="text-sm">
              Your ReachSwap transaction history will appear here once you start trading.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecentTransactions;