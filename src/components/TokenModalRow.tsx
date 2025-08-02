import React, { useEffect, useRef, useCallback } from 'react';
import { Copy } from 'lucide-react';
import { Token } from '../types';

interface TokenModalRowProps {
  token: Token;
  isSelected: boolean;
  onSelect: (token: Token) => void;
  balance: string;
  isLoading: boolean;
  onVisible: (token: Token) => void;
  showCopyButton?: boolean;
  onCopyAddress?: () => void;
  isImported?: boolean;
}

const TokenModalRow: React.FC<TokenModalRowProps> = ({
  token,
  isSelected,
  onSelect,
  balance,
  isLoading,
  onVisible,
  showCopyButton = false,
  onCopyAddress,
  isImported = false
}) => {
  const rowRef = useRef<HTMLButtonElement>(null);
  const hasTriggeredRef = useRef(false);

  // Intersection Observer to detect when row becomes visible
  const handleIntersection = useCallback((entries: IntersectionObserverEntry[]) => {
    const [entry] = entries;
    if (entry.isIntersecting && !hasTriggeredRef.current) {
      hasTriggeredRef.current = true;
      onVisible(token);
    }
  }, [token, onVisible]);

  useEffect(() => {
    const currentRow = rowRef.current;
    if (!currentRow) return;

    const observer = new IntersectionObserver(handleIntersection, {
      root: null,
      rootMargin: '50px', // Start loading 50px before the row becomes visible
      threshold: 0.1
    });

    observer.observe(currentRow);

    return () => {
      observer.unobserve(currentRow);
    };
  }, [handleIntersection]);

  // Reset trigger when token changes
  useEffect(() => {
    hasTriggeredRef.current = false;
  }, [token.address]);

  const handleClick = () => {
    onSelect(token);
  };

  const handleCopyClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onCopyAddress) {
      onCopyAddress();
    }
  };

  return (
    <button
      ref={rowRef}
      onClick={handleClick}
      className={`w-full px-4 py-3 flex items-center space-x-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors rounded-lg ${
        isSelected ? 'bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800' : ''
      }`}
    >
      <div className="w-9 h-9 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
        {token.logoUrl ? (
          <img 
            src={token.logoUrl} 
            alt={token.symbol}
            className="w-7 h-7 object-contain"
            onError={(e) => {
              // Fallback to gradient background with first letter if image fails to load
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              const parent = target.parentElement;
              if (parent) {
                parent.className = 'w-9 h-9 bg-gradient-to-br from-orange-400 to-blue-500 rounded-full flex items-center justify-center flex-shrink-0';
                parent.innerHTML = `<span class="text-white font-bold text-sm">${token.symbol.charAt(0)}</span>`;
              }
            }}
          />
        ) : (
          <div className="w-9 h-9 bg-gradient-to-br from-orange-400 to-blue-500 rounded-full flex items-center justify-center">
            <span className="text-white font-bold text-sm">{token.symbol.charAt(0)}</span>
          </div>
        )}
      </div>
      
      <div className="flex-1 text-left min-w-0">
        <div className="flex items-center space-x-2">
          <div className="font-medium text-gray-900 dark:text-white truncate text-sm">
            {token.symbol}
          </div>
          {isImported && (
            <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs rounded-full font-medium">
              Imported
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {token.name}
        </div>
      </div>
      
      <div className="text-right flex-shrink-0 flex items-center space-x-2">
        <div>
          <div className="font-medium text-gray-900 dark:text-white text-sm">
            {isLoading ? (
              <div className="w-14 h-3.5 bg-gray-200 dark:bg-gray-600 rounded animate-pulse"></div>
            ) : (
              balance
            )}
          </div>
          {/* Removed price display as requested */}
        </div>
        
        {showCopyButton && (
          <button
            onClick={handleCopyClick}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors opacity-0 group-hover:opacity-100"
            title="Copy contract address"
          >
            <Copy className="w-3 h-3 text-gray-400 hover:text-blue-500" />
          </button>
        )}
      </div>
    </button>
  );
};

export default TokenModalRow;