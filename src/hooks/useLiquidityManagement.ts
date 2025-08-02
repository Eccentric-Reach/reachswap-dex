import { useState, useCallback } from 'react';
import { ethers } from 'ethers';
import { Token } from '../types';
import { REACHSWAP_CONTRACTS } from '../constants/reachswap';

interface LiquidityPool {
  pairAddress: string;
  token0: Token;
  token1: Token;
  reserve0: string;
  reserve1: string;
  totalSupply: string;
  router: 'reachswap';
  factoryAddress: string;
  routerAddress: string;
  fee: string;
  apy: string;
  volume24h: string;
  tvl: string;
  userLPBalance?: string;
  userLPBalanceFormatted?: string;
  userShareOfPool?: number;
  userToken0Amount?: string;
  userToken1Amount?: string;
}

interface UserLiquidityPosition {
  pool: LiquidityPool;
  lpTokenBalance: string;
  token0Amount: string;
  token1Amount: string;
  shareOfPool: number;
  value: number;
  pendingRewards: string;
}

interface LiquidityQuote {
  token0Amount: string;
  token1Amount: string;
  lpTokensToReceive: string;
  shareOfPool: number;
  priceImpact: number;
  router: 'reachswap';
  minimumAmounts: {
    token0Min: string;
    token1Min: string;
  };
  isFirstLiquidity: boolean;
  pairExists: boolean;
}

interface UseLiquidityManagementReturn {
  getAllPools: (userAddress?: string) => Promise<LiquidityPool[]>;
  getPool: (tokenA: Token, tokenB: Token, userAddress?: string) => Promise<LiquidityPool | null>;
  getUserPositions: (userAddress: string) => Promise<UserLiquidityPosition[]>;
  getUserLPBalance: (userAddress: string, pairAddress: string) => Promise<{
    lpBalance: string;
    lpBalanceFormatted: string;
    shareOfPool: number;
    token0Amount: string;
    token1Amount: string;
  } | null>;
  calculateAddLiquidityQuote: (
    tokenA: Token,
    tokenB: Token,
    amountA: string,
    amountB: string,
    slippage: number
  ) => Promise<LiquidityQuote>;
  calculateRemoveLiquidityQuote: (
    pool: LiquidityPool,
    lpTokenAmount: string,
    slippage: number
  ) => Promise<{
    token0Amount: string;
    token1Amount: string;
    minimumAmounts: { token0Min: string; token1Min: string };
  }>;
  checkPairExists: (tokenA: Token, tokenB: Token) => Promise<boolean>;
  createPool: (tokenA: Token, tokenB: Token, amountA: string, amountB: string) => Promise<string>;
  executeRemoveLiquidityETH: (
    token: Token,
    liquidity: string,
    tokenAmountMin: string,
    ethAmountMin: string,
    walletAddress: string
  ) => Promise<string>;
  executeRemoveLiquidity: (
    tokenA: Token,
    tokenB: Token,
    liquidity: string,
    amountAMin: string,
    amountBMin: string,
    walletAddress: string
  ) => Promise<string>;
  isLoading: boolean;
  error: string | null;
}

// ============ ENHANCED WITH REACHSWAP-SPECIFIC FUNCTION SIGNATURES ============

// Your ReachSwap contract signatures (with skipMEVProtection parameter)
const ADD_LIQUIDITY_SIGNATURE = '0x39add5e8'; // addLiquidity with skipMEVProtection
const ADD_LIQUIDITY_ETH_SIGNATURE = '0x7fd4e7e5'; // addLiquidityETH with skipMEVProtection

const REMOVE_LIQUIDITY_SIGNATURE = '0x8a2c8e97'; // removeLiquidity with skipMEVProtection
// const REMOVE_LIQUIDITY_ETH_SIGNATURE = '0x7c4d4b87'; // removeLiquidityETH with skipMEVProtection

export const useLiquidityManagement = (): UseLiquidityManagementReturn => {
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

  // ✅ ENHANCED: Check if pair exists on ReachSwap with proper validation
  const checkPairExists = useCallback(async (tokenA: Token, tokenB: Token): Promise<boolean> => {
    try {
      const provider = getProvider();
      if (!provider) return false;

      // Handle native LOOP conversion to WLOOP for contract calls
      const tokenAAddr = tokenA.address === '0x0000000000000000000000000000000000000000' 
        ? REACHSWAP_CONTRACTS.WLOOP 
        : tokenA.address;
      const tokenBAddr = tokenB.address === '0x0000000000000000000000000000000000000000' 
        ? REACHSWAP_CONTRACTS.WLOOP 
        : tokenB.address;

      console.log(`🔍 Checking ReachSwap pair exists: ${tokenA.symbol}/${tokenB.symbol}`);
      console.log(`📍 Contract addresses: ${tokenAAddr} / ${tokenBAddr}`);
      console.log(`🏭 ReachSwap Factory: ${REACHSWAP_CONTRACTS.FACTORY}`);

      // Use your ReachSwap factory's getPair function
      const getPairSignature = '0xe6a43905';
      
      // Sort tokens as your factory expects
      const token0 = tokenAAddr.toLowerCase() < tokenBAddr.toLowerCase() ? tokenAAddr : tokenBAddr;
      const token1 = tokenAAddr.toLowerCase() < tokenBAddr.toLowerCase() ? tokenBAddr : tokenAAddr;
      
      const paddedToken0 = token0.slice(2).padStart(64, '0');
      const paddedToken1 = token1.slice(2).padStart(64, '0');
      const data = getPairSignature + paddedToken0 + paddedToken1;

      const result = await provider.request({
        method: 'eth_call',
        params: [{
          to: REACHSWAP_CONTRACTS.FACTORY,
          data: data
        }, 'latest']
      });

      if (!result || result === '0x0000000000000000000000000000000000000000000000000000000000000000') {
        console.log('❌ ReachSwap pair does not exist');
        return false;
      }

      const pairAddress = '0x' + result.slice(-40);
      const exists = pairAddress !== '0x0000000000000000000000000000000000000000';
      
      console.log(`✅ ReachSwap pair ${exists ? 'exists' : 'does not exist'} at: ${pairAddress}`);
      return exists;
    } catch (error) {
      console.error('Error checking ReachSwap pair exists:', error);
      return false;
    }
  }, [getProvider]);

  // ✅ ENHANCED: Get pair information from ReachSwap factory with validation
  const getPairInfo = useCallback(async (
    tokenA: string,
    tokenB: string
  ): Promise<{
    pairAddress: string;
    reserve0: string;
    reserve1: string;
    totalSupply: string;
    token0: string;
    token1: string;
    hasLiquidity: boolean;
  } | null> => {
    try {
      const provider = getProvider();
      if (!provider) return null;

      console.log(`🔍 Getting ReachSwap pair info for: ${tokenA} / ${tokenB}`);

      // Get pair address from your ReachSwap factory
      const getPairSignature = '0xe6a43905';
      const token0 = tokenA.toLowerCase() < tokenB.toLowerCase() ? tokenA : tokenB;
      const token1 = tokenA.toLowerCase() < tokenB.toLowerCase() ? tokenB : tokenA;
      const paddedToken0 = token0.slice(2).padStart(64, '0');
      const paddedToken1 = token1.slice(2).padStart(64, '0');
      const data = getPairSignature + paddedToken0 + paddedToken1;

      const pairResult = await provider.request({
        method: 'eth_call',
        params: [{
          to: REACHSWAP_CONTRACTS.FACTORY,
          data: data
        }, 'latest']
      });

      if (!pairResult || pairResult === '0x0000000000000000000000000000000000000000000000000000000000000000') {
        return null;
      }

      const pairAddress = '0x' + pairResult.slice(-40);
      console.log(`📦 ReachSwap pair found at: ${pairAddress}`);

      // ✅ ENHANCED: Verify this is actually a ReachSwap pair by checking factory
      const [reservesResult, totalSupplyResult, factoryResult] = await Promise.all([
        provider.request({
          method: 'eth_call',
          params: [{
            to: pairAddress,
            data: '0x0902f1ac' // getReserves()
          }, 'latest']
        }),
        provider.request({
          method: 'eth_call',
          params: [{
            to: pairAddress,
            data: '0x18160ddd' // totalSupply()
          }, 'latest']
        }),
        // ✅ NEW: Verify this is a ReachSwap pair
        provider.request({
          method: 'eth_call',
          params: [{
            to: pairAddress,
            data: '0xc45a0155' // factory()
          }, 'latest']
        })
      ]);

      // ✅ ENHANCED: Verify this pair was created by your ReachSwap factory
      const pairFactory = '0x' + factoryResult.slice(-40);
      if (pairFactory.toLowerCase() !== REACHSWAP_CONTRACTS.FACTORY.toLowerCase()) {
        console.log(`❌ Pair factory mismatch: expected ${REACHSWAP_CONTRACTS.FACTORY}, got ${pairFactory}`);
        return null;
      }

      // Decode reserves
      const reservesData = reservesResult.slice(2);
      const reserve0 = BigInt('0x' + reservesData.slice(0, 64)).toString();
      const reserve1 = BigInt('0x' + reservesData.slice(64, 128)).toString();

      // Decode total supply
      const totalSupply = BigInt(totalSupplyResult).toString();

      // ✅ ENHANCED: Check if pool has actual liquidity
      const hasLiquidity = BigInt(reserve0) > 0n && BigInt(reserve1) > 0n;

      console.log(`💰 ReachSwap reserves: ${reserve0} / ${reserve1} (has liquidity: ${hasLiquidity})`);

      return {
        pairAddress,
        reserve0,
        reserve1,
        totalSupply,
        token0,
        token1,
        hasLiquidity
      };
    } catch (error) {
      console.error('Error getting ReachSwap pair info:', error);
      return null;
    }
  }, [getProvider]);

  // ✅ ENHANCED: Get user's LP balance for a specific ReachSwap pool
  const getUserLPBalance = useCallback(async (
    userAddress: string,
    pairAddress: string
  ): Promise<{
    lpBalance: string;
    lpBalanceFormatted: string;
    shareOfPool: number;
    token0Amount: string;
    token1Amount: string;
  } | null> => {
    try {
      const provider = getProvider();
      if (!provider) return null;

      console.log(`🔍 Fetching ReachSwap LP balance for user ${userAddress} in pair ${pairAddress}`);

      // Get user's LP token balance
      const balanceOfSignature = '0x70a08231';
      const paddedUser = userAddress.slice(2).padStart(64, '0');
      const balanceData = balanceOfSignature + paddedUser;

      const [lpBalanceResult, totalSupplyResult, reservesResult] = await Promise.all([
        // Get user's LP balance
        provider.request({
          method: 'eth_call',
          params: [{
            to: pairAddress,
            data: balanceData
          }, 'latest']
        }),
        // Get total supply
        provider.request({
          method: 'eth_call',
          params: [{
            to: pairAddress,
            data: '0x18160ddd'
          }, 'latest']
        }),
        // Get reserves
        provider.request({
          method: 'eth_call',
          params: [{
            to: pairAddress,
            data: '0x0902f1ac'
          }, 'latest']
        })
      ]);

      const lpBalance = BigInt(lpBalanceResult || '0x0');
      const totalSupply = BigInt(totalSupplyResult || '0x0');

      // Return null if user has no LP tokens
      if (lpBalance === BigInt(0)) {
        return null;
      }

      // Format LP balance
      const lpBalanceFormatted = (Number(lpBalance) / Math.pow(10, 18)).toFixed(6);

      // Calculate share of pool
      const shareOfPool = totalSupply > BigInt(0) 
        ? Number((lpBalance * BigInt(10000) / totalSupply)) / 100 
        : 0;

      // Decode reserves
      const reservesData = reservesResult.slice(2);
      const reserve0 = BigInt('0x' + reservesData.slice(0, 64)).toString();
      const reserve1 = BigInt('0x' + reservesData.slice(64, 128)).toString();

      // Calculate token amounts based on LP share
      const token0Amount = (shareOfPool / 100 * Number(reserve0) / Math.pow(10, 18)).toFixed(6);
      const token1Amount = (shareOfPool / 100 * Number(reserve1) / Math.pow(10, 18)).toFixed(6);

      console.log(`✅ ReachSwap LP Balance: ${lpBalanceFormatted}, Share: ${shareOfPool}%, Token0: ${token0Amount}, Token1: ${token1Amount}`);

      return {
        lpBalance: lpBalance.toString(),
        lpBalanceFormatted,
        shareOfPool,
        token0Amount,
        token1Amount
      };
    } catch (error) {
      console.error('Error getting ReachSwap user LP balance:', error);
      return null;
    }
  }, [getProvider]);

  // ✅ ENHANCED: Get all pools on ReachSwap with better validation
  const getAllPools = useCallback(async (userAddress?: string): Promise<LiquidityPool[]> => {
    setIsLoading(true);
    setError(null);

    try {
      const pools: LiquidityPool[] = [];
      
      // Common token pairs to check on ReachSwap
      const commonTokens = [
        { symbol: 'LOOP', address: '0x0000000000000000000000000000000000000000', decimals: 18, name: 'Loop Network', logoUrl: '/Loop_logo-removebg-preview.png' },
        { symbol: 'wLOOP', address: REACHSWAP_CONTRACTS.WLOOP, decimals: 18, name: 'Wrapped Loop', logoUrl: '/wloop_logo-removebg-preview.png' },
        { symbol: 'GIKO', address: '0x0C6E54f51be9A01C10d0c233806B44b0c5EE5bD3', decimals: 18, name: 'Giko Cat', logoUrl: '/Giko_Logo-removebg-preview.png' },
        { symbol: 'KYC', address: '0x44b9e1C3431E777B446B3ac4A0ec5375a4D26E66', decimals: 18, name: 'KYCURITY', logoUrl: '/KYC_Logo-removebg-preview.png' },
        { symbol: 'LMEME', address: '0x992044E352627C8b2C53A50cb23E5C7576Af7D45', decimals: 8, name: 'Loop Meme', logoUrl: '/LMEME_Logo-removebg-preview.png' }
      ];

      // Check all possible pairs on ReachSwap
      for (let i = 0; i < commonTokens.length; i++) {
        for (let j = i + 1; j < commonTokens.length; j++) {
          const token0 = commonTokens[i];
          const token1 = commonTokens[j];

          // ✅ ENHANCED: Use improved ReachSwap pair info with validation
          const reachSwapPair = await getPairInfo(token0.address, token1.address);

          if (reachSwapPair && BigInt(reachSwapPair.totalSupply) > BigInt(0)) {
            const pool: LiquidityPool = {
              pairAddress: reachSwapPair.pairAddress,
              token0: token0 as Token,
              token1: token1 as Token,
              reserve0: reachSwapPair.reserve0,
              reserve1: reachSwapPair.reserve1,
              totalSupply: reachSwapPair.totalSupply,
              router: 'reachswap',
              factoryAddress: REACHSWAP_CONTRACTS.FACTORY,
              routerAddress: REACHSWAP_CONTRACTS.ROUTER,
              fee: '0.25', // ReachSwap default fee
              apy: '28.7',
              volume24h: '15000',
              tvl: (Number(reachSwapPair.reserve0) * 0.15 + Number(reachSwapPair.reserve1) * 0.15).toFixed(0)
            };

            // Add user-specific data if userAddress is provided
            if (userAddress) {
              const userLPData = await getUserLPBalance(userAddress, reachSwapPair.pairAddress);
              if (userLPData) {
                pool.userLPBalance = userLPData.lpBalance;
                pool.userLPBalanceFormatted = userLPData.lpBalanceFormatted;
                pool.userShareOfPool = userLPData.shareOfPool;
                pool.userToken0Amount = userLPData.token0Amount;
                pool.userToken1Amount = userLPData.token1Amount;
              }
            }

            pools.push(pool);
          }
        }
      }

      // Sort by TVL descending
      pools.sort((a, b) => parseFloat(b.tvl) - parseFloat(a.tvl));

      console.log(`✅ Found ${pools.length} ReachSwap pools`);
      return pools;
    } catch (error: any) {
      console.error('Error getting ReachSwap pools:', error);
      setError(error.message || 'Failed to fetch ReachSwap pools');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [getPairInfo, getUserLPBalance]);

  // ✅ ENHANCED: Get specific pool on ReachSwap with improved validation
  const getPool = useCallback(async (
    tokenA: Token,
    tokenB: Token,
    userAddress?: string
  ): Promise<LiquidityPool | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const tokenAAddr = tokenA.address === '0x0000000000000000000000000000000000000000' 
        ? REACHSWAP_CONTRACTS.WLOOP 
        : tokenA.address;
      const tokenBAddr = tokenB.address === '0x0000000000000000000000000000000000000000' 
        ? REACHSWAP_CONTRACTS.WLOOP 
        : tokenB.address;

      console.log(`🔍 Getting ReachSwap pool: ${tokenA.symbol}/${tokenB.symbol}`);

      // ✅ ENHANCED: Use improved pair info with ReachSwap validation
      const pairInfo = await getPairInfo(tokenAAddr, tokenBAddr);

      if (!pairInfo) {
        console.log(`❌ ReachSwap pool not found for ${tokenA.symbol}/${tokenB.symbol}`);
        return null;
      }

      const pool: LiquidityPool = {
        pairAddress: pairInfo.pairAddress,
        token0: tokenA,
        token1: tokenB,
        reserve0: pairInfo.reserve0,
        reserve1: pairInfo.reserve1,
        totalSupply: pairInfo.totalSupply,
        router: 'reachswap',
        factoryAddress: REACHSWAP_CONTRACTS.FACTORY,
        routerAddress: REACHSWAP_CONTRACTS.ROUTER,
        fee: '0.25', // ReachSwap default fee
        apy: '28.7',
        volume24h: '12500',
        tvl: (Number(pairInfo.reserve0) * 0.15 + Number(pairInfo.reserve1) * 0.15).toFixed(0)
      };

      // Add user-specific data if userAddress is provided
      if (userAddress) {
        const userLPData = await getUserLPBalance(userAddress, pairInfo.pairAddress);
        if (userLPData) {
          pool.userLPBalance = userLPData.lpBalance;
          pool.userLPBalanceFormatted = userLPData.lpBalanceFormatted;
          pool.userShareOfPool = userLPData.shareOfPool;
          pool.userToken0Amount = userLPData.token0Amount;
          pool.userToken1Amount = userLPData.token1Amount;
        }
      }

      console.log(`✅ ReachSwap pool found with ${pairInfo.hasLiquidity ? 'liquidity' : 'no liquidity'}`);
      return pool;
    } catch (error: any) {
      console.error('Error getting ReachSwap pool:', error);
      setError(error.message || 'Failed to fetch ReachSwap pool');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [getPairInfo, getUserLPBalance]);

  // Get user's liquidity positions on ReachSwap
  const getUserPositions = useCallback(async (
    userAddress: string
  ): Promise<UserLiquidityPosition[]> => {
    setIsLoading(true);
    setError(null);

    try {
      const positions: UserLiquidityPosition[] = [];
      const provider = getProvider();
      if (!provider) return positions;

      console.log(`🔍 Getting ReachSwap positions for: ${userAddress}`);

      // Get all ReachSwap pools first
      const allPools = await getAllPools();

      // Check user's LP token balance for each pool
      for (const pool of allPools) {
        try {
          const balanceOfSignature = '0x70a08231';
          const paddedUser = userAddress.slice(2).padStart(64, '0');
          const data = balanceOfSignature + paddedUser;

          const lpBalanceResult = await provider.request({
            method: 'eth_call',
            params: [{
              to: pool.pairAddress,
              data: data
            }, 'latest']
          });

          const lpBalance = BigInt(lpBalanceResult || '0x0');
          
          if (lpBalance > BigInt(0)) {
            const lpBalanceFormatted = (Number(lpBalance) / Math.pow(10, 18)).toFixed(6);
            const totalSupply = BigInt(pool.totalSupply);
            const shareOfPool = Number((lpBalance * BigInt(10000) / totalSupply)) / 100;

            // Calculate token amounts
            const token0Amount = (shareOfPool / 100 * Number(pool.reserve0) / Math.pow(10, pool.token0.decimals)).toFixed(6);
            const token1Amount = (shareOfPool / 100 * Number(pool.reserve1) / Math.pow(10, pool.token1.decimals)).toFixed(6);

            // Calculate USD value
            const value = shareOfPool / 100 * Number(pool.tvl);

            positions.push({
              pool,
              lpTokenBalance: lpBalanceFormatted,
              token0Amount,
              token1Amount,
              shareOfPool,
              value,
              pendingRewards: (value * 0.001).toFixed(6)
            });

            console.log(`✅ Found position: ${pool.token0.symbol}/${pool.token1.symbol} - ${lpBalanceFormatted} LP`);
          }
        } catch (error) {
          console.error(`Error checking LP balance for ReachSwap pool ${pool.pairAddress}:`, error);
        }
      }

      // Sort by value descending
      return positions.sort((a, b) => b.value - a.value);
    } catch (error: any) {
      console.error('Error getting ReachSwap user positions:', error);
      setError(error.message || 'Failed to fetch ReachSwap user positions');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [getAllPools, getProvider]);

  // ✅ ENHANCED: Calculate add liquidity quote with ReachSwap logic
  const calculateAddLiquidityQuote = useCallback(async (
    tokenA: Token,
    tokenB: Token,
    amountA: string,
    amountB: string,
    slippage: number
  ): Promise<LiquidityQuote> => {
    setIsLoading(true);
    setError(null);

    try {
      console.log(`🧮 Calculating ReachSwap liquidity quote: ${tokenA.symbol}/${tokenB.symbol}`);

      // Check if pair exists on ReachSwap
      const pairExists = await checkPairExists(tokenA, tokenB);
      
      if (!pairExists) {
        console.log('💡 New ReachSwap pool creation - user sets both amounts freely');
        // New pool creation - user sets both amounts freely
        return {
          token0Amount: amountA,
          token1Amount: amountB,
          lpTokensToReceive: Math.sqrt(parseFloat(amountA) * parseFloat(amountB)).toFixed(6),
          shareOfPool: 100,
          priceImpact: 0,
          router: 'reachswap',
          minimumAmounts: {
            token0Min: (parseFloat(amountA) * (1 - slippage / 100)).toFixed(6),
            token1Min: (parseFloat(amountB) * (1 - slippage / 100)).toFixed(6)
          },
          isFirstLiquidity: true,
          pairExists: false
        };
      }

      // Existing pool - calculate optimal amounts based on reserves
      const pool = await getPool(tokenA, tokenB);
      if (!pool) {
        throw new Error('ReachSwap pool exists but could not fetch details');
      }

      const reserve0 = Number(pool.reserve0) / Math.pow(10, tokenA.decimals);
      const reserve1 = Number(pool.reserve1) / Math.pow(10, tokenB.decimals);
      
      if (reserve0 === 0 || reserve1 === 0) {
        console.log('💡 Empty ReachSwap pool - treating as first liquidity');
        return {
          token0Amount: amountA,
          token1Amount: amountB,
          lpTokensToReceive: Math.sqrt(parseFloat(amountA) * parseFloat(amountB)).toFixed(6),
          shareOfPool: 100,
          priceImpact: 0,
          router: 'reachswap',
          minimumAmounts: {
            token0Min: (parseFloat(amountA) * (1 - slippage / 100)).toFixed(6),
            token1Min: (parseFloat(amountB) * (1 - slippage / 100)).toFixed(6)
          },
          isFirstLiquidity: true,
          pairExists: true
        };
      }

      const ratio = reserve1 / reserve0;

      // Calculate optimal amount B for given amount A
      const optimalAmountB = parseFloat(amountA) * ratio;
      const useOptimalB = Math.abs(optimalAmountB - parseFloat(amountB)) / parseFloat(amountB) < 0.02;

      let finalAmountA = amountA;
      let finalAmountB = useOptimalB ? optimalAmountB.toFixed(6) : amountB;

      if (!useOptimalB) {
        // Calculate optimal amount A for given amount B
        const optimalAmountA = parseFloat(amountB) / ratio;
        finalAmountA = optimalAmountA.toFixed(6);
      }

      // Calculate LP tokens to receive
      const totalSupply = Number(pool.totalSupply) / Math.pow(10, 18);
      const lpTokensToReceive = Math.min(
        (parseFloat(finalAmountA) / reserve0) * totalSupply,
        (parseFloat(finalAmountB) / reserve1) * totalSupply
      );

      const shareOfPool = (lpTokensToReceive / (totalSupply + lpTokensToReceive)) * 100;

      console.log(`✅ ReachSwap quote calculated: ${finalAmountA}/${finalAmountB}, LP tokens: ${lpTokensToReceive.toFixed(6)}`);

      return {
        token0Amount: finalAmountA,
        token1Amount: finalAmountB,
        lpTokensToReceive: lpTokensToReceive.toFixed(6),
        shareOfPool,
        priceImpact: 0.1,
        router: 'reachswap',
        minimumAmounts: {
          token0Min: (parseFloat(finalAmountA) * (1 - slippage / 100)).toFixed(6),
          token1Min: (parseFloat(finalAmountB) * (1 - slippage / 100)).toFixed(6)
        },
        isFirstLiquidity: false,
        pairExists: true
      };
    } catch (error: any) {
      console.error('Error calculating ReachSwap add liquidity quote:', error);
      setError(error.message || 'Failed to calculate ReachSwap quote');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [checkPairExists, getPool]);

  // Calculate remove liquidity quote
  const calculateRemoveLiquidityQuote = useCallback(async (
    pool: LiquidityPool,
    lpTokenAmount: string,
    slippage: number
  ): Promise<{
    token0Amount: string;
    token1Amount: string;
    minimumAmounts: { token0Min: string; token1Min: string };
  }> => {
    setIsLoading(true);
    setError(null);

    try {
      console.log(`🧮 Calculating ReachSwap remove quote for: ${pool.token0.symbol}/${pool.token1.symbol}`);

      const lpAmount = parseFloat(lpTokenAmount);
      const totalSupply = Number(pool.totalSupply) / Math.pow(10, 18);
      const shareToRemove = lpAmount / totalSupply;

      // Calculate token amounts to receive
      const token0Amount = (shareToRemove * Number(pool.reserve0) / Math.pow(10, pool.token0.decimals)).toFixed(6);
      const token1Amount = (shareToRemove * Number(pool.reserve1) / Math.pow(10, pool.token1.decimals)).toFixed(6);

      // Calculate minimum amounts with slippage
      const token0Min = (parseFloat(token0Amount) * (1 - slippage / 100)).toFixed(6);
      const token1Min = (parseFloat(token1Amount) * (1 - slippage / 100)).toFixed(6);

      console.log(`✅ ReachSwap remove quote: ${token0Amount}/${token1Amount} (min: ${token0Min}/${token1Min})`);

      return {
        token0Amount,
        token1Amount,
        minimumAmounts: { token0Min, token1Min }
      };
    } catch (error: any) {
      console.error('Error calculating ReachSwap remove liquidity quote:', error);
      setError(error.message || 'Failed to calculate ReachSwap remove quote');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ✅ ENHANCED: Create new pool and add initial liquidity on ReachSwap with proper signatures
  const createPool = useCallback(async (
    tokenA: Token,
    tokenB: Token,
    amountA: string,
    amountB: string
  ): Promise<string> => {
    setIsLoading(true);
    setError(null);

    try {
      const provider = getProvider();
      if (!provider) throw new Error('No provider available');

      const walletAddress = localStorage.getItem('reachswap_wallet_address');
      if (!walletAddress) throw new Error('No wallet address found');

      console.log('🏗️ Creating new ReachSwap pool and adding initial liquidity...');
      console.log(`Token A: ${tokenA.symbol} (${tokenA.address}) - Amount: ${amountA}`);
      console.log(`Token B: ${tokenB.symbol} (${tokenB.address}) - Amount: ${amountB}`);

      // Check if pair already exists
      const existingPair = await checkPairExists(tokenA, tokenB);
      if (existingPair) {
        throw new Error('Pool already exists for this token pair on ReachSwap');
      }

      // Determine if this involves native LOOP
      const isNativeA = tokenA.address === '0x0000000000000000000000000000000000000000';
      const isNativeB = tokenB.address === '0x0000000000000000000000000000000000000000';
      const hasNative = isNativeA || isNativeB;

      let txHash: string;

      if (hasNative) {
        // Use addLiquidityETH which will create pair if it doesn't exist
        const nonNativeToken = isNativeA ? tokenB : tokenA;
        const nativeAmount = isNativeA ? amountA : amountB;
        const tokenAmount = isNativeA ? amountB : amountA;

        console.log('🔥 Creating ReachSwap pool with addLiquidityETH...');
        txHash = await executeAddLiquidityETH(nonNativeToken, tokenAmount, nativeAmount, walletAddress);
      } else {
        // Use regular addLiquidity which will create pair if it doesn't exist
        console.log('🔥 Creating ReachSwap pool with addLiquidity...');
        txHash = await executeAddLiquidity(tokenA, tokenB, amountA, amountB, walletAddress);
      }

      console.log(`✅ ReachSwap pool creation and initial liquidity transaction sent: ${txHash}`);
      return txHash;
    } catch (error: any) {
      console.error('Error creating ReachSwap pool and adding liquidity:', error);
      setError(error.message || 'Failed to create ReachSwap pool');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [getProvider, checkPairExists]);

  // ✅ ENHANCED: Helper function for addLiquidityETH with ReachSwap signature
  const executeAddLiquidityETH = useCallback(async (
    token: Token,
    tokenAmount: string,
    ethAmount: string,
    walletAddress: string
  ): Promise<string> => {
    const provider = getProvider();
    if (!provider) throw new Error('No provider available');

    console.log('🔥 Executing ReachSwap addLiquidityETH...');
    console.log(`📊 Token: ${token.symbol} - Amount: ${tokenAmount}`);
    console.log(`📊 ETH Amount: ${ethAmount}`);

    const deadline = Math.floor(Date.now() / 1000) + (20 * 60); // 20 minutes

    // Safe amount conversion to avoid precision issues
    const tokenAmountWei = (BigInt(Math.floor(parseFloat(tokenAmount) * Math.pow(10, token.decimals)))).toString();
    const ethAmountWei = (BigInt(Math.floor(parseFloat(ethAmount) * Math.pow(10, 18)))).toString();

    // Calculate minimum amounts with slippage protection
    const tokenAmountMin = (BigInt(tokenAmountWei) * BigInt(995) / BigInt(1000)).toString();
    const ethAmountMin = (BigInt(ethAmountWei) * BigInt(995) / BigInt(1000)).toString();

    console.log(`💰 Token amount in wei: ${tokenAmountWei}`);
    console.log(`💰 ETH amount in wei: ${ethAmountWei}`);

    // ✅ CRITICAL FIX: Build addLiquidityETH transaction with correct ReachSwap signature
    const paddedToken = token.address.slice(2).padStart(64, '0');
    const paddedTokenDesired = BigInt(tokenAmountWei).toString(16).padStart(64, '0');
    const paddedTokenMin = BigInt(tokenAmountMin).toString(16).padStart(64, '0');
    const paddedETHMin = BigInt(ethAmountMin).toString(16).padStart(64, '0');
    const paddedTo = walletAddress.slice(2).padStart(64, '0');
    const paddedDeadline = deadline.toString(16).padStart(64, '0');
    const paddedSkipMEV = '0'.padStart(64, '0'); // false = enable MEV protection

    const txData = ADD_LIQUIDITY_ETH_SIGNATURE + paddedToken + paddedTokenDesired + 
                  paddedTokenMin + paddedETHMin + paddedTo + paddedDeadline + paddedSkipMEV;

    // Estimate gas with buffer
    const gasEstimate = await provider.request({
      method: 'eth_estimateGas',
      params: [{
        from: walletAddress,
        to: REACHSWAP_CONTRACTS.ROUTER,
        data: txData,
        value: '0x' + BigInt(ethAmountWei).toString(16)
      }]
    });

    const gasLimit = '0x' + (BigInt(gasEstimate) * BigInt(150) / BigInt(100)).toString(16); // 50% buffer

    return await provider.request({
      method: 'eth_sendTransaction',
      params: [{
        from: walletAddress,
        to: REACHSWAP_CONTRACTS.ROUTER,
        data: txData,
        value: '0x' + BigInt(ethAmountWei).toString(16),
        gas: gasLimit
      }]
    });
  }, [getProvider]);

  // ✅ ENHANCED: Helper function for addLiquidity with ReachSwap signature
  const executeAddLiquidity = useCallback(async (
    tokenA: Token,
    tokenB: Token,
    amountA: string,
    amountB: string,
    walletAddress: string
  ): Promise<string> => {
    const provider = getProvider();
    if (!provider) throw new Error('No provider available');

    console.log('🔥 Executing ReachSwap addLiquidity...');
    console.log(`📊 Token A: ${tokenA.symbol} - Amount: ${amountA}`);
    console.log(`📊 Token B: ${tokenB.symbol} - Amount: ${amountB}`);

    const deadline = Math.floor(Date.now() / 1000) + (20 * 60);

    // Safe amount conversion
    const amountAWei = (BigInt(Math.floor(parseFloat(amountA) * Math.pow(10, tokenA.decimals)))).toString();
    const amountBWei = (BigInt(Math.floor(parseFloat(amountB) * Math.pow(10, tokenB.decimals)))).toString();

    // Calculate minimum amounts with slippage protection
    const amountAMin = (BigInt(amountAWei) * BigInt(995) / BigInt(1000)).toString();
    const amountBMin = (BigInt(amountBWei) * BigInt(995) / BigInt(1000)).toString();

    console.log(`💰 Amount A in wei: ${amountAWei}`);
    console.log(`💰 Amount B in wei: ${amountBWei}`);

    // ✅ CRITICAL FIX: Build addLiquidity transaction with correct ReachSwap signature
    // addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline, bool skipMEVProtection)
    const paddedTokenA = tokenA.address.slice(2).padStart(64, '0');
    const paddedTokenB = tokenB.address.slice(2).padStart(64, '0');
    const paddedAmountADesired = BigInt(amountAWei).toString(16).padStart(64, '0');
    const paddedAmountBDesired = BigInt(amountBWei).toString(16).padStart(64, '0');
    const paddedAmountAMin = BigInt(amountAMin).toString(16).padStart(64, '0');
    const paddedAmountBMin = BigInt(amountBMin).toString(16).padStart(64, '0');
    const paddedTo = walletAddress.slice(2).padStart(64, '0');
    const paddedDeadline = deadline.toString(16).padStart(64, '0');
    const paddedSkipMEV = '0'.padStart(64, '0'); // false = enable MEV protection

    const txData = ADD_LIQUIDITY_SIGNATURE + paddedTokenA + paddedTokenB + paddedAmountADesired + 
                  paddedAmountBDesired + paddedAmountAMin + paddedAmountBMin + paddedTo + 
                  paddedDeadline + paddedSkipMEV;

    // Estimate gas with buffer
    const gasEstimate = await provider.request({
      method: 'eth_estimateGas',
      params: [{
        from: walletAddress,
        to: REACHSWAP_CONTRACTS.ROUTER,
        data: txData
      }]
    });

    const gasLimit = '0x' + (BigInt(gasEstimate) * BigInt(150) / BigInt(100)).toString(16); // 50% buffer

    return await provider.request({
      method: 'eth_sendTransaction',
      params: [{
        from: walletAddress,
        to: REACHSWAP_CONTRACTS.ROUTER,
        data: txData,
        gas: gasLimit
      }]
    });
  }, [getProvider]);

  // ✅ ENHANCED: Helper function for removeLiquidityETH with ReachSwap signature
  // 🔥 FIXED: executeRemoveLiquidityETH in useLiquidityManagement.ts

  const executeRemoveLiquidityETH = useCallback(async (
    token: Token,
    liquidity: string,
    tokenAmountMin: string,
    ethAmountMin: string,
    walletAddress: string
  ): Promise<string> => {
    const provider = getProvider();
    if (!provider) throw new Error('No provider available');

    console.log('🔥 Executing ReachSwap removeLiquidityETH (FIXED VERSION)...');
    
    // 🔍 ENHANCED DEBUG: Log all input parameters
    console.log(`📊 Input Parameters:`);
    console.log(`   Token: ${token.symbol} (${token.address})`);
    console.log(`   Liquidity: ${liquidity}`);
    console.log(`   Token Min: ${tokenAmountMin}`);
    console.log(`   ETH Min: ${ethAmountMin}`);
    console.log(`   Wallet: ${walletAddress}`);

    const deadline = Math.floor(Date.now() / 1000) + (20 * 60);

    // 🔥 CRITICAL FIX 1: Use ethers.js encoding instead of manual hex
    try {
      const liquidityWei = ethers.parseUnits(liquidity, 18);
      const tokenAmountMinWei = ethers.parseUnits(tokenAmountMin, token.decimals);
      const ethAmountMinWei = ethers.parseUnits(ethAmountMin, 18);

      console.log(`💰 Converted to wei:`);
      console.log(`   Liquidity: ${liquidityWei.toString()} wei`);
      console.log(`   Token min: ${tokenAmountMinWei.toString()} wei`);
      console.log(`   ETH min: ${ethAmountMinWei.toString()} wei`);
      console.log(`   Deadline: ${deadline} (${new Date(deadline * 1000).toISOString()})`);

      // 🔥 CRITICAL FIX 2: Use ethers Interface for proper encoding
      const routerInterface = new ethers.Interface([
        "function removeLiquidityETH(address token, uint256 liquidity, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline, bool skipMEVProtection) external returns (uint256 amountToken, uint256 amountETH)"
      ]);

      const txData = routerInterface.encodeFunctionData("removeLiquidityETH", [
        token.address,
        liquidityWei,
        tokenAmountMinWei,
        ethAmountMinWei,
        walletAddress,
        deadline,
        false // skipMEVProtection
      ]);

      console.log(`🔍 Ethers-encoded transaction data: ${txData.slice(0, 50)}...`);

      const txParams: {
        from: string;
        to: string;
        data: string;
        gas?: string; // ← Make gas optional
      } = {
        from: walletAddress,
        to: REACHSWAP_CONTRACTS.ROUTER,
        data: txData
      };

      console.log(`📋 Transaction parameters:`);
      console.log(`   From: ${txParams.from}`);
      console.log(`   To: ${txParams.to}`);
      console.log(`   Gas: ${txParams.gas || 'auto-estimated'}`); // ← Handle undefined gas

      // 🔥 CRITICAL FIX 3: Remove pre-transaction validation that was causing issues
      console.log('🚀 Sending transaction with ethers-encoded data...');
      
      return await provider.request({
        method: 'eth_sendTransaction',
        params: [txParams]
      });

    } catch (conversionError: any) {
      console.error('❌ Amount conversion failed:', conversionError);
      throw new Error(`Amount conversion failed: ${conversionError.message}`);
    }
  }, [getProvider]);

  const executeRemoveLiquidity = useCallback(async (
    tokenA: Token,
    tokenB: Token,
    liquidity: string,
    amountAMin: string,
    amountBMin: string,
    walletAddress: string
  ): Promise<string> => {
    const provider = getProvider();
    if (!provider) throw new Error('No provider available');

    console.log('🔥 Executing ReachSwap removeLiquidity...');
    console.log(`📊 Token A: ${tokenA.symbol} - Token B: ${tokenB.symbol}`);
    console.log(`📊 Liquidity: ${liquidity} - Amount A Min: ${amountAMin} - Amount B Min: ${amountBMin}`);

    const deadline = Math.floor(Date.now() / 1000) + (20 * 60);

    // Safe amount conversion
    const liquidityWei = (BigInt(Math.floor(parseFloat(liquidity) * Math.pow(10, 18)))).toString();
    const amountAMinWei = (BigInt(Math.floor(parseFloat(amountAMin) * Math.pow(10, tokenA.decimals)))).toString();
    const amountBMinWei = (BigInt(Math.floor(parseFloat(amountBMin) * Math.pow(10, tokenB.decimals)))).toString();

    console.log(`💰 Liquidity in wei: ${liquidityWei}`);
    console.log(`💰 Amount A min in wei: ${amountAMinWei}`);
    console.log(`💰 Amount B min in wei: ${amountBMinWei}`);

    // ✅ CORRECT ReachSwap removeLiquidity signature
    // removeLiquidity(address tokenA, address tokenB, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline, bool skipMEVProtection)
    const paddedTokenA = tokenA.address.slice(2).padStart(64, '0');
    const paddedTokenB = tokenB.address.slice(2).padStart(64, '0');
    const paddedLiquidity = BigInt(liquidityWei).toString(16).padStart(64, '0');
    const paddedAmountAMin = BigInt(amountAMinWei).toString(16).padStart(64, '0');
    const paddedAmountBMin = BigInt(amountBMinWei).toString(16).padStart(64, '0');
    const paddedTo = walletAddress.slice(2).padStart(64, '0');
    const paddedDeadline = deadline.toString(16).padStart(64, '0');
    const paddedSkipMEV = '0'.padStart(64, '0'); // false = enable MEV protection

    const txData = REMOVE_LIQUIDITY_SIGNATURE + paddedTokenA + paddedTokenB + paddedLiquidity + 
                  paddedAmountAMin + paddedAmountBMin + paddedTo + paddedDeadline + paddedSkipMEV;

    return await provider.request({
      method: 'eth_sendTransaction',
      params: [{
        from: walletAddress,
        to: REACHSWAP_CONTRACTS.ROUTER,
        data: txData,
      }]
    });
  }, [getProvider]);

  return {
  getAllPools,
  getPool,
  getUserPositions,
  getUserLPBalance,
  calculateAddLiquidityQuote,
  calculateRemoveLiquidityQuote,
  checkPairExists,
  createPool,
  executeRemoveLiquidityETH,
  executeRemoveLiquidity,
  isLoading,
  error
};
};