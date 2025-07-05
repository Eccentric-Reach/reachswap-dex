import React, { useState, useEffect } from 'react';
import { ThemeProvider } from './contexts/ThemeContext';
import Header from './components/Header';
import Footer from './components/Footer';
import SwapInterface from './components/SwapInterface';
import LiquidityInterface from './components/LiquidityInterface';
import PortfolioInterface from './components/PortfolioInterface';
import WalletModal from './components/WalletModal';

function App() {
  const [currentTab, setCurrentTab] = useState('swap');
  const [isWalletConnected, setIsWalletConnected] = useState(false);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [connectedWallet, setConnectedWallet] = useState<string>('');
  const [walletAddress, setWalletAddress] = useState<string>('');

  // Check for existing wallet connection on app load
  useEffect(() => {
    const checkExistingConnection = async () => {
      const savedWalletType = localStorage.getItem('reachswap_wallet_type');
      const savedAddress = localStorage.getItem('reachswap_wallet_address');
      const isConnected = localStorage.getItem('reachswap_wallet_connected') === 'true';
      
      if (isConnected && savedWalletType && savedAddress) {
        // Verify the connection is still valid
        try {
          let provider = null;
          
          // Get the appropriate provider
          if (savedWalletType === 'MetaMask' && (window as any).ethereum?.isMetaMask) {
            provider = (window as any).ethereum;
          } else if (savedWalletType === 'OKX Wallet' && (window as any).okxwallet) {
            provider = (window as any).okxwallet;
          }
          
          if (provider) {
            // Check if accounts are still available
            const accounts = await provider.request({ method: 'eth_accounts' });
            const chainId = await provider.request({ method: 'eth_chainId' });
            
            if (accounts && accounts.length > 0 && chainId === '0x3CBF') {
              // Connection is still valid
              setIsWalletConnected(true);
              setConnectedWallet(savedWalletType);
              setWalletAddress(`${savedAddress.slice(0, 6)}...${savedAddress.slice(-4)}`);
              console.log('✅ Restored wallet connection:', savedWalletType, savedAddress);
            } else {
              // Connection is no longer valid, clear storage
              localStorage.removeItem('reachswap_wallet_type');
              localStorage.removeItem('reachswap_wallet_address');
              localStorage.removeItem('reachswap_wallet_connected');
              console.log('❌ Wallet connection no longer valid, cleared storage');
            }
          } else {
            // Wallet is no longer available, clear storage
            localStorage.removeItem('reachswap_wallet_type');
            localStorage.removeItem('reachswap_wallet_address');
            localStorage.removeItem('reachswap_wallet_connected');
            console.log('❌ Wallet no longer available, cleared storage');
          }
        } catch (error) {
          console.error('Error checking existing connection:', error);
          // Clear storage on error
          localStorage.removeItem('reachswap_wallet_type');
          localStorage.removeItem('reachswap_wallet_address');
          localStorage.removeItem('reachswap_wallet_connected');
        }
      }
    };

    // Add a small delay to ensure providers are loaded
    const timer = setTimeout(checkExistingConnection, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleConnectWallet = () => {
    setIsWalletModalOpen(true);
  };

  const handleWalletConnect = (walletType: string, address: string) => {
    console.log('🎉 Wallet connected in App:', walletType, address);
    setIsWalletConnected(true);
    setConnectedWallet(walletType);
    // Format address for display (first 6 + last 4 characters)
    setWalletAddress(`${address.slice(0, 6)}...${address.slice(-4)}`);
    setIsWalletModalOpen(false);
  };

  const handleWalletDisconnect = () => {
    console.log('👋 Wallet disconnected in App');
    setIsWalletConnected(false);
    setConnectedWallet('');
    setWalletAddress('');
    // Clear localStorage is handled in the modal
  };

  const renderCurrentTab = () => {
    switch (currentTab) {
      case 'swap':
        return <SwapInterface isWalletConnected={isWalletConnected} onConnectWallet={handleConnectWallet} />;
      case 'liquidity':
        return <LiquidityInterface isWalletConnected={isWalletConnected} onConnectWallet={handleConnectWallet} />;
      case 'portfolio':
        return (
          <PortfolioInterface
            isWalletConnected={isWalletConnected}
            walletAddress={walletAddress}
            onConnectWallet={handleConnectWallet}
          />
        );
      default:
        return <SwapInterface isWalletConnected={isWalletConnected} onConnectWallet={handleConnectWallet} />;
    }
  };

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors flex flex-col">
        <Header
          currentTab={currentTab}
          onTabChange={setCurrentTab}
          isWalletConnected={isWalletConnected}
          onConnectWallet={handleConnectWallet}
          connectedWallet={connectedWallet}
          walletAddress={walletAddress}
        />
        
        <main className="flex-1 pt-8 pb-12 px-4 sm:px-6 lg:px-8">
          {renderCurrentTab()}
        </main>

        <Footer />

        {/* Wallet Modal */}
        <WalletModal
          isOpen={isWalletModalOpen}
          onClose={() => setIsWalletModalOpen(false)}
          onConnect={handleWalletConnect}
          onDisconnect={handleWalletDisconnect}
          isConnected={isWalletConnected}
          connectedWallet={connectedWallet}
          walletAddress={walletAddress}
        />
      </div>
    </ThemeProvider>
  );
}

export default App;