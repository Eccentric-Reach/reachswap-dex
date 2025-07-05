// Sphynx DEX Contract Addresses and Configuration
export const SPHYNX_CONTRACTS = {
  ROUTER: '0x021745980c4b9c2F60262a0B140B1640471fb5E7',
  FACTORY: '0xc0246B4f24475A11EE4383D29575394dc237Fc36',
  WLOOP: '0x3936D20a39eD4b0d44EaBfC91757B182f14A38d5', // Wrapped LOOP
};

// Enhanced Sphynx Router ABI with all fee-supporting functions
export const SPHYNX_ROUTER_ABI = [
  // Read functions
  'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)',
  'function getAmountOut(uint amountIn, uint reserveIn, uint reserveOut, uint swapFee, uint serviceFee) external pure returns (uint amountOut)',
  'function factory() external pure returns (address)',
  'function WETH() external pure returns (address)',
  
  // Standard swap functions
  'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)',
  'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  
  // Exact output functions (for avoiding K errors)
  'function swapTokensForExactTokens(uint amountOut, uint amountInMax, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function swapETHForExactTokens(uint amountOut, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)',
  'function swapTokensForExactETH(uint amountOut, uint amountInMax, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  
  // Fee-on-transfer supporting functions (CRITICAL for fee tokens)
  'function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external',
  'function swapExactETHForTokensSupportingFeeOnTransferTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable',
  'function swapExactTokensForETHSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external',
];

// Sphynx Factory ABI
export const SPHYNX_FACTORY_ABI = [
  'function getPair(address tokenA, address tokenB) external view returns (address pair)',
  'function allPairs(uint) external view returns (address pair)',
  'function allPairsLength() external view returns (uint)',
  'function createPair(address tokenA, address tokenB) external returns (address pair)',
];

// Pair ABI for reserves and fee information
export const SPHYNX_PAIR_ABI = [
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function totalSupply() external view returns (uint)',
  'function balanceOf(address owner) external view returns (uint)',
];

// Enhanced ERC20 ABI with fee detection functions
export const ERC20_ABI = [
  'function name() external view returns (string)',
  'function symbol() external view returns (string)',
  'function decimals() external view returns (uint8)',
  'function totalSupply() external view returns (uint256)',
  'function balanceOf(address owner) external view returns (uint256)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function approve(address spender, uint256 value) external returns (bool)',
  'function transfer(address to, uint256 value) external returns (bool)',
  'function transferFrom(address from, address to, uint256 value) external returns (bool)',
  
  // Fee-related functions for detection (common on LOOP network)
  'function _taxFee() external view returns (uint256)',
  'function _liquidityFee() external view returns (uint256)',
  'function _burnFee() external view returns (uint256)',
  'function _marketingFee() external view returns (uint256)',
  'function _devFee() external view returns (uint256)',
  'function sellTaxFee() external view returns (uint256)',
  'function buyTaxFee() external view returns (uint256)',
  'function isExcludedFromFee(address account) external view returns (bool)',
  'function isFeeExempt(address account) external view returns (bool)',
  'function _isExcluded(address account) external view returns (bool)',
  'function _rOwned(address account) external view returns (uint256)', // Reflection tokens
  'function _tOwned(address account) external view returns (uint256)', // Reflection tokens
];

// Known fee-on-transfer tokens on Loop Network (dynamically updated)
export const KNOWN_FEE_TOKENS: { [address: string]: { buyFee: number; sellFee: number; isReflection: boolean } } = {
  '0x44b9e1C3431E777B446B3ac4A0ec5375a4D26E66': { // KYC token
    buyFee: 0.05, // 5% buy fee
    sellFee: 0.05, // 5% sell fee
    isReflection: false
  },
  '0x0C6E54f51be9A01C10d0c233806B44b0c5EE5bD3': { // GIKO token
    buyFee: 0.03, // 3% buy fee
    sellFee: 0.03, // 3% sell fee
    isReflection: false
  },
  // Note: This list is intentionally small - most detection should be dynamic
};

// Default swap and service fees for Sphynx
export const SPHYNX_FEES = {
  SWAP_FEE: 25, // 0.25% (25/10000)
  SERVICE_FEE: 0, // No service fee currently
};

// Function signature mappings for dynamic detection
export const FEE_FUNCTION_SIGNATURES = {
  '_taxFee': '0x83e3bdb4',
  '_liquidityFee': '0x28c61f41',
  '_burnFee': '0x4549b039',
  'isExcludedFromFee': '0x5342acb4',
  '_isExcluded': '0x437823ec',
  '_rOwned': '0x88f82020',
  'sellTaxFee': '0x8da5cb5b', // Example - actual signature may vary
  'buyTaxFee': '0x70a08231', // Example - actual signature may vary
};