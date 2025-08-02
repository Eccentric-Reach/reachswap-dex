import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Plus, Settings, RefreshCcw, AlertCircle, Minus, Info } from 'lucide-react';
import { ethers } from 'ethers';
import { Token } from '../types';
import { TOKENS } from '../constants/tokens';
import { REACHSWAP_CONTRACTS } from '../constants/reachswap';
import { useVisibleTokenBalances } from '../hooks/useVisibleTokenBalances';
import { useLiquidityManagement } from '../hooks/useLiquidityManagement';
import { useDynamicTokenDecimals } from '../hooks/useDynamicTokenDecimals';
import { useDebounce } from '../hooks/useDebounce';
import { normalizeToken, getTokenDisplayName, getTokenLogoUrl } from '../utils/tokenUtils';
import { 
  waitForTransaction, 
  getProviderAndSigner, 
  estimateGasWithBuffer,
  checkAllowance,
  approveToken,
  waitForAllowanceUpdate,
  sendTransaction,
  formatUserError,
  retryTransaction
} from '../utils/web3Utils';
import TokenModal from './TokenModal';
import LiquidityConfirmModal from './LiquidityConfirmModal';
import RemoveLiquidityModal from './RemoveLiquidityModal';
import SwapSettingsModal from './SwapSettingsModal';
import SelectPoolModal from './SelectPoolModal';
import { LiquidityPosition } from '../hooks/usePortfolioData';

interface LiquidityInterfaceProps {
  isWalletConnected: boolean;
  onConnectWallet: () => void;
}

interface PoolStatus {
  pairExists: boolean;
  hasLiquidity: boolean;
  reserves?: { reserve0: string; reserve1: string };
  totalSupply?: string;
  pairAddress?: string;
}

interface LiquidityState {
  step: 'input' | 'approving' | 'approved' | 'creating' | 'adding' | 'success' | 'error';
  approvalTxHash?: string;
  liquidityTxHash?: string;
  error?: string;
  needsApproval?: boolean;
}

const NATIVE_LOOP = '0x0000000000000000000000000000000000000000';

const LiquidityInterface: React.FC<LiquidityInterfaceProps> = ({
  isWalletConnected,
  onConnectWallet
}) => {
  // State management
  const [mode, setMode] = useState<'add' | 'remove'>('add');
  const [token0, setToken0] = useState<Token | null>(TOKENS.LOOP);
  const [token1, setToken1] = useState<Token | null>(null);
  const [amount0, setAmount0] = useState('');
  const [amount1, setAmount1] = useState('');
  const [isToken0Input, setIsToken0Input] = useState(true);
  const [slippage, setSlippage] = useState('0.5');
  const [gasPrice, setGasPrice] = useState('10');
  const [deadline] = useState('20');
  
  // Modal states
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [tokenModalType, setTokenModalType] = useState<'token0' | 'token1'>('token0');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showSelectPoolModal, setShowSelectPoolModal] = useState(false);
  const [selectedLiquidityPosition, setSelectedLiquidityPosition] = useState<LiquidityPosition | null>(null);
  
  // Pool status tracking with comprehensive data
  const [poolStatus, setPoolStatus] = useState<PoolStatus>({
    pairExists: false,
    hasLiquidity: false
  });
  const [isLoadingPool, setIsLoadingPool] = useState(false);
  
  // Liquidity transaction state management
  const [liquidityState, setLiquidityState] = useState<LiquidityState>({ step: 'input' });
  
  // Pool data
  const [poolShare, setPoolShare] = useState(0);
  const [estimatedLPTokens, setEstimatedLPTokens] = useState('0');
  
  // Custom token support
  const [customTokenError] = useState<string | null>(null);

  // Get wallet address for balance fetching
  const walletAddress = localStorage.getItem('reachswap_wallet_address');
  
  // Hooks
  const { 
    getTokenBalance: getVisibleTokenBalance, 
    fetchBalanceForToken
  } = useVisibleTokenBalances(isWalletConnected, walletAddress || undefined);
  
  const {
    checkPairExists,
    getPool,
    createPool,
    error: liquidityError
  } = useLiquidityManagement();
  
  // Use dynamic token decimals hook (for future use)
  useDynamicTokenDecimals();

  // Debounced amounts for calculations
  const debouncedAmount0 = useDebounce(amount0, 500);
  const debouncedAmount1 = useDebounce(amount1, 500);

  // Get provider for transactions
  const getProvider = useCallback(async () => {
    try {
      const { provider } = await getProviderAndSigner();
      return provider;
    } catch (error) {
      console.error('Error getting provider:', error);
      return null;
    }
  }, []);

  // Enhanced pool status checking with liquidity detection
  const checkPoolAndLiquidityStatus = useCallback(async (
    tokenA: Token, 
    tokenB: Token
  ): Promise<PoolStatus> => {
    console.log('🔍 Checking comprehensive pool status...');
    console.log(`Token A: ${tokenA.symbol} (${tokenA.address})`);
    console.log(`Token B: ${tokenB.symbol} (${tokenB.address})`);
    
    try {
      // Step 1: Check if pair contract exists
      const pairExists = await checkPairExists(tokenA, tokenB);
      console.log(`📋 Pair exists: ${pairExists}`);
      
      if (!pairExists) {
        return { pairExists: false, hasLiquidity: false };
      }
      
      // Step 2: Get pool reserves and total supply to determine liquidity status
      const pool = await getPool(tokenA, tokenB);
      if (!pool) {
        console.log('📋 Pool contract exists but no reserves found');
        return { pairExists: true, hasLiquidity: false };
      }
      
      // Step 3: Check if reserves indicate actual liquidity
      const reserve0 = BigInt(pool.reserve0 || '0');
      const reserve1 = BigInt(pool.reserve1 || '0');
      const hasLiquidity = reserve0 > 0n && reserve1 > 0n;
      
      console.log(`💰 Pool Analysis:`);
      console.log(`   Reserve0: ${reserve0.toString()} wei`);
      console.log(`   Reserve1: ${reserve1.toString()} wei`);
      console.log(`   Has Liquidity: ${hasLiquidity}`);
      console.log(`   Pair Address: ${pool.pairAddress}`);
      
      return {
        pairExists: true,
        hasLiquidity,
        reserves: {
          reserve0: pool.reserve0,
          reserve1: pool.reserve1
        },
        totalSupply: pool.totalSupply,
        pairAddress: pool.pairAddress
      };
    } catch (error) {
      console.error('Error checking pool status:', error);
      return { pairExists: false, hasLiquidity: false };
    }
  }, [checkPairExists, getPool]);

  // Update pool data when tokens change
  const updatePoolData = useCallback(async () => {
    if (!token0 || !token1) {
      setPoolStatus({ pairExists: false, hasLiquidity: false });
      setLiquidityState({ step: 'input' });
      return;
    }

    setIsLoadingPool(true);
    try {
      const status = await checkPoolAndLiquidityStatus(token0, token1);
      setPoolStatus(status);
      
      // Reset liquidity state when pool status changes
      setLiquidityState({ step: 'input' });
    } catch (error) {
      console.error('Error updating pool data:', error);
      setPoolStatus({ pairExists: false, hasLiquidity: false });
    } finally {
      setIsLoadingPool(false);
    }
  }, [token0, token1, checkPoolAndLiquidityStatus]);

  useEffect(() => {
    updatePoolData();
  }, [updatePoolData]);

  // Calculate quote when amounts change (only if pool has liquidity)
  const calculateQuote = useCallback(async () => {
    if (!token0 || !token1 || !poolStatus.hasLiquidity || !poolStatus.reserves) return;

    const inputAmount = isToken0Input ? debouncedAmount0 : debouncedAmount1;
    if (!inputAmount || parseFloat(inputAmount) <= 0) return;

    try {
      const reserve0 = poolStatus.reserves.reserve0;
      const reserve1 = poolStatus.reserves.reserve1;

      if (isToken0Input && debouncedAmount0) {
        // Calculate amount1 based on amount0
        const amountInWei = (parseFloat(debouncedAmount0) * Math.pow(10, token0.decimals)).toString();
        const quote = (BigInt(amountInWei) * BigInt(reserve1)) / BigInt(reserve0);
        const quotedAmount = (Number(quote) / Math.pow(10, token1.decimals)).toFixed(8);
        setAmount1(quotedAmount);
      } else if (!isToken0Input && debouncedAmount1) {
        // Calculate amount0 based on amount1
        const amountInWei = (parseFloat(debouncedAmount1) * Math.pow(10, token1.decimals)).toString();
        const quote = (BigInt(amountInWei) * BigInt(reserve0)) / BigInt(reserve1);
        const quotedAmount = (Number(quote) / Math.pow(10, token0.decimals)).toFixed(8);
        setAmount0(quotedAmount);
      }
    } catch (error) {
      console.error('Error calculating quote:', error);
    }
  }, [token0, token1, poolStatus.hasLiquidity, poolStatus.reserves, debouncedAmount0, debouncedAmount1, isToken0Input]);

  // Run quote calculation when debounced amounts change
  useEffect(() => {
    if (poolStatus.hasLiquidity) {
      calculateQuote();
    }
  }, [calculateQuote]);

  // Calculate pool share and LP tokens
  useEffect(() => {
    if (!token0 || !token1 || !amount0 || !amount1) {
      setPoolShare(0);
      setEstimatedLPTokens('0');
      return;
    }

    const amt0 = parseFloat(amount0);
    const amt1 = parseFloat(amount1);

    if (amt0 <= 0 || amt1 <= 0) {
      setPoolShare(0);
      setEstimatedLPTokens('0');
      return;
    }

    if (!poolStatus.pairExists || !poolStatus.hasLiquidity) {
      // New pool or empty pool - user owns 100%
      setPoolShare(100);
      const lpTokens = Math.sqrt(amt0 * amt1);
      setEstimatedLPTokens(lpTokens.toFixed(6));
    } else if (poolStatus.reserves) {
      // Existing pool - calculate share
      const reserve0 = Number(poolStatus.reserves.reserve0) / Math.pow(10, token0.decimals);
      const reserve1 = Number(poolStatus.reserves.reserve1) / Math.pow(10, token1.decimals);
      
      const newReserve0 = reserve0 + amt0;
      const newReserve1 = reserve1 + amt1;
      
      const share = ((amt0 + amt1) / (newReserve0 + newReserve1)) * 100;
      setPoolShare(Math.min(share, 100));
      
      // Calculate LP tokens based on existing supply
      if (poolStatus.totalSupply) {
        const totalSupply = Number(poolStatus.totalSupply) / Math.pow(10, 18);
        const lpTokens = Math.min(
          (amt0 / reserve0) * totalSupply,
          (amt1 / reserve1) * totalSupply
        );
        setEstimatedLPTokens(lpTokens.toFixed(6));
      } else {
        // Fallback calculation
        const lpTokens = Math.min(
          (amt0 / reserve0) * 1000,
          (amt1 / reserve1) * 1000
        );
        setEstimatedLPTokens(lpTokens.toFixed(6));
      }
    }
  }, [token0, token1, amount0, amount1, poolStatus]);

  // Handle token selection with balance fetching
  const handleTokenSelect = useCallback(async (token: Token) => {
    const normalizedToken = normalizeToken(token);
    
    if (tokenModalType === 'token0') {
      setToken0(normalizedToken);
    } else {
      setToken1(normalizedToken);
    }
    
    // Immediately fetch balance for selected token
    if (isWalletConnected && walletAddress) {
      await fetchBalanceForToken(normalizedToken);
    }
    
    setShowTokenModal(false);
  }, [tokenModalType, isWalletConnected, walletAddress, fetchBalanceForToken]);

  // Handle amount input
  const handleAmountChange = useCallback((value: string, isToken0: boolean) => {
    // Only allow valid number input
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      if (isToken0) {
        setAmount0(value);
        setIsToken0Input(true);
        // Clear amount1 if pool has liquidity (will be auto-calculated)
        if (poolStatus.hasLiquidity && value) {
          setAmount1('');
        }
      } else {
        setAmount1(value);
        setIsToken0Input(false);
        // Clear amount0 if pool has liquidity (will be auto-calculated)
        if (poolStatus.hasLiquidity && value) {
          setAmount0('');
        }
      }
    }
  }, [poolStatus.hasLiquidity]);

  // Handle max button with actual balances
  const handleMaxAmount = useCallback((isToken0: boolean) => {
    const token = isToken0 ? token0 : token1;
    if (!token) return;

    const balance = getVisibleTokenBalance(token);
    const balanceNum = parseFloat(balance);
    
    if (balanceNum > 0) {
      // Leave a small amount for gas if it's native LOOP
      const maxAmount = token.address === NATIVE_LOOP 
        ? Math.max(0, balanceNum - 0.001).toFixed(8)
        : balanceNum.toFixed(8);
      
      handleAmountChange(maxAmount, isToken0);
    }
  }, [token0, token1, getVisibleTokenBalance, handleAmountChange]);

  // Safe amount conversion to avoid scientific notation
  const convertToWei = useCallback((amount: string, decimals: number): string => {
    try {
      if (!amount || amount === '' || parseFloat(amount) === 0) {
        return '0';
      }

      // Handle the conversion carefully to avoid scientific notation
      const cleanAmount = parseFloat(amount).toFixed(decimals);
      const parts = cleanAmount.split('.');
      
      if (parts.length === 1) {
        // No decimal part
        return (BigInt(parts[0]) * BigInt(10 ** decimals)).toString();
      } else {
        // Has decimal part
        const integerPart = parts[0];
        const decimalPart = parts[1].padEnd(decimals, '0').slice(0, decimals);
        
        const integerWei = BigInt(integerPart) * BigInt(10 ** decimals);
        const decimalWei = BigInt(decimalPart);
        
        return (integerWei + decimalWei).toString();
      }
    } catch (error) {
      console.error('Error converting amount to wei:', error);
      throw new Error(`Invalid amount: ${amount}`);
    }
  }, []);

  // Enhanced approval checking with safe conversion
  const checkTokenApproval = useCallback(async (token: Token, amount: string): Promise<boolean> => {
    if (!walletAddress || token.address === NATIVE_LOOP) return true;

    try {
      const currentAllowance = await checkAllowance(
        token.address,
        walletAddress,
        REACHSWAP_CONTRACTS.ROUTER
      );

      const currentAllowanceBig = BigInt(currentAllowance);
      const requiredAmount = convertToWei(amount, token.decimals);
      const requiredAmountBig = BigInt(requiredAmount);

      console.log(`🔍 Approval check for ${token.symbol}:`);
      console.log(`   Current allowance: ${currentAllowanceBig.toString()}`);
      console.log(`   Required amount: ${requiredAmountBig.toString()}`);
      console.log(`   Needs approval: ${currentAllowanceBig < requiredAmountBig}`);

      return currentAllowanceBig >= requiredAmountBig;
    } catch (error) {
      console.error('Error checking token approval:', error);
      return false;
    }
  }, [walletAddress, convertToWei]);

  // Enhanced token approval with safe conversion
  const handleTokenApproval = useCallback(async (token: Token, amount: string): Promise<string> => {
    if (!walletAddress || token.address === NATIVE_LOOP) {
      throw new Error('No approval needed for native token');
    }

    try {
      console.log(`🔐 Approving ${token.symbol} for ReachSwap router: ${amount}`);
      
      // ✅ CRITICAL FIX: Approve a higher amount to account for optimal calculation changes
      const amountWei = convertToWei(amount, token.decimals);
      
      // Add 10% buffer to handle optimal amount calculations
      const bufferedAmount = (BigInt(amountWei) * BigInt(110) / BigInt(100)).toString();
      
      console.log(`💰 Original amount in wei: ${amountWei}`);
      console.log(`💰 Buffered amount in wei: ${bufferedAmount}`);

      const approvalTxHash = await retryTransaction(
        () => approveToken(
          token.address,
          REACHSWAP_CONTRACTS.ROUTER,
          bufferedAmount, // ← Use buffered amount
          walletAddress
        ),
        3
      );

      console.log(`✅ ReachSwap approval transaction sent: ${approvalTxHash}`);
      
      // Wait for approval to be mined
      const approvalSuccess = await waitForTransaction(approvalTxHash);
      if (!approvalSuccess) {
        throw new Error('Approval transaction failed');
      }

      // Wait for allowance to be updated
      const allowanceUpdated = await waitForAllowanceUpdate(
        token.address,
        walletAddress,
        REACHSWAP_CONTRACTS.ROUTER,
        bufferedAmount // ← Check buffered amount
      );

      if (!allowanceUpdated) {
        throw new Error('Allowance was not updated properly. Please try again.');
      }

      return approvalTxHash;
    } catch (error) {
      console.error(`Error approving ${token.symbol} for ReachSwap:`, error);
      throw error;
    }
  }, [walletAddress, convertToWei]);

  // Enhanced add liquidity with comprehensive state management
  const handleAddLiquidity = useCallback(async () => {
    if (!token0 || !token1 || !amount0 || !amount1 || !isWalletConnected || !walletAddress) return;

    try {
      console.log('🚀 Starting enhanced liquidity addition process...');
      console.log(`📊 Token A: ${token0.symbol} (${token0.address}) - Amount: ${amount0}`);
      console.log(`📊 Token B: ${token1.symbol} (${token1.address}) - Amount: ${amount1}`);
      console.log(`📊 Pool Status:`, poolStatus);

      // Step 1: Check approvals needed
      const token0NeedsApproval = !(await checkTokenApproval(token0, amount0));
      const token1NeedsApproval = !(await checkTokenApproval(token1, amount1));
      
      console.log(`🔍 Approval status: token0=${!token0NeedsApproval}, token1=${!token1NeedsApproval}`);

      if (token0NeedsApproval || token1NeedsApproval) {
        setLiquidityState({ 
          step: 'approving', 
          needsApproval: true 
        });

        // Handle token0 approval
        if (token0NeedsApproval) {
          console.log(`🔐 Approving ${token0.symbol}...`);
          const approval0TxHash = await handleTokenApproval(token0, amount0);
          setLiquidityState(prev => ({ 
            ...prev, 
            approvalTxHash: approval0TxHash 
          }));
        }

        // Handle token1 approval
        if (token1NeedsApproval) {
          console.log(`🔐 Approving ${token1.symbol}...`);
          const approval1TxHash = await handleTokenApproval(token1, amount1);
          setLiquidityState(prev => ({ 
            ...prev,
            approvalTxHash: prev.approvalTxHash ? `${prev.approvalTxHash}, ${approval1TxHash}` : approval1TxHash
          }));
        }

        console.log('✅ All token approvals completed');
      }

      setLiquidityState(prev => ({ 
        ...prev, 
        step: 'approved' 
      }));

      // Step 2: Execute liquidity addition based on pool status
      let liquidityTxHash: string;

      if (!poolStatus.pairExists) {
        // Create new pool
        console.log('🏗️ Creating new pool...');
        setLiquidityState(prev => ({ ...prev, step: 'creating' }));
        liquidityTxHash = await executeCreatePool(token0, token1, amount0, amount1);
      } else if (!poolStatus.hasLiquidity) {
        // Add initial liquidity to empty pool
        console.log('💰 Adding initial liquidity to empty pool...');
        setLiquidityState(prev => ({ ...prev, step: 'adding' }));
        liquidityTxHash = await executeAddInitialLiquidity(token0, token1, amount0, amount1);
      } else {
        // Add to existing pool with liquidity
        console.log('➕ Adding liquidity to existing pool...');
        setLiquidityState(prev => ({ ...prev, step: 'adding' }));
        liquidityTxHash = await executeAddToExistingPool(token0, token1, amount0, amount1);
      }

      setLiquidityState(prev => ({ 
        ...prev, 
        liquidityTxHash 
      }));

      // Wait for liquidity transaction
      console.log('⏳ Waiting for liquidity transaction to be mined...');
      const liquiditySuccess = await waitForTransaction(liquidityTxHash);

      if (!liquiditySuccess) {
        throw new Error('Liquidity transaction failed');
      }

      setLiquidityState(prev => ({ 
        ...prev, 
        step: 'success' 
      }));

      console.log('🎉 Liquidity addition completed successfully!');
      
      // Success cleanup after delay
      setTimeout(() => {
        setAmount0('');
        setAmount1('');
        setLiquidityState({ step: 'input' });
        updatePoolData();
        if (token0) fetchBalanceForToken(token0);
        if (token1) fetchBalanceForToken(token1);
      }, 3000);
      
    } catch (error) {
      console.error('Error adding liquidity:', error);
      const userError = formatUserError(error);
      setLiquidityState({ 
        step: 'error', 
        error: `Liquidity addition failed: ${userError}` 
      });
    }
  }, [
    token0, token1, amount0, amount1, isWalletConnected, walletAddress, 
    poolStatus, checkTokenApproval, handleTokenApproval, updatePoolData, fetchBalanceForToken
  ]);

  // Enhanced liquidity execution methods
  const executeCreatePool = useCallback(async (
    tokenA: Token,
    tokenB: Token,
    amountA: string,
    amountB: string
  ): Promise<string> => {
    console.log('🏗️ Executing pool creation...');
    
    try {
      // Use existing createPool method from useLiquidityManagement
      const result = await createPool(tokenA, tokenB, amountA, amountB);
      return result;
    } catch (error) {
      console.error('Error creating pool:', error);
      throw error;
    }
  }, [createPool]);

  const executeAddInitialLiquidity = useCallback(async (
    tokenA: Token,
    tokenB: Token,
    amountA: string,
    amountB: string
  ): Promise<string> => {
    console.log('💰 Executing initial liquidity addition...');
    
    try {
      const provider = await getProvider();
      if (!provider) throw new Error('No provider available');

      // Determine if this involves native LOOP
      const isNativeA = tokenA.address === NATIVE_LOOP;
      const isNativeB = tokenB.address === NATIVE_LOOP;
      const hasNative = isNativeA || isNativeB;

      if (hasNative) {
        // Use addLiquidityETH for native LOOP pairs
        const nonNativeToken = isNativeA ? tokenB : tokenA;
        const nativeAmount = isNativeA ? amountA : amountB;
        const tokenAmount = isNativeA ? amountB : amountA;

        return await executeAddLiquidityETH(nonNativeToken, tokenAmount, nativeAmount);
      } else {
        // Use regular addLiquidity for token-token pairs
        return await executeAddLiquidity(tokenA, tokenB, amountA, amountB);
      }
    } catch (error) {
      console.error('Error adding initial liquidity:', error);
      throw error;
    }
  }, [getProvider]);

  const executeAddToExistingPool = useCallback(async (
    tokenA: Token,
    tokenB: Token,
    amountA: string,
    amountB: string
  ): Promise<string> => {
    console.log('➕ Executing liquidity addition to existing pool...');
    
    // Same logic as initial liquidity for existing pools
    return executeAddInitialLiquidity(tokenA, tokenB, amountA, amountB);
  }, [executeAddInitialLiquidity]);

  const executeAddLiquidityETH = useCallback(async (
    token: Token,
    tokenAmount: string,
    ethAmount: string
  ): Promise<string> => {
    try {
      const provider = await getProvider();
      if (!provider) throw new Error('No provider available');

      console.log('🔥 Executing ReachSwap addLiquidityETH (HARDHAT PATTERN)...');
      
      // Get wallet address
      let currentWalletAddress = walletAddress;
      if (!currentWalletAddress) {
        const accounts = await provider.request({ method: 'eth_accounts' });
        currentWalletAddress = accounts[0];
        if (currentWalletAddress) {
          localStorage.setItem('reachswap_wallet_address', currentWalletAddress);
        }
      }

      if (!currentWalletAddress) {
        throw new Error('No wallet address available');
      }

      const deadlineTimestamp = Math.floor(Date.now() / 1000) + (parseInt(deadline) * 60);

      // 🎯 CRITICAL FIX: Use exact same parameter format as successful Hardhat script
      const tokenAmountWei = ethers.parseUnits(tokenAmount, token.decimals).toString();
      const ethAmountWei = ethers.parseEther(ethAmount).toString();
      
      // 5% slippage (same as Hardhat script)
      const tokenAmountMin = (BigInt(tokenAmountWei) * 95n / 100n).toString();
      const ethAmountMin = (BigInt(ethAmountWei) * 95n / 100n).toString();

      console.log(`💰 Using Hardhat-style parameters:`);
      console.log(`   Token amount: ${tokenAmountWei} wei`);
      console.log(`   ETH amount: ${ethAmountWei} wei`);
      console.log(`   Token min: ${tokenAmountMin} wei`);
      console.log(`   ETH min: ${ethAmountMin} wei`);

      // 🎯 CRITICAL FIX: Use ethers for encoding (like Hardhat) instead of manual encoding
      const routerInterface = new ethers.Interface([
        "function addLiquidityETH(address token, uint amountTokenDesired, uint amountTokenMin, uint amountETHMin, address to, uint deadline, bool skipMEVProtection) external payable"
      ]);

      const txData = routerInterface.encodeFunctionData("addLiquidityETH", [
        token.address,
        tokenAmountWei,
        tokenAmountMin,
        ethAmountMin,
        currentWalletAddress,
        deadlineTimestamp,
        false // skipMEVProtection
      ]);

      console.log(`🔍 Ethers-encoded transaction data: ${txData}`);

      const txParams = {
        from: currentWalletAddress,
        to: REACHSWAP_CONTRACTS.ROUTER,
        data: txData,
        value: '0x' + BigInt(ethAmountWei).toString(16),
      };

      console.log(`🚀 Sending transaction with ethers-encoded data...`);
      
      // Send the transaction using the provider
      return await provider.request({
        method: 'eth_sendTransaction',
        params: [txParams]
      });

    } catch (error) {
      console.error('Error executing ReachSwap addLiquidityETH:', error);
      throw error;
    }
  }, [getProvider, walletAddress, deadline]);

  // Enhanced addLiquidity implementation
  const executeAddLiquidity = useCallback(async (
    tokenA: Token,
    tokenB: Token,
    amountA: string,
    amountB: string
  ): Promise<string> => {
    try {
      const provider = await getProvider();
      if (!provider) throw new Error('No provider available');

      console.log('🔥 Executing ReachSwap addLiquidity...');
      console.log(`📊 Token A: ${tokenA.symbol} - Amount: ${amountA}`);
      console.log(`📊 Token B: ${tokenB.symbol} - Amount: ${amountB}`);

      const deadlineTimestamp = Math.floor(Date.now() / 1000) + (parseInt(deadline) * 60);
      const slippageDecimal = parseFloat(slippage) / 100;

      // Convert amounts to wei using safe conversion
      const amountAWei = convertToWei(amountA, tokenA.decimals);
      const amountBWei = convertToWei(amountB, tokenB.decimals);

      console.log(`💰 Amount A in wei: ${amountAWei}`);
      console.log(`💰 Amount B in wei: ${amountBWei}`);

      // Calculate minimum amounts with slippage protection
      const amountAMin = (BigInt(amountAWei) * BigInt(Math.floor((1 - slippageDecimal) * 10000)) / BigInt(10000)).toString();
      const amountBMin = (BigInt(amountBWei) * BigInt(Math.floor((1 - slippageDecimal) * 10000)) / BigInt(10000)).toString();

      // ✅ CRITICAL FIX: Use correct ReachSwap addLiquidity signature with skipMEVProtection
      // addLiquidity(address tokenA, address tokenB, uint amountADesired, uint amountBDesired, uint amountAMin, uint amountBMin, address to, uint deadline, bool skipMEVProtection)
      const addLiquiditySignature = '0x39add5e8'; // ← CORRECT ReachSwap signature with MEV protection
      const paddedTokenA = tokenA.address.slice(2).padStart(64, '0');
      const paddedTokenB = tokenB.address.slice(2).padStart(64, '0');
      const paddedAmountADesired = BigInt(amountAWei).toString(16).padStart(64, '0');
      const paddedAmountBDesired = BigInt(amountBWei).toString(16).padStart(64, '0');
      const paddedAmountAMin = BigInt(amountAMin).toString(16).padStart(64, '0');
      const paddedAmountBMin = BigInt(amountBMin).toString(16).padStart(64, '0');
      const paddedTo = walletAddress!.slice(2).padStart(64, '0');
      const paddedDeadline = deadlineTimestamp.toString(16).padStart(64, '0');
      // ✅ CRITICAL: Add skipMEVProtection parameter (false = enable protection)
      const paddedSkipMEV = '0'.padStart(64, '0'); // false = enable MEV protection

      const txData = addLiquiditySignature + paddedTokenA + paddedTokenB + paddedAmountADesired + 
                    paddedAmountBDesired + paddedAmountAMin + paddedAmountBMin + paddedTo + 
                    paddedDeadline + paddedSkipMEV;

      const txParams = {
        from: walletAddress!,
        to: REACHSWAP_CONTRACTS.ROUTER,
        data: txData
      };

      // Estimate gas with buffer
      const gasLimit = await estimateGasWithBuffer(txParams, 1.5);

      return await sendTransaction({
        ...txParams,
        gas: gasLimit
      });
    } catch (error) {
      console.error('Error executing ReachSwap addLiquidity:', error);
      throw error;
    }
  }, [getProvider, walletAddress, slippage, deadline, convertToWei]);

  // Handle pool selection for removal
  const handlePoolSelect = useCallback((position: LiquidityPosition) => {
    setSelectedLiquidityPosition(position);
    setShowSelectPoolModal(false);
    setShowRemoveModal(true);
  }, []);

  // Handle remove liquidity confirmation
  const handleRemoveLiquidity = useCallback(async (position: LiquidityPosition, percentage: number) => {
    if (!isWalletConnected || !position) return;

    try {
      console.log('🔥 Starting remove liquidity process...');
      console.log(`📊 Position: ${position.pair}`);
      console.log(`📊 Percentage: ${percentage}%`);
      
      // The RemoveLiquidityModal will handle the actual removal process
      // This callback is mainly for cleanup after successful removal
      
      // Reset and close modals
      setShowRemoveModal(false);
      setSelectedLiquidityPosition(null);
      
      // Refresh data after successful transaction
      setTimeout(async () => {
        await updatePoolData();
        if (position.token0) await fetchBalanceForToken(position.token0);
        if (position.token1) await fetchBalanceForToken(position.token1);
      }, 3000);
      
    } catch (error) {
      console.error('Error in remove liquidity callback:', error);
    }
  }, [isWalletConnected, updatePoolData, fetchBalanceForToken]);

  // Validation for add liquidity
  const canAddLiquidity = useMemo(() => {
    if (!token0 || !token1 || !amount0 || !amount1 || !isWalletConnected) return false;
    if (liquidityState.step !== 'input') return false;
    
    const amt0 = parseFloat(amount0);
    const amt1 = parseFloat(amount1);
    const balance0 = parseFloat(getVisibleTokenBalance(token0));
    const balance1 = parseFloat(getVisibleTokenBalance(token1));
    
    return amt0 > 0 && amt1 > 0 && amt0 <= balance0 && amt1 <= balance1;
  }, [token0, token1, amount0, amount1, isWalletConnected, liquidityState.step, getVisibleTokenBalance]);

  // Get estimated APR (mock calculation)
  const estimatedAPR = useMemo(() => {
    if (!poolStatus.hasLiquidity) return '---';
    return '24.5%'; // This would come from historical data
  }, [poolStatus.hasLiquidity]);

  // Get appropriate button text based on current state
  const getAddLiquidityButtonText = () => {
    if (isLoadingPool) return 'Checking Pool...';
    if (liquidityState.step === 'approving') return 'Approving Tokens...';
    if (liquidityState.step === 'approved') return 'Tokens Approved';
    if (liquidityState.step === 'creating') return 'Creating Pool...';
    if (liquidityState.step === 'adding') return 'Adding Liquidity...';
    if (liquidityState.step === 'success') return 'Success!';
    if (liquidityState.step === 'error') return 'Try Again';
    if (!isWalletConnected) return 'Connect Wallet';
    if (!token0 || !token1) return 'Select Tokens';
    if (!amount0 || !amount1) return 'Enter Amounts';
    if (!poolStatus.pairExists) return 'Create Pool & Add Liquidity';
    if (poolStatus.pairExists && !poolStatus.hasLiquidity) return 'Add Initial Liquidity';
    return 'Add Liquidity';
  };

  // Get pool status display
  const getPoolStatusDisplay = () => {
    if (!token0 || !token1) return null;
    
    if (isLoadingPool) {
      return (
        <div className="flex items-center space-x-2 text-gray-500 text-sm">
          <RefreshCcw className="w-3 h-3 animate-spin" />
          <span>Checking pool status...</span>
        </div>
      );
    }
    
    if (!poolStatus.pairExists) {
      return (
        <div className="flex items-center space-x-2 text-blue-600 dark:text-blue-400 text-sm">
          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
          <span>New pool • You set the initial price</span>
        </div>
      );
    }
    
    if (!poolStatus.hasLiquidity) {
      return (
        <div className="flex items-center space-x-2 text-yellow-600 dark:text-yellow-400 text-sm">
          <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
          <span>Empty pool • Add initial liquidity to set price</span>
        </div>
      );
    }
    
    return (
      <div className="flex items-center space-x-2 text-green-600 dark:text-green-400 text-sm">
        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
        <span>Pool active • Auto-calculating amounts</span>
      </div>
    );
  };

  // Handle main action based on current state
  const handleMainAction = () => {
    if (liquidityState.step === 'error') {
      // Reset to input state to allow retry
      setLiquidityState({ step: 'input' });
    } else if (liquidityState.step === 'success') {
      // Reset everything after success
      setAmount0('');
      setAmount1('');
      setLiquidityState({ step: 'input' });
    } else if (canAddLiquidity) {
      // Show confirmation modal instead of directly executing
      setShowConfirmModal(true);
    } else if (!isWalletConnected) {
      onConnectWallet();
    }
  };

  // Handle confirmation from modal
  const handleConfirmAddLiquidity = useCallback(async () => {
    // Close the confirmation modal
    setShowConfirmModal(false);
    
    // Execute the actual liquidity addition
    await handleAddLiquidity();
  }, [handleAddLiquidity]);

  // Ensure token balances are fetched when tokens change
  useEffect(() => {
    if (token0 && isWalletConnected && walletAddress) {
      fetchBalanceForToken(token0);
    }
  }, [token0, isWalletConnected, walletAddress, fetchBalanceForToken]);

  useEffect(() => {
    if (token1 && isWalletConnected && walletAddress) {
      fetchBalanceForToken(token1);
    }
  }, [token1, isWalletConnected, walletAddress, fetchBalanceForToken]);

  const showProgress = ['approving', 'creating', 'adding'].includes(liquidityState.step);
  const canInteract = liquidityState.step === 'input' || liquidityState.step === 'error';

  // Add error boundary to catch rendering errors
  try {
    return (
      <div className="max-w-md mx-auto">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => {
                  if (canInteract) {
                    setMode('add');
                    setLiquidityState({ step: 'input' });
                  }
                }}
                disabled={!canInteract}
                className={`px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 ${
                  mode === 'add'
                    ? 'bg-orange-500 text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                Add
              </button>
              <button
                onClick={() => {
                  if (canInteract) {
                    setMode('remove');
                    if (isWalletConnected) {
                      setShowSelectPoolModal(true);
                    }
                  }
                }}
                disabled={!canInteract}
                className={`px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 ${
                  mode === 'remove'
                    ? 'bg-red-500 text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                Remove
              </button>
            </div>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={() => {
                  if (canInteract) {
                    updatePoolData();
                    if (token0) fetchBalanceForToken(token0);
                    if (token1) fetchBalanceForToken(token1);
                  }
                }}
                disabled={isLoadingPool || !canInteract}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
                title="Refresh data"
              >
                <RefreshCcw className={`w-4 h-4 text-gray-500 dark:text-gray-400 ${isLoadingPool ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => canInteract && setShowSettingsModal(true)}
                disabled={!canInteract}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
                title="Settings"
              >
                <Settings className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          {mode === 'add' ? (
            <>
              {/* Process Status */}
              {liquidityState.step !== 'input' && (
                <div className={`mb-4 rounded-xl p-4 border ${
                  liquidityState.step === 'success' ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' :
                  liquidityState.step === 'error' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' :
                  'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                }`}>
                  <div className="space-y-3">
                    <h4 className="font-medium text-gray-900 dark:text-white text-sm">
                      {liquidityState.step === 'success' ? 'Liquidity Added Successfully!' :
                       liquidityState.step === 'error' ? 'Transaction Failed' :
                       'Adding Liquidity...'}
                    </h4>
                    
                    {/* Progress Steps */}
                    {liquidityState.step !== 'error' && liquidityState.step !== 'success' && (
                      <div className="space-y-2">
                        {/* Approval Step */}
                        {liquidityState.needsApproval && (
                          <div className="flex items-center space-x-3">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                              liquidityState.step === 'approving' ? 'bg-blue-500 text-white' :
                              ['approved', 'creating', 'adding'].includes(liquidityState.step) ? 'bg-green-500 text-white' :
                              'bg-gray-300 text-gray-600'
                            }`}>
                              {liquidityState.step === 'approving' ? <RefreshCcw className="w-3 h-3 animate-spin" /> :
                               ['approved', 'creating', 'adding'].includes(liquidityState.step) ? '✓' : '1'}
                            </div>
                            <div>
                              <div className="text-sm font-medium text-gray-900 dark:text-white">
                                Approve Tokens
                              </div>
                              {liquidityState.approvalTxHash && (
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  Tx: {liquidityState.approvalTxHash.slice(0, 10)}...
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* Liquidity Step */}
                        <div className="flex items-center space-x-3">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            ['creating', 'adding'].includes(liquidityState.step) ? 'bg-blue-500 text-white' :
                            'bg-gray-300 text-gray-600'
                          }`}>
                            {['creating', 'adding'].includes(liquidityState.step) ? <RefreshCcw className="w-3 h-3 animate-spin" /> : '2'}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {liquidityState.step === 'creating' ? 'Creating Pool' : 'Adding Liquidity'}
                            </div>
                            {liquidityState.liquidityTxHash && (
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                Tx: {liquidityState.liquidityTxHash.slice(0, 10)}...
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Error Display */}
                    {liquidityState.error && (
                      <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                        <div className="flex items-start space-x-2">
                          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                          <p className="text-sm text-red-700 dark:text-red-400">
                            {liquidityState.error}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Success Message */}
                    {liquidityState.step === 'success' && (
                      <div className="text-sm text-green-700 dark:text-green-400">
                        Your liquidity has been successfully added to the pool. You can now start earning fees from trades!
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Enhanced Pool Status Display */}
              {liquidityState.step === 'input' && (
                <div className="mb-4">
                  {getPoolStatusDisplay()}
                </div>
              )}

              {/* Token 0 Input */}
              <div className="mb-3">
                <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Token</span>
                    {token0 && isWalletConnected && (
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          Balance: {getVisibleTokenBalance(token0)}
                        </span>
                        {parseFloat(getVisibleTokenBalance(token0)) > 0 && canInteract && (
                          <button
                            onClick={() => handleMaxAmount(true)}
                            className="text-xs text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 font-medium"
                          >
                            MAX
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => {
                        if (canInteract) {
                          setTokenModalType('token0');
                          setShowTokenModal(true);
                        }
                      }}
                      disabled={!canInteract}
                      className="flex items-center space-x-2 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors min-w-0 flex-shrink-0 disabled:opacity-50"
                    >
                      {token0 ? (
                        <>
                          <div className="w-6 h-6 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-600 flex items-center justify-center">
                            {getTokenLogoUrl(token0) ? (
                              <img 
                                src={getTokenLogoUrl(token0)} 
                                alt={token0.symbol}
                                className="w-5 h-5 object-contain"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                  const parent = target.parentElement;
                                  if (parent) {
                                    parent.className = 'w-6 h-6 bg-gradient-to-br from-orange-400 to-blue-500 rounded-full flex items-center justify-center';
                                    parent.innerHTML = `<span class="text-white font-bold text-xs">${token0.symbol.charAt(0)}</span>`;
                                  }
                                }}
                              />
                            ) : (
                              <div className="w-6 h-6 bg-gradient-to-br from-orange-400 to-blue-500 rounded-full flex items-center justify-center">
                                <span className="text-white font-bold text-xs">{token0.symbol.charAt(0)}</span>
                              </div>
                            )}
                          </div>
                          <span className="font-medium text-gray-900 dark:text-white text-sm">
                            {getTokenDisplayName(token0)}
                          </span>
                        </>
                      ) : (
                        <span className="text-gray-500 dark:text-gray-400 text-sm">Select token</span>
                      )}
                    </button>
                    
                    <input
                      type="text"
                      placeholder="0.0"
                      value={amount0}
                      onChange={(e) => canInteract && handleAmountChange(e.target.value, true)}
                      disabled={!canInteract || (poolStatus.hasLiquidity && !isToken0Input)}
                      className="flex-1 bg-transparent border-none outline-none text-right text-xl font-semibold text-gray-900 dark:text-white placeholder-gray-400 disabled:opacity-50"
                    />
                  </div>
                  
                  {token0 && amount0 && token0.price && (
                    <div className="text-right text-sm text-gray-500 dark:text-gray-400 mt-1">
                      ~${(parseFloat(amount0) * token0.price).toFixed(2)}
                    </div>
                  )}
                </div>
              </div>

              {/* Plus Icon */}
              <div className="flex justify-center mb-3">
                <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                  <Plus className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                </div>
              </div>

              {/* Token 1 Input */}
              <div className="mb-4">
                <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Token</span>
                    {token1 && isWalletConnected && (
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          Balance: {getVisibleTokenBalance(token1)}
                        </span>
                        {parseFloat(getVisibleTokenBalance(token1)) > 0 && canInteract && (
                          <button
                            onClick={() => handleMaxAmount(false)}
                            disabled={poolStatus.hasLiquidity && isToken0Input}
                            className="text-xs text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 font-medium disabled:opacity-50"
                          >
                            MAX
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => {
                        if (canInteract) {
                          setTokenModalType('token1');
                          setShowTokenModal(true);
                        }
                      }}
                      disabled={!canInteract}
                      className="flex items-center space-x-2 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors min-w-0 flex-shrink-0 disabled:opacity-50"
                    >
                      {token1 ? (
                        <>
                          <div className="w-6 h-6 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-600 flex items-center justify-center">
                            {getTokenLogoUrl(token1) ? (
                              <img 
                                src={getTokenLogoUrl(token1)} 
                                alt={token1.symbol}
                                className="w-5 h-5 object-contain"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                  const parent = target.parentElement;
                                  if (parent) {
                                    parent.className = 'w-6 h-6 bg-gradient-to-br from-orange-400 to-blue-500 rounded-full flex items-center justify-center';
                                    parent.innerHTML = `<span class="text-white font-bold text-xs">${token1.symbol.charAt(0)}</span>`;
                                  }
                                }}
                              />
                            ) : (
                              <div className="w-6 h-6 bg-gradient-to-br from-orange-400 to-blue-500 rounded-full flex items-center justify-center">
                                <span className="text-white font-bold text-xs">{token1.symbol.charAt(0)}</span>
                              </div>
                            )}
                          </div>
                          <span className="font-medium text-gray-900 dark:text-white text-sm">
                            {getTokenDisplayName(token1)}
                          </span>
                        </>
                      ) : (
                        <span className="text-gray-500 dark:text-gray-400 text-sm">Select token</span>
                      )}
                    </button>
                    
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        placeholder="0.0"
                        value={amount1}
                        onChange={(e) => canInteract && handleAmountChange(e.target.value, false)}
                        disabled={!canInteract || (poolStatus.hasLiquidity && isToken0Input)}
                        className="w-full bg-transparent border-none outline-none text-right text-xl font-semibold text-gray-900 dark:text-white placeholder-gray-400 disabled:opacity-50"
                      />
                    </div>
                  </div>
                  
                  {token1 && amount1 && token1.price && (
                    <div className="text-right text-sm text-gray-500 dark:text-gray-400 mt-1">
                      ~${(parseFloat(amount1) * token1.price).toFixed(2)}
                    </div>
                  )}
                </div>
              </div>

              {/* Enhanced Pool Information */}
              {token0 && token1 && amount0 && amount1 && liquidityState.step === 'input' && (
                <div className="mb-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 space-y-3">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                    {poolStatus.pairExists && poolStatus.hasLiquidity ? 'Adding to Pool' : 'Pool Creation'}
                  </h4>
                  
                  <div className="space-y-2 text-sm">
                    {!poolStatus.pairExists && (
                      <div className="bg-blue-100 dark:bg-blue-800/30 rounded-lg p-3">
                        <div className="flex items-center space-x-2">
                          <Info className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          <span className="text-blue-700 dark:text-blue-300 font-medium">
                            Creating New Pool
                          </span>
                        </div>
                        <p className="text-blue-600 dark:text-blue-400 text-xs mt-1">
                          You're creating a new trading pair. Set the initial price by providing both tokens.
                        </p>
                      </div>
                    )}
                    
                    {poolStatus.pairExists && !poolStatus.hasLiquidity && (
                      <div className="bg-yellow-100 dark:bg-yellow-800/30 rounded-lg p-3">
                        <div className="flex items-center space-x-2">
                          <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                          <span className="text-yellow-700 dark:text-yellow-300 font-medium">
                            Adding Initial Liquidity
                          </span>
                        </div>
                        <p className="text-yellow-600 dark:text-yellow-400 text-xs mt-1">
                          Pool exists but has no liquidity. You're setting the initial price.
                        </p>
                      </div>
                    )}
                    
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Your Pool Share</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {poolShare.toFixed(4)}%
                      </span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">LP Tokens</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {estimatedLPTokens}
                      </span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Estimated APR</span>
                      <span className="font-medium text-green-600 dark:text-green-400">
                        {estimatedAPR}
                      </span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Total Value</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        ${((parseFloat(amount0) * (token0.price || 0)) + (parseFloat(amount1) * (token1.price || 0))).toFixed(2)}
                      </span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Exchange Rate</span>
                      <div className="text-right">
                        <div className="font-medium text-gray-900 dark:text-white text-xs">
                          1 {token0.symbol} = {(parseFloat(amount1) / parseFloat(amount0)).toFixed(6)} {token1.symbol}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Error States */}
              {customTokenError && liquidityState.step === 'input' && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <span className="text-sm text-red-700 dark:text-red-400">{customTokenError}</span>
                  </div>
                </div>
              )}

              {liquidityError && liquidityState.step === 'input' && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <span className="text-sm text-red-700 dark:text-red-400">{liquidityError}</span>
                  </div>
                </div>
              )}

              {/* Enhanced Add Liquidity Button */}
              <button
                onClick={handleMainAction}
                disabled={
                  isLoadingPool || 
                  showProgress || 
                  (liquidityState.step === 'input' && !canAddLiquidity && isWalletConnected) ||
                  (liquidityState.step === 'success')
                }
                className={`w-full py-4 rounded-xl font-semibold transition-all duration-200 flex items-center justify-center space-x-2 ${
                  isLoadingPool || showProgress
                    ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                    : liquidityState.step === 'success'
                    ? 'bg-gradient-to-r from-green-500 to-green-600 text-white cursor-default'
                    : liquidityState.step === 'error'
                    ? 'bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
                    : (canAddLiquidity || !isWalletConnected)
                    ? 'bg-gradient-to-r from-orange-500 to-blue-600 hover:from-orange-600 hover:to-blue-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
                    : 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                }`}
              >
                {isLoadingPool || showProgress ? (
                  <>
                    <RefreshCcw className="w-4 h-4 animate-spin" />
                    <span>{getAddLiquidityButtonText()}</span>
                  </>
                ) : liquidityState.step === 'success' ? (
                  <>
                    <span>✅ {getAddLiquidityButtonText()}</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>{getAddLiquidityButtonText()}</span>
                  </>
                )}
              </button>
            </>
          ) : (
            /* Remove Liquidity Mode */
            <div className="text-center py-8">
              <div className="mb-4">
                <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Minus className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  Remove Liquidity
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                  Select a liquidity pool to remove your position
                </p>
              </div>
              
              <button
                onClick={() => setShowSelectPoolModal(true)}
                disabled={!isWalletConnected}
                className={`px-6 py-3 rounded-xl font-medium transition-colors ${
                  !isWalletConnected
                    ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                    : 'bg-red-500 hover:bg-red-600 text-white'
                }`}
              >
                <Minus className="w-4 h-4 inline mr-2" />
                Select Pool to Remove
              </button>
              
              {!isWalletConnected && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  Connect your wallet to view liquidity positions
                </p>
              )}
            </div>
          )}
        </div>

        {/* Enhanced Footer Info */}
        <div className="px-4 pb-4">
          <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-3 border border-orange-200 dark:border-orange-800">
            <div className="flex items-start space-x-2">
              <Info className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-orange-700 dark:text-orange-300">
                <p className="font-medium mb-1">
                  {mode === 'add' ? (
                    poolStatus.pairExists && poolStatus.hasLiquidity 
                      ? 'Liquidity Provider Rewards' 
                      : 'Pool Creation Notice'
                  ) : 'Remove Liquidity'}
                </p>
                <p>
                  {mode === 'add' ? (
                    poolStatus.pairExists && poolStatus.hasLiquidity
                      ? 'By adding liquidity, you\'ll earn 0.25% of all trades on this pair proportional to your share of the pool. Fees are added to the pool and accrue in real time.'
                      : 'You\'re creating a new pool or adding initial liquidity. This sets the initial price ratio for this trading pair. Other users will be able to trade at this price.'
                  ) : (
                    'Select one of your liquidity positions to remove tokens from the pool. You will stop earning fees on the removed portion.'
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <TokenModal
        isOpen={showTokenModal}
        onClose={() => setShowTokenModal(false)}
        onSelectToken={handleTokenSelect}
        selectedToken={tokenModalType === 'token0' ? token0 || undefined : token1 || undefined}
        title={`Select Token`}
        isWalletConnected={isWalletConnected}
      />

      <LiquidityConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleConfirmAddLiquidity}
        token0={token0!}
        token1={token1!}
        amount0={amount0}
        amount1={amount1}
        poolShare={poolShare}
        estimatedAPR={estimatedAPR}
        gasPrice={gasPrice}
        isLoading={showProgress}
      />

      <RemoveLiquidityModal
        isOpen={showRemoveModal}
        onClose={() => setShowRemoveModal(false)}
        onConfirm={handleRemoveLiquidity}
        position={selectedLiquidityPosition}
        isLoading={false} // RemoveLiquidityModal handles its own loading state
      />

      <SwapSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        slippage={slippage}
        onSlippageChange={setSlippage}
        gasPrice={gasPrice}
        onGasPriceChange={setGasPrice}
        expertMode={false}
        onExpertModeChange={() => {}}
      />

      <SelectPoolModal
        isOpen={showSelectPoolModal}
        onClose={() => setShowSelectPoolModal(false)}
        onSelectPool={handlePoolSelect}
        isWalletConnected={isWalletConnected}
      />
    </div>
    );
  } catch (error) {
    console.error('Error rendering LiquidityInterface:', error);
    return (
      <div className="max-w-md mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-red-500 text-xl">⚠️</span>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Interface Error
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              The liquidity interface encountered an error. Please refresh the page.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors"
            >
              Refresh Page
            </button>
          </div>
        </div>
      </div>
    );
  }
};

export default LiquidityInterface;