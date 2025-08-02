// ReachSwap DEX Contract Addresses and Configuration
export const REACHSWAP_CONTRACTS = {
  ROUTER: '0xdc1eB9E0a9E1c589D42a5B7A48aCF59aa5e589A3',
  FACTORY: '0xD5f79e2cfA1d7DEc6C231FC7447e432a4DAFA3Cc',
  PAIR_IMPL: '0x31F4F6982D77aAA6DD5baaf604a510c4cc0B5c2F',
  WLOOP: '0x3936D20a39eD4b0d44EaBfC91757B182f14A38d5',
};

// ReachSwap Router ABI - Complete implementation
export const REACHSWAP_ROUTER_ABI = [
  // Read functions
  'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)',
  'function getAmountsIn(uint amountOut, address[] calldata path) external view returns (uint[] memory amounts)',
  'function getAmountOut(uint amountIn, uint reserveIn, uint reserveOut) external pure returns (uint amountOut)',
  'function getAmountIn(uint amountOut, uint reserveIn, uint reserveOut) external pure returns (uint amountIn)',
  'function factory() external pure returns (address)',
  'function WETH() external pure returns (address)',
  'function quote(uint amountA, uint reserveA, uint reserveB) external pure returns (uint amountB)',
  
  // Swap functions
  'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function swapTokensForExactTokens(uint amountOut, uint amountInMax, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)',
  'function swapTokensForExactETH(uint amountOut, uint amountInMax, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function swapETHForExactTokens(uint amountOut, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)',
  
  // Fee-on-transfer supporting functions
  'function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external',
  'function swapExactETHForTokensSupportingFeeOnTransferTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable',
  'function swapExactTokensForETHSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external',
  
  // Liquidity functions
  'function addLiquidity(address tokenA, address tokenB, uint amountADesired, uint amountBDesired, uint amountAMin, uint amountBMin, address to, uint deadline) external returns (uint amountA, uint amountB, uint liquidity)',
  'function addLiquidityETH(address token, uint amountTokenDesired, uint amountTokenMin, uint amountETHMin, address to, uint deadline) external payable returns (uint amountToken, uint amountETH, uint liquidity)',
  'function removeLiquidity(address tokenA, address tokenB, uint liquidity, uint amountAMin, uint amountBMin, address to, uint deadline) external returns (uint amountA, uint amountB)',
  'function removeLiquidityETH(address token, uint liquidity, uint amountTokenMin, uint amountETHMin, address to, uint deadline) external returns (uint amountToken, uint amountETH)',
  'function removeLiquidityWithPermit(address tokenA, address tokenB, uint liquidity, uint amountAMin, uint amountBMin, address to, uint deadline, bool approveMax, uint8 v, bytes32 r, bytes32 s) external returns (uint amountA, uint amountB)',
  'function removeLiquidityETHWithPermit(address token, uint liquidity, uint amountTokenMin, uint amountETHMin, address to, uint deadline, bool approveMax, uint8 v, bytes32 r, bytes32 s) external returns (uint amountToken, uint amountETH)',
  'function removeLiquidityETHSupportingFeeOnTransferTokens(address token, uint liquidity, uint amountTokenMin, uint amountETHMin, address to, uint deadline) external returns (uint amountETH)',
  'function removeLiquidityETHWithPermitSupportingFeeOnTransferTokens(address token, uint liquidity, uint amountTokenMin, uint amountETHMin, address to, uint deadline, bool approveMax, uint8 v, bytes32 r, bytes32 s) external returns (uint amountETH)'
];

// ReachSwap Factory ABI
export const REACHSWAP_FACTORY_ABI = [
  'function getPair(address tokenA, address tokenB) external view returns (address pair)',
  'function allPairs(uint) external view returns (address pair)',
  'function allPairsLength() external view returns (uint)',
  'function createPair(address tokenA, address tokenB) external returns (address pair)',
  'function feeTo() external view returns (address)',
  'function feeToSetter() external view returns (address)',
  'function setFeeTo(address) external',
  'function setFeeToSetter(address) external',
  
  // Events
  'event PairCreated(address indexed token0, address indexed token1, address pair, uint)'
];

// ReachSwap Pair ABI for reserves and liquidity information
export const REACHSWAP_PAIR_ABI = [
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function totalSupply() external view returns (uint)',
  'function balanceOf(address owner) external view returns (uint)',
  'function allowance(address owner, address spender) external view returns (uint)',
  'function approve(address spender, uint value) external returns (bool)',
  'function transfer(address to, uint value) external returns (bool)',
  'function transferFrom(address from, address to, uint value) external returns (bool)',
  'function name() external pure returns (string memory)',
  'function symbol() external pure returns (string memory)',
  'function decimals() external pure returns (uint8)',
  'function price0CumulativeLast() external view returns (uint)',
  'function price1CumulativeLast() external view returns (uint)',
  'function kLast() external view returns (uint)',
  'function mint(address to) external returns (uint liquidity)',
  'function burn(address to) external returns (uint amount0, uint amount1)',
  'function swap(uint amount0Out, uint amount1Out, address to, bytes calldata data) external',
  'function skim(address to) external',
  'function sync() external',
  
  // Events
  'event Approval(address indexed owner, address indexed spender, uint value)',
  'event Transfer(address indexed from, address indexed to, uint value)',
  'event Mint(address indexed sender, uint amount0, uint amount1)',
  'event Burn(address indexed sender, uint amount0, uint amount1, address indexed to)',
  'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)',
  'event Sync(uint112 reserve0, uint112 reserve1)'
];

// ReachSwap specific fees and configuration
export const REACHSWAP_FEES = {
  SWAP_FEE: 30, // 0.3% (30/10000)
  PROTOCOL_FEE: 0, // No protocol fee initially
};

// Router priority configuration
export const ROUTER_PRIORITY = {
  REACHSWAP: 1, // Highest priority - use ReachSwap first
  SPHYNX: 2,    // Fallback to Sphynx if ReachSwap doesn't have liquidity
};

// Function signatures for ReachSwap router
export const REACHSWAP_FUNCTION_SIGNATURES = {
  // Swap functions
  swapExactTokensForTokens: '0x38ed1739',
  swapTokensForExactTokens: '0x8803dbee',
  swapExactETHForTokens: '0x7ff36ab5',
  swapTokensForExactETH: '0x4a25d94a',
  swapExactTokensForETH: '0x18cbafe5',
  swapETHForExactTokens: '0xfb3bdb41',
  
  // Fee-supporting functions
  swapExactTokensForTokensSupportingFeeOnTransferTokens: '0x5c11d795',
  swapExactETHForTokensSupportingFeeOnTransferTokens: '0xb6f9de95',
  swapExactTokensForETHSupportingFeeOnTransferTokens: '0x791ac947',
  
  // Liquidity functions
  addLiquidity: '0xe8e33700',
  addLiquidityETH: '0xf305d719',
  removeLiquidity: '0xbaa2abde',
  removeLiquidityETH: '0x02751cec',
  
  // Read functions
  getAmountsOut: '0xd06ca61f',
  getAmountsIn: '0x1f00ca74',
  getAmountOut: '0x054d50d4',
  getAmountIn: '0x85f8c259'
};