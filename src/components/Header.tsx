import React from 'react';
import { Moon, Sun, Wallet } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

interface HeaderProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  isWalletConnected: boolean;
  onConnectWallet: () => void;
  connectedWallet?: string;
  walletAddress?: string;
}

const Header: React.FC<HeaderProps> = ({ 
  currentTab, 
  onTabChange, 
  isWalletConnected, 
  onConnectWallet,
  connectedWallet,
  walletAddress
}) => {
  const { isDark, toggleTheme } = useTheme();

  const tabs = [
    { id: 'swap', label: 'Swap' },
    { id: 'liquidity', label: 'Liquidity' },
    { id: 'portfolio', label: 'Portfolio' }
  ];

  return (
    <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50 backdrop-blur-sm bg-opacity-95 dark:bg-opacity-95">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center space-x-2 -ml-2">
            <div className="w-14 h-14 flex items-center justify-center">
              <img 
                src="/Logo12-13-removebg-preview.png" 
                alt="Reachswap Logo" 
                className="w-14 h-14 object-contain"
              />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">
                Reachswap
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">The Loop Network DEX</p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="hidden md:flex space-x-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                  currentTab === tab.id
                    ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center space-x-3">
            {/* Loop Network Indicator */}
            <div className={`flex items-center space-x-2 rounded-lg px-3 py-1.5 ${
              isWalletConnected 
                ? 'bg-green-100 dark:bg-green-900/30' 
                : 'bg-gray-100 dark:bg-gray-800'
            }`}>
              <div className={`w-2 h-2 rounded-full ${
                isWalletConnected 
                  ? 'bg-green-500 animate-pulse' 
                  : 'bg-gray-400'
              }`}></div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Loop
              </span>
            </div>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Wallet Connection */}
            <button
              onClick={onConnectWallet}
              className={`flex items-center space-x-1.5 px-2 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isWalletConnected
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
                  : 'bg-orange-500 hover:bg-orange-600 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
              }`}
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>
                {isWalletConnected ? walletAddress : 'Connect'}
              </span>
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="md:hidden pb-3">
          <nav className="flex space-x-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex-1 px-3 py-2 rounded-lg font-medium text-sm transition-all duration-200 ${
                  currentTab === tab.id
                    ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Header;