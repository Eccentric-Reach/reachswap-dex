import React, { useState, useEffect } from 'react';
import { X, Wallet, AlertCircle, CheckCircle, ExternalLink, RefreshCw } from 'lucide-react';

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (walletType: string, address: string) => void;
  onDisconnect: () => void;
  isConnected: boolean;
  connectedWallet?: string;
  walletAddress?: string;
}

const walletOptions = [
  {
    id: 'metamask',
    name: 'MetaMask',
    icon: '/Metamask_logo-removebg-preview.png',
    description: 'Connect using browser extension',
    downloadUrl: 'https://metamask.io/download/',
  },
  {
    id: 'okx',
    name: 'OKX Wallet',
    icon: '/okx-logo--removebg-preview.png', 
    description: 'Connect using OKX Wallet',
    downloadUrl: 'https://web3.okx.com/',
  },
];

const LOOP_NETWORK = {
  chainId: '0x3CBF', // 15551 in hex
  chainName: 'LOOP Mainnet',
  nativeCurrency: { name: 'LOOP', symbol: 'LOOP', decimals: 18 },
  rpcUrls: ['https://api.mainnetloop.com'],
  blockExplorerUrls: ['https://explorer.mainnetloop.com']
};

const WalletModal: React.FC<WalletModalProps> = ({
  isOpen,
  onClose,
  onConnect,
  onDisconnect,
  isConnected,
  connectedWallet,
  walletAddress
}) => {
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check if wallet is installed
  const isWalletInstalled = (walletId: string) => {
    if (typeof window === 'undefined') return false;
    return walletId === 'metamask' 
      ? !!(window as any).ethereum?.isMetaMask
      : !!(window as any).okxwallet;
  };

  // Get wallet provider
  const getProvider = (walletId: string) => {
    if (typeof window === 'undefined') return null;
    if (walletId === 'metamask') {
      const ethereum = (window as any).ethereum;
      return ethereum?.isMetaMask ? ethereum : 
        ethereum?.providers?.find((p: any) => p.isMetaMask) || null;
    }
    return (window as any).okxwallet || null;
  };

  // Main connection handler
  const connectWallet = async (walletId: string) => {
    setConnecting(walletId);
    setError(null);

    try {
      // 1. Check if wallet is installed
      if (!isWalletInstalled(walletId)) {
        throw new Error(`${walletOptions.find(w => w.id === walletId)?.name} not installed`);
      }

      const provider = getProvider(walletId);
      if (!provider) throw new Error('Wallet provider not found');

      // 2. Request accounts (this handles both new connections and existing ones)
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      if (!accounts?.length) throw new Error('No accounts found');

      // 3. Check/switch network
      const chainId = await provider.request({ method: 'eth_chainId' });
      
      if (chainId !== LOOP_NETWORK.chainId) {
        try {
          // Try to switch network
          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: LOOP_NETWORK.chainId }]
          });
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            // Network doesn't exist, add it
            await provider.request({
              method: 'wallet_addEthereumChain',
              params: [LOOP_NETWORK]
            });
          } else {
            throw switchError;
          }
        }
      }

      // 4. Success - save connection and notify parent
      const walletName = walletOptions.find(w => w.id === walletId)?.name || 'Unknown';
      const address = accounts[0];
      
      // Save to localStorage for persistence
      localStorage.setItem('reachswap_wallet_type', walletName);
      localStorage.setItem('reachswap_wallet_address', address);
      localStorage.setItem('reachswap_wallet_connected', 'true');
      
      onConnect(walletName, address);
      
    } catch (err: any) {
      console.error('Connection failed:', err);
      
      // Handle common errors
      if (err.code === 4001) {
        setError('Connection rejected by user');
      } else if (err.code === -32002) {
        setError('Connection request already pending. Check your wallet.');
      } else if (err.message?.includes('not installed')) {
        setError(err.message);
      } else {
        setError(err.message || 'Failed to connect wallet');
      }
    } finally {
      setConnecting(null);
    }
  };

  // Disconnect handler
  const handleDisconnect = () => {
    localStorage.removeItem('reachswap_wallet_type');
    localStorage.removeItem('reachswap_wallet_address');
    localStorage.removeItem('reachswap_wallet_connected');
    onDisconnect();
    onClose();
  };

  // Auto-restore connection on page load
  useEffect(() => {
    const restoreConnection = async () => {
      const savedWalletType = localStorage.getItem('reachswap_wallet_type');
      const savedAddress = localStorage.getItem('reachswap_wallet_address');
      const isConnectedFlag = localStorage.getItem('reachswap_wallet_connected');
      
      if (savedWalletType && savedAddress && isConnectedFlag && !isConnected) {
        // Find the wallet ID from the saved wallet type
        const walletId = walletOptions.find(w => w.name === savedWalletType)?.id;
        if (walletId && isWalletInstalled(walletId)) {
          const provider = getProvider(walletId);
          if (provider) {
            try {
              const accounts = await provider.request({ method: 'eth_accounts' });
              if (accounts && accounts.includes(savedAddress)) {
                onConnect(savedWalletType, savedAddress);
              }
            } catch (error) {
              // If restoration fails, clear saved data
              localStorage.removeItem('reachswap_wallet_type');
              localStorage.removeItem('reachswap_wallet_address');  
              localStorage.removeItem('reachswap_wallet_connected');
            }
          }
        }
      }
    };

    if (typeof window !== 'undefined') {
      restoreConnection();
    }
  }, [isConnected, onConnect]);

  // Listen for account/network changes
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        handleDisconnect();
      } else if (isConnected) {
        const newAddress = accounts[0];
        const walletType = localStorage.getItem('reachswap_wallet_type');
        if (walletType) {
          localStorage.setItem('reachswap_wallet_address', newAddress);
          onConnect(walletType, newAddress);
        }
      }
    };

    const handleChainChanged = (chainId: string) => {
      if (chainId !== LOOP_NETWORK.chainId && isConnected) {
        setError('Please switch to Loop Network');
      }
    };

    // Add listeners to both wallet providers
    const ethereum = (window as any).ethereum;
    const okxwallet = (window as any).okxwallet;

    if (ethereum) {
      ethereum.on('accountsChanged', handleAccountsChanged);
      ethereum.on('chainChanged', handleChainChanged);
    }
    if (okxwallet) {
      okxwallet.on('accountsChanged', handleAccountsChanged);
      okxwallet.on('chainChanged', handleChainChanged);
    }

    return () => {
      if (ethereum) {
        ethereum.removeListener('accountsChanged', handleAccountsChanged);
        ethereum.removeListener('chainChanged', handleChainChanged);
      }
      if (okxwallet) {
        okxwallet.removeListener('accountsChanged', handleAccountsChanged);
        okxwallet.removeListener('chainChanged', handleChainChanged);
      }
    };
  }, [isConnected, onConnect]);

  // Reset error when modal closes
  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setConnecting(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div 
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-r from-orange-500 to-blue-600 rounded-lg flex items-center justify-center">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
              {isConnected ? 'Wallet Connected' : 'Connect Wallet'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-6">
            {isConnected ? (
              /* Connected State */
              <div className="space-y-4">
                <div className="flex items-center space-x-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
                  <CheckCircle className="w-12 h-12 text-green-600 dark:text-green-400" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 dark:text-white">
                      {connectedWallet} Connected
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 truncate">
                      {walletAddress}
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4">
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
                    Network: LOOP Mainnet
                  </h4>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-sm text-green-600 dark:text-green-400">Connected</span>
                  </div>
                </div>

                <div className="flex space-x-3">
                  <button
                    onClick={() => window.open('https://explorer.mainnetloop.com', '_blank')}
                    className="flex-1 flex items-center justify-center space-x-2 py-3 px-4 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-gray-700 dark:text-gray-300 rounded-xl transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Explorer</span>
                  </button>
                  <button
                    onClick={handleDisconnect}
                    className="flex-1 py-3 px-4 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors"
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            ) : (
              /* Connection Options */
              <div className="space-y-4">
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Choose your wallet to connect to ReachSwap
                </p>

                {/* Error Display */}
                {error && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center space-x-3">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <span className="text-red-700 dark:text-red-400 text-sm">{error}</span>
                  </div>
                )}

                {/* Wallet Options */}
                <div className="space-y-3">
                  {walletOptions.map((wallet) => {
                    const isInstalled = isWalletInstalled(wallet.id);
                    const isConnecting = connecting === wallet.id;

                    return (
                      <button
                        key={wallet.id}
                        onClick={() => isInstalled 
                          ? connectWallet(wallet.id) 
                          : window.open(wallet.downloadUrl, '_blank')
                        }
                        disabled={connecting !== null}
                        className="w-full flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl transition-colors disabled:opacity-75"
                      >
                        <div className="flex items-center space-x-3">
                          <img 
                            src={wallet.icon} 
                            alt={wallet.name}
                            className="w-10 h-10 rounded-lg"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                          <div className="text-left">
                            <div className="font-semibold text-gray-900 dark:text-white">
                              {wallet.name}
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              {isInstalled ? wallet.description : 'Click to install'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          {isInstalled ? (
                            <>
                              <CheckCircle className="w-4 h-4 text-green-500" />
                              {isConnecting && <RefreshCw className="w-4 h-4 text-orange-500 animate-spin" />}
                            </>
                          ) : (
                            <ExternalLink className="w-4 h-4 text-gray-400" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Terms of Agreement Notice - Always visible at bottom */}
        {!isConnected && (
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 flex-shrink-0">
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center leading-relaxed">
              By connecting a wallet, you agree to ReachSwap's{' '}
              <button 
                onClick={() => window.open('#', '_blank')}
                className="text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 underline transition-colors"
              >
                Terms of Service
              </button>
              {' '}and{' '}
              <button 
                onClick={() => window.open('#', '_blank')}
                className="text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 underline transition-colors"
              >
                Privacy Policy
              </button>
              . Your wallet will be used to interact with smart contracts on the Loop Network.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default WalletModal;