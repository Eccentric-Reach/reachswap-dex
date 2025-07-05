import React, { useState, useCallback, useEffect } from 'react';
import { Plus, Minus, Settings } from 'lucide-react';
import { Token } from '../types';
import { TOKENS } from '../constants/tokens';
import { useTokenBalances } from '../hooks/useTokenBalances';
import { LiquidityPosition } from '../hooks/usePortfolioData';
import { normalizeToken, isValidToken, getTokenDisplayName, getTokenLogoUrl } from '../utils/tokenUtils';
import TokenModal from './TokenModal';
import LiquidityConfirmModal from './LiquidityConfirmModal';
import RemoveLiquidityModal from './RemoveLiquidityModal';
import SelectPoolModal from './SelectPoolModal';
import SwapSettingsModal from './SwapSettingsModal';

interface LiquidityInterfaceProps {
  isWalletConnected: boolean;
  onConnectWallet: () => void;
}

const LiquidityInterface: React.FC<LiquidityInterfaceProps> = ({ isWalletConnected, onConnectWallet }) => {
  // Tab state
  const [activeTab, setActiveTab] = useState<'add' | 'remove'>('add');
  
  // Add Liquidity state
  const [liquidityToken0, setLiquidityToken0] = useState<Token>(TOKENS.LOOP);
  const [liquidityToken1, setLiquidityToken1] = useState<Token>(TOKENS.GIKO);
  const [liquidityAmount0, setLiquidityAmount0] = useState('');
  const [liquidityAmount1, setLiquidityAmount1] = useState('');
  const [isLiquidityToken0ModalOpen, setIsLiquidityToken0ModalOpen] = useState(false);
  const [isLiquidityToken1ModalOpen, setIsLiquidityToken1ModalOpen] = useState(false);
  const [isLiquidityConfirmModalOpen, setIsLiquidityConfirmModalOpen] = useState(false);
  
  // Remove Liquidity state
  const [selectedLiquidityPosition, setSelectedLiquidityPosition] = useState<LiquidityPosition | null>(null);
  const [isSelectPoolModalOpen, setIsSelectPoolModalOpen] = useState(false);
  const [isRemoveLiquidityModalOpen, setIsRemoveLiquidityModalOpen] = useState(false);
  const [isRemovingLiquidity, setIsRemovingLiquidity] = useState(false);
  
  // Settings state
  const [slippage, setSlippage] = useState('0.5');
  const [gasPrice, setGasPrice] = useState('10');
  const [expertMode, setExpertMode] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  
  // Hooks
  const walletAddress = localStorage.getItem('reachswap_wallet_address');
  const { getTokenBalance, fetchBalanceForToken } = useTokenBalances(isWalletConnected, walletAddress || undefined);

  // Fetch balances when tokens change
  useEffect(() => {
    if (isWalletConnected && walletAddress && isValidToken(liquidityToken0)) {
      console.log(`🔄 Liquidity token 0 changed to ${liquidityToken0.symbol}, fetching balance...`);
      fetchBalanceForToken(liquidityToken0);
    }
  }, [liquidityToken0, isWalletConnected, walletAddress, fetchBalanceForToken]);

  useEffect(() => {
    if (isWalletConnected && walletAddress && isValidToken(liquidityToken1)) {
      console.log(`🔄 Liquidity token 1 changed to ${liquidityToken1.symbol}, fetching balance...`);
      fetchBalanceForToken(liquidityToken1);
    }
  }, [liquidityToken1, isWalletConnected, walletAddress, fetchBalanceForToken]);

  // Calculate liquidity ratio
  const calculateLiquidityRatio = useCallback((amount: string, fromToken: Token, toToken: Token) => {
    if (!amount || parseFloat(amount) <= 0) return '0';
    
    // Mock calculation - in real implementation, this would query pool reserves
    const rate = (fromToken.price || 1) / (toToken.price || 1);
    return (parseFloat(amount) * rate).toFixed(6);
  }, []);

  // Handle liquidity amount changes
  const handleLiquidityAmount0Change = (value: string) => {
    setLiquidityAmount0(value);
    if (value) {
      const amount1 = calculateLiquidityRatio(value, liquidityToken0, liquidityToken1);
      setLiquidityAmount1(amount1);
    } else {
      setLiquidityAmount1('');
    }
  };

  const handleLiquidityAmount1Change = (value: string) => {
    setLiquidityAmount1(value);
    if (value) {
      const amount0 = calculateLiquidityRatio(value, liquidityToken1, liquidityToken0);
      setLiquidityAmount0(amount0);
    } else {
      setLiquidityAmount0('');
    }
  };

  // Handle token selection with validation and normalization
  const handleLiquidityToken0Select = (token: Token) => {
    try {
      if (!isValidToken(token)) {
        console.error('Invalid token selected for liquidityToken0:', token);
        alert('Invalid token selected. Please try again.');
        return;
      }
      
      const normalizedToken = normalizeToken(token);
      console.log(`🔄 Selected liquidity token 0: ${normalizedToken.symbol} (${normalizedToken.address})`);
      setLiquidityToken0(normalizedToken);
      setIsLiquidityToken0ModalOpen(false);
      
      // Fetch balance immediately for the new token
      if (isWalletConnected && walletAddress) {
        fetchBalanceForToken(normalizedToken);
      }
    } catch (error) {
      console.error('Error selecting liquidityToken0:', error);
      alert('Error selecting token. Please try again.');
    }
  };

  const handleLiquidityToken1Select = (token: Token) => {
    try {
      if (!isValidToken(token)) {
        console.error('Invalid token selected for liquidityToken1:', token);
        alert('Invalid token selected. Please try again.');
        return;
      }
      
      const normalizedToken = normalizeToken(token);
      console.log(`🔄 Selected liquidity token 1: ${normalizedToken.symbol} (${normalizedToken.address})`);
      setLiquidityToken1(normalizedToken);
      setIsLiquidityToken1ModalOpen(false);
      
      // Fetch balance immediately for the new token
      if (isWalletConnected && walletAddress) {
        fetchBalanceForToken(normalizedToken);
      }
    } catch (error) {
      console.error('Error selecting liquidityToken1:', error);
      alert('Error selecting token. Please try again.');
    }
  };

  // Handle add liquidity
  const handleAddLiquidity = async () => {
    console.log('Adding liquidity:', {
      token0: liquidityToken0.symbol,
      token1: liquidityToken1.symbol,
      amount0: liquidityAmount0,
      amount1: liquidityAmount1
    });
    
    // Mock implementation
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    setIsLiquidityConfirmModalOpen(false);
    setLiquidityAmount0('');
    setLiquidityAmount1('');
    
    // Refresh balances after successful liquidity addition
    setTimeout(() => {
      if (isValidToken(liquidityToken0)) fetchBalanceForToken(liquidityToken0);
      if (isValidToken(liquidityToken1)) fetchBalanceForToken(liquidityToken1);
    }, 2000);
    
    alert('Liquidity added successfully!');
  };

  // Handle remove liquidity
  const handleRemoveLiquidity = async (position: LiquidityPosition, percentage: number) => {
    setIsRemovingLiquidity(true);
    
    try {
      console.log(`Removing ${percentage}% of ${position.pair} liquidity...`);
      
      // Mock implementation
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      console.log('Liquidity removed successfully!');
      setIsRemoveLiquidityModalOpen(false);
      setSelectedLiquidityPosition(null);
      
      // Refresh balances after successful liquidity removal
      setTimeout(() => {
        if (isValidToken(position.token0)) fetchBalanceForToken(position.token0);
        if (isValidToken(position.token1)) fetchBalanceForToken(position.token1);
      }, 2000);
      
      alert('Liquidity removed successfully!');
      
    } catch (error) {
      console.error('Remove liquidity failed:', error);
      alert('Remove liquidity failed!');
    } finally {
      setIsRemovingLiquidity(false);
    }
  };

  // Validation functions
  const getInsufficientBalanceError = (token: Token, amount: string) => {
    if (!isWalletConnected || !amount || !isValidToken(token)) return null;
    const balance = parseFloat(getTokenBalance(token));
    const inputAmount = parseFloat(amount);
    return inputAmount > balance ? 'Insufficient balance' : null;
  };

  const canAddLiquidity = () => {
    if (!isWalletConnected || !liquidityAmount0 || !liquidityAmount1) return false;
    if (!isValidToken(liquidityToken0) || !isValidToken(liquidityToken1)) return false;
    const insufficient0 = getInsufficientBalanceError(liquidityToken0, liquidityAmount0);
    const insufficient1 = getInsufficientBalanceError(liquidityToken1, liquidityAmount1);
    return !insufficient0 && !insufficient1;
  };

  const getLiquidityButtonText = () => {
    if (!isWalletConnected) return 'Connect Wallet';
    if (!liquidityAmount0 || !liquidityAmount1) return 'Enter Amounts';
    if (!isValidToken(liquidityToken0) || !isValidToken(liquidityToken1)) return 'Invalid Token';
    const insufficient0 = getInsufficientBalanceError(liquidityToken0, liquidityAmount0);
    const insufficient1 = getInsufficientBalanceError(liquidityToken1, liquidityAmount1);
    if (insufficient0 || insufficient1) return 'Insufficient Balance';
    return 'Add Liquidity';
  };

  const getRemoveLiquidityButtonText = () => {
    if (!isWalletConnected) return 'Connect Wallet';
    if (!selectedLiquidityPosition) return 'Select Pool';
    return 'Remove Liquidity';
  };

  // Safe token rendering helpers
  const renderTokenButton = (token: Token, onClick: () => void) => {
    const logoUrl = getTokenLogoUrl(token);
    const displayName = getTokenDisplayName(token);
    
    return (
      <button
        onClick={onClick}
        className="flex items-center space-x-2 bg-white dark:bg-gray-600 hover:bg-gray-50 dark:hover:bg-gray-500 rounded-lg px-3 py-2 transition-colors"
      >
        {logoUrl ? (
          <img 
            src={logoUrl} 
            alt={displayName}
            className="w-6 h-6 rounded-full"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              const parent = target.parentElement;
              if (parent) {
                parent.innerHTML = `<div class="w-6 h-6 bg-gradient-to-br from-orange-400 to-blue-500 rounded-full flex items-center justify-center"><span class="text-white font-bold text-xs">${displayName.charAt(0)}</span></div>` + parent.innerHTML.substring(parent.innerHTML.indexOf('</div>') + 6);
              }
            }}
          />
        ) : (
          <div className="w-6 h-6 bg-gradient-to-br from-orange-400 to-blue-500 rounded-full flex items-center justify-center">
            <span className="text-white font-bold text-xs">{displayName.charAt(0)}</span>
          </div>
        )}
        <span className="font-medium text-gray-900 dark:text-white">{displayName}</span>
      </button>
    );
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header with Tabs */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {activeTab === 'add' ? 'Add Liquidity' : 'Remove Liquidity'}
            </h2>
            <button
              onClick={() => setIsSettingsModalOpen(true)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <Settings className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>
          
          {/* Tab Navigation */}
          <div className="flex space-x-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            {[
              { id: 'add', label: 'Add Liquidity', icon: Plus },
              { id: 'remove', label: 'Remove Liquidity', icon: Minus }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 flex items-center justify-center space-x-2 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.id === 'add' ? 'Add' : 'Remove'}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          {activeTab === 'add' && (
            <div className="space-y-4">
              {/* Token 0 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">First Token</label>
                  {isWalletConnected && isValidToken(liquidityToken0) && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Balance: {getTokenBalance(liquidityToken0)}
                    </span>
                  )}
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <input
                      type="number"
                      placeholder="0.0"
                      value={liquidityAmount0}
                      onChange={(e) => handleLiquidityAmount0Change(e.target.value)}
                      className="bg-transparent text-xl font-semibold text-gray-900 dark:text-white placeholder-gray-400 border-none outline-none flex-1"
                    />
                    {renderTokenButton(liquidityToken0, () => setIsLiquidityToken0ModalOpen(true))}
                  </div>
                  {getInsufficientBalanceError(liquidityToken0, liquidityAmount0) && (
                    <div className="mt-1 text-xs text-red-500">
                      {getInsufficientBalanceError(liquidityToken0, liquidityAmount0)}
                    </div>
                  )}
                </div>
              </div>

              {/* Plus Icon */}
              <div className="flex justify-center">
                <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                  <Plus className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                </div>
              </div>

              {/* Token 1 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Second Token</label>
                  {isWalletConnected && isValidToken(liquidityToken1) && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Balance: {getTokenBalance(liquidityToken1)}
                    </span>
                  )}
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <input
                      type="number"
                      placeholder="0.0"
                      value={liquidityAmount1}
                      onChange={(e) => handleLiquidityAmount1Change(e.target.value)}
                      className="bg-transparent text-xl font-semibold text-gray-900 dark:text-white placeholder-gray-400 border-none outline-none flex-1"
                    />
                    {renderTokenButton(liquidityToken1, () => setIsLiquidityToken1ModalOpen(true))}
                  </div>
                  {getInsufficientBalanceError(liquidityToken1, liquidityAmount1) && (
                    <div className="mt-1 text-xs text-red-500">
                      {getInsufficientBalanceError(liquidityToken1, liquidityAmount1)}
                    </div>
                  )}
                </div>
              </div>

              {/* Pool Info */}
              {liquidityAmount0 && liquidityAmount1 && isValidToken(liquidityToken0) && isValidToken(liquidityToken1) && (
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Pool Share</span>
                    <span className="text-gray-900 dark:text-white">0.01%</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Exchange Rate</span>
                    <span className="text-gray-900 dark:text-white">
                      1 {getTokenDisplayName(liquidityToken0)} = {(parseFloat(liquidityAmount1) / parseFloat(liquidityAmount0)).toFixed(6)} {getTokenDisplayName(liquidityToken1)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Estimated APR</span>
                    <span className="text-green-600 dark:text-green-400 font-medium">25.4%</span>
                  </div>
                </div>
              )}

              {/* Add Liquidity Button */}
              <button
                onClick={canAddLiquidity() ? () => setIsLiquidityConfirmModalOpen(true) : onConnectWallet}
                disabled={isWalletConnected && !canAddLiquidity()}
                className={`w-full py-4 rounded-xl font-semibold transition-all duration-200 ${
                  canAddLiquidity() || !isWalletConnected
                    ? 'bg-gradient-to-r from-orange-500 to-blue-600 hover:from-orange-600 hover:to-blue-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
                    : 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                }`}
              >
                {getLiquidityButtonText()}
              </button>
            </div>
          )}

          {activeTab === 'remove' && (
            <div className="space-y-4">
              {/* Pool Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Select Pool</label>
                <button
                  onClick={() => setIsSelectPoolModalOpen(true)}
                  disabled={!isWalletConnected}
                  className="w-full bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-xl p-4 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {selectedLiquidityPosition ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="flex items-center -space-x-1">
                          <img 
                            src={selectedLiquidityPosition.token0.logoUrl} 
                            alt={selectedLiquidityPosition.token0.symbol}
                            className="w-6 h-6 rounded-full border border-white dark:border-gray-700"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              const parent = target.parentElement;
                              if (parent) {
                                parent.innerHTML = `<div class="w-6 h-6 bg-gradient-to-br from-orange-400 to-blue-500 rounded-full flex items-center justify-center border border-white dark:border-gray-700"><span class="text-white font-bold text-xs">${selectedLiquidityPosition.token0.symbol.charAt(0)}</span></div>` + parent.innerHTML.substring(parent.innerHTML.indexOf('</div>') + 6);
                              }
                            }}
                          />
                          <img 
                            src={selectedLiquidityPosition.token1.logoUrl} 
                            alt={selectedLiquidityPosition.token1.symbol}
                            className="w-6 h-6 rounded-full border border-white dark:border-gray-700"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              const parent = target.parentElement;
                              if (parent) {
                                parent.innerHTML = `<div class="w-6 h-6 bg-gradient-to-br from-orange-400 to-blue-500 rounded-full flex items-center justify-center border border-white dark:border-gray-700"><span class="text-white font-bold text-xs">${selectedLiquidityPosition.token1.symbol.charAt(0)}</span></div>` + parent.innerHTML.substring(parent.innerHTML.indexOf('</div>') + 6);
                              }
                            }}
                          />
                        </div>
                        <div className="text-left">
                          <div className="font-medium text-gray-900 dark:text-white">
                            {selectedLiquidityPosition.pair}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {selectedLiquidityPosition.lpTokenBalance} LP tokens
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium text-gray-900 dark:text-white">
                          ${selectedLiquidityPosition.value.toFixed(2)}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {selectedLiquidityPosition.poolShare.toFixed(4)}% share
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-gray-500 dark:text-gray-400">
                      {isWalletConnected ? 'Select a pool to remove liquidity' : 'Connect wallet to view pools'}
                    </div>
                  )}
                </button>
              </div>

              {/* Pool Details */}
              {selectedLiquidityPosition && (
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Your Pool Share</span>
                    <span className="text-gray-900 dark:text-white">{selectedLiquidityPosition.poolShare.toFixed(4)}%</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Pool Value</span>
                    <span className="text-gray-900 dark:text-white">${selectedLiquidityPosition.value.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Unclaimed Rewards</span>
                    <span className="text-green-600 dark:text-green-400 font-medium">${selectedLiquidityPosition.rewards.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">APR</span>
                    <span className="text-green-600 dark:text-green-400 font-medium">{selectedLiquidityPosition.apr}</span>
                  </div>
                </div>
              )}

              {/* Remove Liquidity Button */}
              <button
                onClick={selectedLiquidityPosition ? () => setIsRemoveLiquidityModalOpen(true) : onConnectWallet}
                disabled={isWalletConnected && !selectedLiquidityPosition}
                className={`w-full py-4 rounded-xl font-semibold transition-all duration-200 ${
                  selectedLiquidityPosition || !isWalletConnected
                    ? 'bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-600 hover:to-orange-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
                    : 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center justify-center space-x-2">
                  <Minus className="w-4 h-4" />
                  <span>{getRemoveLiquidityButtonText()}</span>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <TokenModal
        isOpen={isLiquidityToken0ModalOpen}
        onClose={() => setIsLiquidityToken0ModalOpen(false)}
        onSelectToken={handleLiquidityToken0Select}
        selectedToken={liquidityToken0}
        title="Select First Token"
        isWalletConnected={isWalletConnected}
      />

      <TokenModal
        isOpen={isLiquidityToken1ModalOpen}
        onClose={() => setIsLiquidityToken1ModalOpen(false)}
        onSelectToken={handleLiquidityToken1Select}
        selectedToken={liquidityToken1}
        title="Select Second Token"
        isWalletConnected={isWalletConnected}
      />

      <LiquidityConfirmModal
        isOpen={isLiquidityConfirmModalOpen}
        onClose={() => setIsLiquidityConfirmModalOpen(false)}
        onConfirm={handleAddLiquidity}
        token0={liquidityToken0}
        token1={liquidityToken1}
        amount0={liquidityAmount0}
        amount1={liquidityAmount1}
        poolShare={0.01}
        estimatedAPR="25.4%"
        gasPrice={gasPrice}
      />

      <SelectPoolModal
        isOpen={isSelectPoolModalOpen}
        onClose={() => setIsSelectPoolModalOpen(false)}
        onSelectPool={(position) => {
          setSelectedLiquidityPosition(position);
          setIsSelectPoolModalOpen(false);
        }}
        isWalletConnected={isWalletConnected}
      />

      <RemoveLiquidityModal
        isOpen={isRemoveLiquidityModalOpen}
        onClose={() => {
          setIsRemoveLiquidityModalOpen(false);
        }}
        onConfirm={handleRemoveLiquidity}
        position={selectedLiquidityPosition}
        isLoading={isRemovingLiquidity}
      />

      <SwapSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        slippage={slippage}
        onSlippageChange={setSlippage}
        gasPrice={gasPrice}
        onGasPriceChange={setGasPrice}
        expertMode={expertMode}
        onExpertModeChange={setExpertMode}
      />
    </div>
  );
};

export default LiquidityInterface;