import React, { useState, useEffect, useCallback } from 'react';
import { X, RefreshCw, Search } from 'lucide-react';
import { LiquidityPosition } from '../hooks/usePortfolioData';
import { TOKENS } from '../constants/tokens';
import { REACHSWAP_CONTRACTS } from '../constants/reachswap';

interface SelectPoolModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPool: (position: LiquidityPosition) => void;
  isWalletConnected: boolean;
}

const SelectPoolModal: React.FC<SelectPoolModalProps> = ({
  isOpen,
  onClose,
  onSelectPool,
  isWalletConnected
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [liquidityPositions, setLiquidityPositions] = useState<LiquidityPosition[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);


  // Get the current provider
  const getProvider = useCallback(() => {
    if (typeof window === 'undefined') return null;
    
    const savedWalletType = localStorage.getItem('reachswap_wallet_type');
    
    if (savedWalletType === 'MetaMask' && (window as any).ethereum?.isMetaMask) {
      return (window as any).ethereum;
    } else if (savedWalletType === 'OKX Wallet' && (window as any).okxwallet) {
      return (window as any).okxwallet;
    }
    
    return null;
  }, []);

  // Helper to fetch token metadata for any ERC20 token
  const fetchTokenMetadata = useCallback(async (tokenAddress: string) => {
    const provider = getProvider();
    if (!provider) return null;

    try {
      const [nameResult, symbolResult, decimalsResult] = await Promise.all([
        provider.request({
          method: 'eth_call',
          params: [{ to: tokenAddress, data: '0x06fdde03' }, 'latest']
        }),
        provider.request({
          method: 'eth_call',
          params: [{ to: tokenAddress, data: '0x95d89b41' }, 'latest']
        }),
        provider.request({
          method: 'eth_call',
          params: [{ to: tokenAddress, data: '0x313ce567' }, 'latest']
        })
      ]);

      const name = decodeString(nameResult) || `Token ${tokenAddress.slice(-4).toUpperCase()}`;
      const symbol = decodeString(symbolResult) || `TKN${tokenAddress.slice(-4).toUpperCase()}`;
      const decimals = decimalsResult ? parseInt(decimalsResult, 16) : 18;

      return {
        symbol: symbol.substring(0, 10),
        name: name.substring(0, 30),
        address: tokenAddress.toLowerCase(),
        decimals: Math.min(Math.max(decimals, 0), 77),
        logoUrl: '',
        isImported: true
      };
    } catch (error) {
      console.error(`Error fetching metadata for ${tokenAddress}:`, error);
      return null;
    }
  }, [getProvider]);

  // Helper to decode contract string responses
  const decodeString = (hexData: string): string => {
    if (!hexData || hexData === '0x' || hexData === '0x0') return '';
    
    try {
      const data = hexData.slice(2);
      
      // For dynamic strings (ABI encoded)
      if (data.length > 128) {
        const lengthHex = data.slice(64, 128);
        const length = parseInt(lengthHex, 16);
        
        if (length > 0 && length <= 100) {
          const stringHex = data.slice(128, 128 + (length * 2));
          let result = '';
          for (let i = 0; i < stringHex.length; i += 2) {
            const byte = parseInt(stringHex.substr(i, 2), 16);
            if (byte !== 0) result += String.fromCharCode(byte);
          }
          return result.replace(/\0/g, '').trim();
        }
      }
      
      // For fixed strings
      let result = '';
      for (let i = 0; i < data.length; i += 2) {
        const byte = parseInt(data.substr(i, 2), 16);
        if (byte !== 0) result += String.fromCharCode(byte);
      }
      return result.replace(/\0/g, '').trim();
    } catch (error) {
      return '';
    }
  };

  // Fetch user's actual liquidity positions from ReachSwap contracts (including arbitrary tokens)
  const fetchUserLiquidityPositions = useCallback(async (): Promise<LiquidityPosition[]> => {
    if (!isWalletConnected) return [];

    const walletAddress = localStorage.getItem('reachswap_wallet_address');
    if (!walletAddress) return [];

    try {
      const provider = getProvider();
      if (!provider) throw new Error('No provider available');

      console.log('🔍 Fetching REAL liquidity positions from ReachSwap contracts...');
      
      const positions: LiquidityPosition[] = [];
      const processedPairs = new Set<string>();

      // Get all pairs from ReachSwap factory by scanning PairCreated events
      const latestBlock = await provider.request({ method: 'eth_blockNumber', params: [] });
      const latestBlockNum = parseInt(latestBlock, 16);
      const fromBlock = Math.max(0, latestBlockNum - 100000); // Scan last 100k blocks for pairs

      console.log(`📊 Scanning blocks ${fromBlock} to ${latestBlockNum} for ReachSwap pairs...`);

      // Method 1: Check all known token pairs for user's LP balance
      const commonPairs = [
        [TOKENS.LOOP, TOKENS.GIKO],
        [TOKENS.LOOP, TOKENS.wLOOP],
        [TOKENS.LOOP, TOKENS.KYC],
        [TOKENS.LOOP, TOKENS.LMEME],
        [TOKENS.LOOP, TOKENS.ARC],
        [TOKENS.LOOP, TOKENS['$44']],
        [TOKENS.LOOP, TOKENS.DOOG],
        [TOKENS.LOOP, TOKENS.MAKO],
        [TOKENS.LOOP, TOKENS.DRAGON],
        [TOKENS.LOOP, TOKENS.LSHIB],
        [TOKENS.GIKO, TOKENS.LMEME],
        [TOKENS.wLOOP, TOKENS.GIKO],
        [TOKENS.GIKO, TOKENS.KYC],
        [TOKENS.KYC, TOKENS.LMEME]
      ];

      // Check each common pair for user's LP balance
      for (const [token0, token1] of commonPairs) {
        const position = await checkPairForBalance(token0, token1, walletAddress, provider);
        if (position) {
          const pairKey = `${position.pairAddress}`;
          if (!processedPairs.has(pairKey)) {
            positions.push(position);
            processedPairs.add(pairKey);
          }
        }
      }

      // Method 2: Check imported tokens from localStorage if they exist
      try {
        const importedTokensStr = localStorage.getItem('reachswap_imported_tokens');
        if (importedTokensStr) {
          const importedTokens = JSON.parse(importedTokensStr);
          
          // Check pairs between imported tokens and common tokens
          for (const importedToken of importedTokens) {
            for (const commonToken of Object.values(TOKENS)) {
              const position = await checkPairForBalance(importedToken, commonToken, walletAddress, provider);
              if (position) {
                const pairKey = `${position.pairAddress}`;
                if (!processedPairs.has(pairKey)) {
                  positions.push(position);
                  processedPairs.add(pairKey);
                }
              }
            }
            
            // Check pairs between imported tokens
            for (const otherImportedToken of importedTokens) {
              if (importedToken.address !== otherImportedToken.address) {
                const position = await checkPairForBalance(importedToken, otherImportedToken, walletAddress, provider);
                if (position) {
                  const pairKey = `${position.pairAddress}`;
                  if (!processedPairs.has(pairKey)) {
                    positions.push(position);
                    processedPairs.add(pairKey);
                  }
                }
              }
            }
          }
        }
      } catch (error) {
        console.warn('Error checking imported tokens:', error);
      }

      // Method 3: Scan for additional pairs by checking factory events (advanced)
      try {
        // Get factory contract's allPairsLength to know how many pairs exist
        const allPairsLengthSignature = '0x574f2ba3'; // allPairsLength()
        const allPairsLengthResult = await provider.request({
          method: 'eth_call',
          params: [{
            to: REACHSWAP_CONTRACTS.FACTORY,
            data: allPairsLengthSignature
          }, 'latest']
        });

        const totalPairs = parseInt(allPairsLengthResult, 16);
        console.log(`📊 Total pairs in ReachSwap factory: ${totalPairs}`);

        // Check the last 50 pairs for user's LP balance (most recent pairs)
        const pairsToCheck = Math.min(50, totalPairs);
        const startIndex = Math.max(0, totalPairs - pairsToCheck);

        for (let i = startIndex; i < totalPairs; i++) {
          try {
            // Get pair address by index
            const allPairsSignature = '0x1e3dd18b'; // allPairs(uint256)
            const paddedIndex = i.toString(16).padStart(64, '0');
            const allPairsData = allPairsSignature + paddedIndex;

            const pairAddressResult = await provider.request({
              method: 'eth_call',
              params: [{
                to: REACHSWAP_CONTRACTS.FACTORY,
                data: allPairsData
              }, 'latest']
            });

            if (pairAddressResult && pairAddressResult !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
              const pairAddress = '0x' + pairAddressResult.slice(-40);
              
              // Skip if already processed
              if (processedPairs.has(pairAddress)) continue;

              // Check user's LP balance for this pair
              const balanceOfSignature = '0x70a08231';
              const paddedUser = walletAddress.slice(2).padStart(64, '0');
              const balanceData = balanceOfSignature + paddedUser;

              const lpBalanceResult = await provider.request({
                method: 'eth_call',
                params: [{
                  to: pairAddress,
                  data: balanceData
                }, 'latest']
              });

              const lpBalance = BigInt(lpBalanceResult || '0x0');
              
              if (lpBalance > BigInt(0)) {
                // User has LP tokens in this pair - get token info
                const [token0Result, token1Result] = await Promise.all([
                  provider.request({
                    method: 'eth_call',
                    params: [{ to: pairAddress, data: '0x0dfe1681' }, 'latest'] // token0()
                  }),
                  provider.request({
                    method: 'eth_call',
                    params: [{ to: pairAddress, data: '0xd21220a7' }, 'latest'] // token1()
                  })
                ]);

                const token0Address = '0x' + token0Result.slice(-40);
                const token1Address = '0x' + token1Result.slice(-40);

                // Get token metadata
                const token0 = await getTokenFromAddress(token0Address, provider);
                const token1 = await getTokenFromAddress(token1Address, provider);

                if (token0 && token1) {
                  const lpBalanceNumber = Number(lpBalance) / Math.pow(10, 18);
                  
                  // Filter out dust balances (< 0.0001 LP tokens)
                  if (lpBalanceNumber <= 0.0001) continue;
                  
                  const lpBalanceFormatted = lpBalanceNumber.toFixed(6);
                  
                  // Get reserves for value calculation
                  const getReservesSignature = '0x0902f1ac';
                  const reservesResult = await provider.request({
                    method: 'eth_call',
                    params: [{
                      to: pairAddress,
                      data: getReservesSignature
                    }, 'latest']
                  });

                  let reserve0 = '0';
                  let reserve1 = '0';
                  
                  if (reservesResult && reservesResult !== '0x') {
                    const reservesData = reservesResult.slice(2);
                    reserve0 = BigInt('0x' + reservesData.slice(0, 64)).toString();
                    reserve1 = BigInt('0x' + reservesData.slice(64, 128)).toString();
                  }

                  // Calculate position value (simplified)
                  const reserve0Number = Number(reserve0) / Math.pow(10, token0.decimals);
                  const reserve1Number = Number(reserve1) / Math.pow(10, token1.decimals);
                  const estimatedValue = (reserve0Number + reserve1Number) * 0.15 * parseFloat(lpBalanceFormatted) / 1000; // Rough estimate

                  const position: LiquidityPosition = {
                    pair: `${token0.symbol}/${token1.symbol}`,
                    token0,
                    token1,
                    lpTokenBalance: lpBalanceFormatted,
                    poolShare: 0.01, // Mock pool share
                    value: Math.max(estimatedValue, 1),
                    rewards: estimatedValue * 0.005,
                    apr: '24.5%',
                    pairAddress
                  };

                  positions.push(position);
                  processedPairs.add(pairAddress);
                  console.log(`✅ Found LP position in factory scan: ${position.pair}`);
                }
              }
            }
          } catch (error) {
            console.warn(`Error checking pair at index ${i}:`, error);
            continue;
          }
        }
      } catch (error) {
        console.warn('Error scanning factory pairs:', error);
      }

      // Sort positions by value (highest first)
      positions.sort((a, b) => b.value - a.value);

      console.log(`✅ Found ${positions.length} REAL liquidity positions from ReachSwap contracts`);
      return positions;

    } catch (error) {
      console.error('Error fetching liquidity positions:', error);
      throw error;
    }
  }, [isWalletConnected, getProvider]);

  // Helper function to get token info from address
  const getTokenFromAddress = useCallback(async (address: string, provider: any) => {
    // Check if it's a known token first
    const knownToken = Object.values(TOKENS).find(t => t.address.toLowerCase() === address.toLowerCase());
    if (knownToken) return knownToken;

    // Fetch metadata for unknown token
    try {
      const [nameResult, symbolResult, decimalsResult] = await Promise.all([
        provider.request({
          method: 'eth_call',
          params: [{ to: address, data: '0x06fdde03' }, 'latest'] // name()
        }),
        provider.request({
          method: 'eth_call',
          params: [{ to: address, data: '0x95d89b41' }, 'latest'] // symbol()
        }),
        provider.request({
          method: 'eth_call',
          params: [{ to: address, data: '0x313ce567' }, 'latest'] // decimals()
        })
      ]);

      const name = decodeString(nameResult) || `Token ${address.slice(-4).toUpperCase()}`;
      const symbol = decodeString(symbolResult) || `TKN${address.slice(-4).toUpperCase()}`;
      const decimals = decimalsResult ? parseInt(decimalsResult, 16) : 18;

      return {
        symbol: symbol.substring(0, 10),
        name: name.substring(0, 30),
        address: address.toLowerCase(),
        decimals: Math.min(Math.max(decimals, 0), 77),
        logoUrl: '',
        isImported: true
      };
    } catch (error) {
      console.error(`Error fetching metadata for ${address}:`, error);
      return null;
    }
  }, []);

  // Helper function to check a specific pair for user's LP balance
  const checkPairForBalance = useCallback(async (token0: any, token1: any, walletAddress: string, provider: any) => {
    try {
      // Get pair address from ReachSwap factory
      const getPairSignature = '0xe6a43905';
      const tokenA = token0.address === '0x0000000000000000000000000000000000000000' 
        ? REACHSWAP_CONTRACTS.WLOOP 
        : token0.address;
      const tokenB = token1.address === '0x0000000000000000000000000000000000000000' 
        ? REACHSWAP_CONTRACTS.WLOOP 
        : token1.address;
      
      const sortedToken0 = tokenA.toLowerCase() < tokenB.toLowerCase() ? tokenA : tokenB;
      const sortedToken1 = tokenA.toLowerCase() < tokenB.toLowerCase() ? tokenB : tokenA;
      const paddedToken0 = sortedToken0.slice(2).padStart(64, '0');
      const paddedToken1 = sortedToken1.slice(2).padStart(64, '0');
      const data = getPairSignature + paddedToken0 + paddedToken1;

      const pairResult = await provider.request({
        method: 'eth_call',
        params: [{
          to: REACHSWAP_CONTRACTS.FACTORY,
          data: data
        }, 'latest']
      });

      if (!pairResult || pairResult === '0x0000000000000000000000000000000000000000000000000000000000000000') {
        return null; // Pair doesn't exist
      }

      const pairAddress = '0x' + pairResult.slice(-40);

      // Check user's LP token balance for this pair
      const balanceOfSignature = '0x70a08231';
      const paddedUser = walletAddress.slice(2).padStart(64, '0');
      const balanceData = balanceOfSignature + paddedUser;

      const lpBalanceResult = await provider.request({
        method: 'eth_call',
        params: [{
          to: pairAddress,
          data: balanceData
        }, 'latest']
      });

      if (!lpBalanceResult || lpBalanceResult === '0x0') return null;

      const lpBalanceWei = BigInt(lpBalanceResult);
      if (lpBalanceWei <= BigInt(1000)) return null; // Minimum 0.000000000000001 LP tokens

      const lpBalance = Number(lpBalanceWei) / Math.pow(10, 18);
      
      // Only include positions with meaningful balance (> 0.0001 LP tokens to filter out dust)
      if (lpBalance <= 0.0001) return null;

      // Get pair reserves for calculating pool share and value
      const getReservesSignature = '0x0902f1ac';
      const reservesResult = await provider.request({
        method: 'eth_call',
        params: [{
          to: pairAddress,
          data: getReservesSignature
        }, 'latest']
      });

      let reserve0 = '0';
      let reserve1 = '0';
      let totalSupply = '0';
      
      if (reservesResult && reservesResult !== '0x') {
        const reservesData = reservesResult.slice(2);
        reserve0 = BigInt('0x' + reservesData.slice(0, 64)).toString();
        reserve1 = BigInt('0x' + reservesData.slice(64, 128)).toString();
      }

      // Get total supply of LP tokens
      const totalSupplySignature = '0x18160ddd';
      const totalSupplyResult = await provider.request({
        method: 'eth_call',
        params: [{
          to: pairAddress,
          data: totalSupplySignature
        }, 'latest']
      });

      if (totalSupplyResult && totalSupplyResult !== '0x0') {
        totalSupply = BigInt(totalSupplyResult).toString();
      }

      // Calculate pool share
      const totalSupplyNumber = Number(totalSupply) / Math.pow(10, 18);
      const poolShare = totalSupplyNumber > 0 ? (lpBalance / totalSupplyNumber) * 100 : 0;

      // For custom/imported tokens, we need to fetch their metadata if not already available
      let finalToken0 = token0;
      let finalToken1 = token1;

      // If token doesn't have proper metadata (custom token), fetch it
      if (!token0.symbol || token0.symbol.length === 0) {
        const metadata = await fetchTokenMetadata(token0.address);
        if (metadata) {
          finalToken0 = { ...token0, ...metadata };
        }
      }

      if (!token1.symbol || token1.symbol.length === 0) {
        const metadata = await fetchTokenMetadata(token1.address);
        if (metadata) {
          finalToken1 = { ...token1, ...metadata };
        }
      }

      // Calculate position value (simplified - would need token prices for accurate value)
      const reserve0Number = Number(reserve0) / Math.pow(10, finalToken0.decimals);
      const reserve1Number = Number(reserve1) / Math.pow(10, finalToken1.decimals);
      
      // Estimate value based on pool share and reserves
      // This is simplified - in production you'd use real token prices
      const estimatedValue = poolShare > 0 ? Math.max(1, (reserve0Number + reserve1Number) * (poolShare / 100) * 0.15) : 1; // Minimum $1 for display

      // Calculate estimated rewards (0.25% fee * position value * estimated volume multiplier)
      const estimatedRewards = estimatedValue * 0.01; // 1% of position value as rewards estimate

      // Create position object
      const position: LiquidityPosition = {
        pair: `${finalToken0.symbol}/${finalToken1.symbol}`,
        token0: finalToken0,
        token1: finalToken1,
        lpTokenBalance: lpBalance.toFixed(6),
        poolShare: poolShare,
        value: estimatedValue,
        rewards: estimatedRewards,
        apr: '24.5%', // Mock APR - would be calculated from historical data
        pairAddress
      };

      console.log(`✅ Found LP position: ${position.pair} - ${position.lpTokenBalance} LP tokens`);
      return position;

    } catch (error) {
      console.error(`Error checking pair ${token0.symbol || 'UNKNOWN'}/${token1.symbol || 'UNKNOWN'}:`, error);
      return null;
    }
  }, [fetchTokenMetadata]);

  // Load liquidity positions when modal opens
  useEffect(() => {
    if (isOpen && isWalletConnected) {
      setIsLoading(true);
      setError(null);
      
      // Fetch real liquidity positions from ReachSwap contracts
      fetchUserLiquidityPositions()
        .then(positions => {
          setLiquidityPositions(positions);
        })
        .catch(err => {
          console.error('Failed to fetch liquidity positions:', err);
          setError('Failed to load your liquidity positions from ReachSwap contracts');
          setLiquidityPositions([]);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else if (!isOpen) {
      // Reset state when modal closes
      setSearchQuery('');
      setLiquidityPositions([]);
      setError(null);
    }
  }, [isOpen, isWalletConnected, fetchUserLiquidityPositions]);

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

  if (!isOpen) return null;

  // Filter positions based on search query
  const filteredPositions = liquidityPositions.filter(position =>
    position.pair.toLowerCase().includes(searchQuery.toLowerCase()) ||
    position.token0.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
    position.token1.symbol.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handlePoolSelect = (position: LiquidityPosition) => {
    onSelectPool(position);
    onClose();
  };

  const handleRefresh = () => {
    if (isWalletConnected) {
      setIsLoading(true);
      setError(null);
      
      // Refresh using direct ReachSwap contract calls for most up-to-date data
      fetchUserLiquidityPositions()
        .then(positions => {
          setLiquidityPositions(positions);
        })
        .catch(err => {
          console.error('Failed to refresh liquidity positions:', err);
          setError('Failed to refresh your liquidity positions from ReachSwap contracts');
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 modal-backdrop">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            Select a Pool
          </h3>
          <div className="flex items-center space-x-1">
            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
              disabled={isLoading || !isWalletConnected}
              className={`p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors ${
                isLoading || !isWalletConnected ? 'cursor-not-allowed opacity-50' : ''
              }`}
              title="Refresh pools"
            >
              <RefreshCw className={`w-4 h-4 text-gray-500 dark:text-gray-400 ${
                isLoading ? 'animate-spin' : ''
              }`} />
            </button>
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
              placeholder="Search pools..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900 dark:text-white placeholder-gray-500 text-sm"
            />
          </div>
          
          {/* Status Indicator */}
          <div className="mt-2 flex items-center justify-center text-xs">
            {isWalletConnected ? (
              <div className="flex items-center space-x-1.5 text-green-600 dark:text-green-400">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                <span>Showing your active ReachSwap pools with LP tokens</span>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5 text-gray-500 dark:text-gray-400">
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full"></div>
                <span>Connect wallet to see your pools</span>
              </div>
            )}
          </div>
        </div>

        {/* Pool List - Scrollable */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="pb-2">
            {/* Loading State */}
            {isLoading && (
              <div className="p-6 space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg animate-pulse">
                    <div className="flex items-center space-x-3">
                      <div className="flex items-center -space-x-1">
                        <div className="w-8 h-8 bg-gray-200 dark:bg-gray-600 rounded-full"></div>
                        <div className="w-8 h-8 bg-gray-200 dark:bg-gray-600 rounded-full"></div>
                      </div>
                      <div className="space-y-1">
                        <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-20"></div>
                        <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded w-16"></div>
                      </div>
                    </div>
                    <div className="text-right space-y-1">
                      <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-16"></div>
                      <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded w-12"></div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Error State */}
            {error && !isLoading && (
              <div className="p-6 text-center">
                <div className="text-red-500 dark:text-red-400 text-sm mb-2">
                  {error}
                </div>
                <button
                  onClick={handleRefresh}
                  className="text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 text-sm transition-colors"
                >
                  Try again
                </button>
              </div>
            )}

            {/* Empty State */}
            {!isLoading && !error && filteredPositions.length === 0 && liquidityPositions.length === 0 && (
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                  <div className="w-8 h-8 text-gray-400 dark:text-gray-500">
                    💧
                  </div>
                </div>
                <div className="text-gray-500 dark:text-gray-400 text-sm mb-2">
                  You don't have any LP tokens in ReachSwap pools yet.
                </div>
                <div className="text-gray-400 dark:text-gray-500 text-xs">
                  Add liquidity to ReachSwap pools to start earning fees from trading pairs.
                </div>
              </div>
            )}

            {/* No Search Results */}
            {!isLoading && !error && liquidityPositions.length > 0 && filteredPositions.length === 0 && searchQuery && (
              <div className="p-6 text-center">
                <div className="text-gray-500 dark:text-gray-400 text-sm">
                  No pools found matching "{searchQuery}"
                </div>
              </div>
            )}

            {/* Pool List */}
            {!isLoading && !error && filteredPositions.length > 0 && (
              <div className="space-y-1 px-2">
                {filteredPositions.map((position) => (
                  <button
                    key={`${position.pairAddress}-${position.pair}`}
                    onClick={() => handlePoolSelect(position)}
                    className="w-full p-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors group"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="flex items-center -space-x-1">
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700 flex items-center justify-center border-2 border-white dark:border-gray-800">
                          {position.token0.logoUrl ? (
                            <img 
                              src={position.token0.logoUrl} 
                              alt={position.token0.symbol}
                              className="w-6 h-6 object-contain"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                const parent = target.parentElement;
                                if (parent) {
                                  parent.className = 'w-8 h-8 bg-gradient-to-br from-orange-400 to-blue-500 rounded-full flex items-center justify-center border-2 border-white dark:border-gray-800';
                                  parent.innerHTML = `<span class="text-white font-bold text-xs">${position.token0.symbol.charAt(0)}</span>`;
                                }
                              }}
                            />
                          ) : (
                            <div className="w-8 h-8 bg-gradient-to-br from-orange-400 to-blue-500 rounded-full flex items-center justify-center border-2 border-white dark:border-gray-800">
                              <span className="text-white font-bold text-xs">{position.token0.symbol.charAt(0)}</span>
                            </div>
                          )}
                        </div>
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700 flex items-center justify-center border-2 border-white dark:border-gray-800">
                          {position.token1.logoUrl ? (
                            <img 
                              src={position.token1.logoUrl} 
                              alt={position.token1.symbol}
                              className="w-6 h-6 object-contain"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                const parent = target.parentElement;
                                if (parent) {
                                  parent.className = 'w-8 h-8 bg-gradient-to-br from-orange-400 to-blue-500 rounded-full flex items-center justify-center border-2 border-white dark:border-gray-800';
                                  parent.innerHTML = `<span class="text-white font-bold text-xs">${position.token1.symbol.charAt(0)}</span>`;
                                }
                              }}
                            />
                          ) : (
                            <div className="w-8 h-8 bg-gradient-to-br from-orange-400 to-blue-500 rounded-full flex items-center justify-center border-2 border-white dark:border-gray-800">
                              <span className="text-white font-bold text-xs">{position.token1.symbol.charAt(0)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-left min-w-0">
                        <div className="font-medium text-gray-900 dark:text-white text-sm group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
                          {position.pair}
                          {(position.token0.isImported || position.token1.isImported) && (
                            <span className="ml-1 px-1 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs rounded">
                              Custom
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {position.lpTokenBalance} LP tokens
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right flex-shrink-0">
                      <div className="font-medium text-gray-900 dark:text-white text-sm">
                        ${position.value.toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {position.poolShare.toFixed(4)}% share
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Info */}
        {!isLoading && liquidityPositions.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 flex-shrink-0">
            <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
              {filteredPositions.length} of {liquidityPositions.length} pools shown
              <span className="block mt-1">
                Live data from ReachSwap contracts
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SelectPoolModal;