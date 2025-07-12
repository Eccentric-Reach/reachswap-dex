// ReachSwap DEX Contract Addresses and Configuration
export const REACHSWAP_CONTRACTS = {
  ROUTER: '0x0000000000000000000000000000000000000000', // Placeholder - ReachSwap router not deployed yet
  FACTORY: '0x0000000000000000000000000000000000000000', // Placeholder - ReachSwap factory not deployed yet
  WLOOP: '0x3936D20a39eD4b0d44EaBfC91757B182f14A38d5', // Wrapped LOOP
};

// ReachSwap Router ABI (when deployed)
export const REACHSWAP_ROUTER_ABI = [
  // Read functions
  'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)',
  'function getAmountOut(uint amountIn, uint reserveIn, uint reserveOut) external pure returns (uint amountOut)',
  'function factory() external pure returns (address)',
  'function WETH() external pure returns (address)',
  
  // Swap functions
  'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)',
  'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
];

// ReachSwap Factory ABI (when deployed)
export const REACHSWAP_FACTORY_ABI = [
  'function getPair(address tokenA, address tokenB) external view returns (address pair)',
  'function allPairs(uint) external view returns (address pair)',
  'function allPairsLength() external view returns (uint)',
  'function createPair(address tokenA, address tokenB) external returns (address pair)',
];