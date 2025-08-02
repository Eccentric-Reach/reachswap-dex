import React from 'react';

const Footer: React.FC = () => {
  const handleTelegramClick = () => {
    window.open('https://t.me/reachswap', '_blank', 'noopener,noreferrer');
  };

  return (
    <footer className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-between">
          {/* Left side - Logo and description */}
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 flex items-center justify-center">
              <img 
                src="/Logo12-13-removebg-preview.png" 
                alt="Reachswap Logo" 
                className="w-8 h-8 object-contain"
              />
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900 dark:text-white">
                Reachswap
              </div>
              <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                Native DEX on Loop Network
              </div>
            </div>
          </div>

          {/* Right side - Telegram icon */}
          <div className="flex items-center space-x-4">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Join our community
            </div>
            <button
              onClick={handleTelegramClick}
              className="flex items-center justify-center w-10 h-10 bg-blue-500 hover:bg-blue-600 text-white rounded-full transition-all duration-300 transform hover:scale-110 shadow-lg hover:shadow-xl"
              title="Join our Telegram group"
              aria-label="Join Reachswap Telegram group"
            >
              {/* Telegram SVG Icon */}
              <svg 
                className="w-5 h-5" 
                viewBox="0 0 24 24" 
                fill="currentColor"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Bottom section - Copyright and links */}
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex flex-col sm:flex-row items-center justify-between space-y-2 sm:space-y-0">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              © 2025 Reachswap. Native DEX built on Loop Network with enhanced routing.
            </div>
            
            <div className="flex items-center space-x-4 text-xs">
              <button
                onClick={() => window.open('https://explorer.mainnetloop.com', '_blank', 'noopener,noreferrer')}
                className="text-gray-500 dark:text-gray-400 hover:text-orange-600 dark:hover:text-orange-400 transition-colors duration-300"
              >
                Explorer
              </button>
              <button
                onClick={handleTelegramClick}
                className="text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors duration-300"
              >
                Telegram
              </button>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;