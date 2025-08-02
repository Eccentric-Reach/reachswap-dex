import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, X, RefreshCw, Copy, AlertTriangle, CheckCircle } from 'lucide-react';
import { Token } from '../types';
import { TOKENS } from '../constants/tokens';
import { useVisibleTokenBalances } from '../hooks/useVisibleTokenBalances';
import { useTokenImport } from '../hooks/useTokenImport';
import { useTokenMetadata } from '../hooks/useTokenMetadata';
import { normalizeToken, isValidToken, validateImportedToken, getTokenDisplayName } from '../utils/tokenUtils';
import TokenModalRow from './TokenModalRow';

interface TokenModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectToken: (token: Token) => void;
  selectedToken?: Token;
  title: string;
  isWalletConnected?: boolean;
}

interface SearchResult {
  type: 'official' | 'imported' | 'contract';
  token: Token;
  isImported?: boolean;
}

const TokenModal: React.FC<TokenModalProps> = ({
  isOpen,
  onClose,
  onSelectToken,
  selectedToken,
  title,
  isWalletConnected = false
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [contractSearchResult, setContractSearchResult] = useState<Token | null>(null);
  const [showImportWarning, setShowImportWarning] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Get wallet address for balance fetching
  const walletAddress = localStorage.getItem('reachswap_wallet_address');
  
  // Use hooks
  const { 
    balances, 
    fetchBalanceForToken, 
    getTokenBalance, 
    isTokenLoading, 
    clearBalances 
  } = useVisibleTokenBalances(isWalletConnected, walletAddress || undefined);

  const {
    importedTokens,
    importToken,
    removeImportedToken,
    isTokenImported
  } = useTokenImport();

  const {
    fetchTokenMetadata,
    isLoading: isLoadingMetadata
  } = useTokenMetadata();

  // Handle token becoming visible
  const handleTokenVisible = useCallback((token: Token) => {
    if (isWalletConnected && walletAddress && isValidToken(token)) {
      fetchBalanceForToken(token);
    }
  }, [isWalletConnected, walletAddress, fetchBalanceForToken]);

  // Check if input is a contract address
  const isContractAddress = useCallback((input: string): boolean => {
    return /^0x[a-fA-F0-9]{40}$/.test(input.trim());
  }, []);

  // Search for token by contract address
  const searchByContractAddress = useCallback(async (address: string) => {
    if (!isContractAddress(address)) {
      setContractSearchResult(null);
      setSearchError(null);
      return;
    }

    const normalizedAddress = address.toLowerCase();

    // Check if it's already in official tokens
    const officialToken = Object.values(TOKENS).find(
      token => token.address.toLowerCase() === normalizedAddress
    );
    
    if (officialToken) {
      setContractSearchResult(null);
      setSearchError(null);
      return;
    }

    // Check if it's already imported
    const importedToken = importedTokens.find(
      token => token.address.toLowerCase() === normalizedAddress
    );
    
    if (importedToken) {
      setContractSearchResult(null);
      setSearchError(null);
      return;
    }

    setSearchError(null);

    try {
      console.log(`🔍 Searching for contract: ${address}`);
      const metadata = await fetchTokenMetadata(address);
      
      if (metadata) {
        try {
          // Create and validate token object
          const tokenData = {
            symbol: metadata.symbol,
            name: metadata.name,
            address: normalizedAddress,
            decimals: metadata.decimals,
            logoUrl: '', // No logo for unknown tokens
            price: undefined, // FIXED: Remove fake prices
            isImported: true
          };
          
          const validatedToken = validateImportedToken(tokenData);
          setContractSearchResult(validatedToken);
          console.log(`✅ Contract token found and validated:`, validatedToken);
        } catch (validationError) {
          console.error('Token validation failed:', validationError);
          setSearchError('Invalid token contract');
          setContractSearchResult(null);
        }
      } else {
        setSearchError('No valid token found at this address');
        setContractSearchResult(null);
      }
    } catch (error) {
      console.error('Error searching contract:', error);
      setSearchError('Failed to fetch token information');
      setContractSearchResult(null);
    }
  }, [isContractAddress, importedTokens, fetchTokenMetadata]);

  // Handle search query changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery.trim() && isContractAddress(searchQuery.trim())) {
        searchByContractAddress(searchQuery.trim());
      } else {
        setContractSearchResult(null);
        setSearchError(null);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, searchByContractAddress, isContractAddress]);

  // Get all available tokens with sorting and validation
  const allTokens = useMemo(() => {
    const officialTokens = Object.values(TOKENS);
    
    // Validate and normalize imported tokens
    const validImportedTokens = importedTokens
      .filter(token => {
        try {
          return isValidToken(token);
        } catch (error) {
          console.warn('Invalid imported token filtered out:', token);
          return false;
        }
      })
      .map(token => {
        try {
          return normalizeToken(token);
        } catch (error) {
          console.warn('Failed to normalize imported token, skipping:', token);
          return null;
        }
      })
      .filter(Boolean) as Token[];

    const allAvailableTokens = [...officialTokens, ...validImportedTokens];
    
    if (!isWalletConnected) {
      // If wallet not connected, just sort alphabetically with LOOP first
      return allAvailableTokens.sort((a, b) => {
        if (a.symbol === 'LOOP') return -1;
        if (b.symbol === 'LOOP') return 1;
        return a.symbol.localeCompare(b.symbol);
      });
    }

    // Sort by: LOOP first, then tokens with balance > 0, then alphabetically
    return allAvailableTokens.sort((a, b) => {
      // LOOP always first
      if (a.symbol === 'LOOP') return -1;
      if (b.symbol === 'LOOP') return 1;

      const balanceA = parseFloat(getTokenBalance(a));
      const balanceB = parseFloat(getTokenBalance(b));
      
      // Tokens with balance come before tokens without balance
      if (balanceA > 0 && balanceB === 0) return -1;
      if (balanceA === 0 && balanceB > 0) return 1;
      
      // If both have balance or both don't have balance, sort alphabetically
      return a.symbol.localeCompare(b.symbol);
    });
  }, [importedTokens, isWalletConnected, getTokenBalance]);

  // Filter and search tokens
  const searchResults = useMemo((): SearchResult[] => {
    const query = searchQuery.toLowerCase().trim();
    const results: SearchResult[] = [];

    if (!query) {
      // No search query - return all tokens
      allTokens.forEach(token => {
        results.push({
          type: isTokenImported(token.address) ? 'imported' : 'official',
          token,
          isImported: isTokenImported(token.address)
        });
      });
    } else if (isContractAddress(query)) {
      // Contract address search
      if (contractSearchResult) {
        results.push({
          type: 'contract',
          token: contractSearchResult,
          isImported: false
        });
      }
      
      // Also show matching official/imported tokens
      allTokens
        .filter(token => 
          token.symbol.toLowerCase().includes(query) ||
          token.name.toLowerCase().includes(query) ||
          token.address.toLowerCase() === query
        )
        .forEach(token => {
          results.push({
            type: isTokenImported(token.address) ? 'imported' : 'official',
            token,
            isImported: isTokenImported(token.address)
          });
        });
    } else {
      // Text search
      allTokens
        .filter(token =>
          token.symbol.toLowerCase().includes(query) ||
          token.name.toLowerCase().includes(query)
        )
        .forEach(token => {
          results.push({
            type: isTokenImported(token.address) ? 'imported' : 'official',
            token,
            isImported: isTokenImported(token.address)
          });
        });
    }

    return results;
  }, [searchQuery, allTokens, contractSearchResult, isContractAddress, isTokenImported]);

  // Handle manual refresh
  const handleRefresh = useCallback(async () => {
    if (!isWalletConnected || !walletAddress) return;
    
    setIsRefreshing(true);
    clearBalances();
    
    // Re-fetch balances for visible tokens
    const visibleTokens = searchResults.slice(0, 10).map(result => result.token);
    await Promise.all(visibleTokens.map(token => fetchBalanceForToken(token)));
    
    setIsRefreshing(false);
  }, [isWalletConnected, walletAddress, clearBalances, searchResults, fetchBalanceForToken]);

  // Handle token import
  const handleImportToken = useCallback(() => {
    if (contractSearchResult) {
      try {
        importToken(contractSearchResult);
        setShowImportWarning(false);
        setContractSearchResult(null);
        setSearchQuery('');
        setImportSuccess(true);
        
        // Hide success message after 3 seconds
        setTimeout(() => setImportSuccess(false), 3000);
      } catch (error) {
        console.error('Failed to import token:', error);
        alert('Failed to import token. Please try again.');
      }
    }
  }, [contractSearchResult, importToken]);

  // Handle token selection with validation
  const handleTokenSelect = useCallback((token: Token) => {
    try {
      // Validate token before selection
      if (!isValidToken(token)) {
        console.error('Invalid token selected:', token);
        alert('Invalid token. Please try selecting a different token.');
        return;
      }

      if (contractSearchResult && token.address === contractSearchResult.address) {
        // User clicked on contract search result - show import warning
        setShowImportWarning(true);
      } else {
        // Normalize token before passing to parent
        const normalizedToken = normalizeToken(token);
        console.log(`✅ Token selected: ${getTokenDisplayName(normalizedToken)} (${normalizedToken.address})`);
        onSelectToken(normalizedToken);
        onClose();
      }
    } catch (error) {
      console.error('Error selecting token:', error);
      alert('Error selecting token. Please try again.');
    }
  }, [contractSearchResult, onSelectToken, onClose]);

  // Copy address to clipboard
  const copyToClipboard = useCallback(async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      console.log(`📋 Copied to clipboard: ${address}`);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  }, []);

  // Handle click outside to close modal
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (isOpen && target.classList.contains('modal-backdrop')) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  // Reset search when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setContractSearchResult(null);
      setShowImportWarning(false);
      setImportSuccess(false);
      setSearchError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 modal-backdrop">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white truncate">
            {title}
          </h3>
          <div className="flex items-center space-x-1">
            {/* Refresh Button */}
            {isWalletConnected && (
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className={`p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors ${
                  isRefreshing ? 'cursor-not-allowed' : ''
                }`}
                title="Refresh balances"
              >
                <RefreshCw className={`w-4 h-4 text-gray-500 dark:text-gray-400 ${
                  isRefreshing ? 'animate-spin' : ''
                }`} />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="p-3 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search tokens or paste contract address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900 dark:text-white placeholder-gray-500 text-sm"
            />
            {isLoadingMetadata && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <RefreshCw className="w-4 h-4 text-gray-400 animate-spin" />
              </div>
            )}
          </div>
          
          {/* Status Indicator */}
          <div className="mt-2 flex items-center justify-center text-xs">
            {isWalletConnected ? (
              <div className="flex items-center space-x-1.5 text-green-600 dark:text-green-400">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                <span>Sorted by balance • Balances load as you scroll</span>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5 text-gray-500 dark:text-gray-400">
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full"></div>
                <span>Connect wallet to see balances</span>
              </div>
            )}
          </div>

          {/* Search Error */}
          {searchError && (
            <div className="mt-2 flex items-center space-x-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="text-sm text-red-700 dark:text-red-400">{searchError}</span>
            </div>
          )}

          {/* Import Success Message */}
          {importSuccess && (
            <div className="mt-2 flex items-center space-x-2 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="text-sm text-green-700 dark:text-green-400 font-medium">
                Token imported successfully!
              </span>
            </div>
          )}
        </div>

        {/* Token List - Scrollable */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="pb-2">
            {searchResults.length > 0 ? (
              <>
                {/* Contract Search Result with Import Warning */}
                {contractSearchResult && (
                  <div className="px-2 mb-2">
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 p-3 rounded-r-lg">
                      <div className="flex items-start space-x-2">
                        <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
                            Unlisted Token Found
                          </p>
                          <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                            This token is not in ReachSwap's default list. Anyone can create a token. 
                            Make sure this is the token you intend to trade.
                          </p>
                          
                          {/* Token Info */}
                          <div className="mt-2 p-2 bg-white dark:bg-gray-800 rounded-lg border">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-medium text-gray-900 dark:text-white text-sm">
                                  {getTokenDisplayName(contractSearchResult)}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {contractSearchResult.name}
                                </div>
                                <div className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                                  {contractSearchResult.address}
                                </div>
                              </div>
                              <button
                                onClick={() => copyToClipboard(contractSearchResult.address)}
                                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                                title="Copy contract address"
                              >
                                <Copy className="w-3 h-3 text-gray-400 hover:text-blue-500" />
                              </button>
                            </div>
                          </div>
                          
                          <button
                            onClick={handleImportToken}
                            className="mt-2 text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 text-sm font-medium hover:underline transition-colors"
                          >
                            Import Token
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Regular Token List */}
                <div className="space-y-1 px-2">
                  {searchResults.map((result) => (
                    <div key={result.token.address} className="relative">
                      <TokenModalRow
                        token={result.token}
                        isSelected={selectedToken?.address?.toLowerCase() === result.token.address?.toLowerCase()}
                        onSelect={handleTokenSelect}
                        balance={getTokenBalance(result.token)}
                        isLoading={isTokenLoading(result.token)}
                        onVisible={handleTokenVisible}
                        showCopyButton={true}
                        onCopyAddress={() => copyToClipboard(result.token.address)}
                        isImported={result.isImported}
                      />
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="p-6 text-center">
                <div className="text-gray-500 dark:text-gray-400 text-sm">
                  {searchQuery ? (
                    isContractAddress(searchQuery) ? (
                      isLoadingMetadata ? (
                        <div className="flex items-center justify-center space-x-2">
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Loading token metadata...</span>
                        </div>
                      ) : searchError ? (
                        searchError
                      ) : (
                        'No valid token found at this address'
                      )
                    ) : (
                      `No tokens found matching "${searchQuery}"`
                    )
                  ) : (
                    'No tokens available'
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Import Warning Modal */}
        {showImportWarning && contractSearchResult && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 max-w-xs w-full">
              <div className="flex items-center space-x-2 mb-3">
                <div className="w-8 h-8 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                </div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  Import Token
                </h3>
              </div>
              
              <div className="space-y-2 mb-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  This token doesn't appear on the active token list. Make sure this is the token you want to trade.
                </p>
                <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    {getTokenDisplayName(contractSearchResult)} - {contractSearchResult.name}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                    {contractSearchResult.address}
                  </div>
                </div>
              </div>
              
              <div className="flex space-x-2">
                <button
                  onClick={() => setShowImportWarning(false)}
                  className="flex-1 px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    handleImportToken();
                    try {
                      const normalizedToken = normalizeToken(contractSearchResult);
                      onSelectToken(normalizedToken);
                      onClose();
                    } catch (error) {
                      console.error('Error selecting imported token:', error);
                      alert('Error selecting token. Please try again.');
                    }
                  }}
                  className="flex-1 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors text-sm"
                >
                  Import & Select
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TokenModal;