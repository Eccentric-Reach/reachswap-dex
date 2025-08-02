import { useState, useCallback } from 'react';
import { KNOWN_FEE_TOKENS, ERC20_ABI } from '../constants/sphynx';

interface TokenFeeInfo {
  address: string;
  hasTransferFee: boolean;
  buyFee?: number;
  sellFee?: number;
  isReflection?: boolean;
  isDeflationary?: boolean;
  requiresSpecialHandling?: boolean;
}

interface UseTokenFeeDetectionReturn {
  detectTokenFees: (tokenAddress: string) => Promise<TokenFeeInfo>;
  hasTransferFee: (tokenAddress: string) => Promise<boolean>;
  isDetecting: boolean;
  detectionCache: { [address: string]: TokenFeeInfo };
}

export const useTokenFeeDetection = (): UseTokenFeeDetectionReturn => {
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionCache, setDetectionCache] = useState<{ [address: string]: TokenFeeInfo }>({});

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

  // Enhanced runtime fee detection using multiple methods
  const detectFeeFunctions = useCallback(async (tokenAddress: string): Promise<boolean> => {
    try {
      const provider = getProvider();
      if (!provider) return false;

      // Common fee function signatures found on LOOP network tokens
      const feeFunctionSignatures = [
        '0x83e3bdb4', // _taxFee()
        '0x28c61f41', // _liquidityFee() 
        '0x4549b039', // _burnFee()
        '0x5342acb4', // isExcludedFromFee(address)
        '0x437823ec', // _isExcluded(address)
        '0x88f82020', // _rOwned(address) - reflection token
        '0x70a08231', // balanceOf(address) - will be used for simulation
        '0xa9059cbb', // transfer(address,uint256) - for simulation
      ];

      // Try calling fee-related functions
      for (const signature of feeFunctionSignatures.slice(0, 6)) { // Skip transfer functions
        try {
          const result = await provider.request({
            method: 'eth_call',
            params: [{
              to: tokenAddress,
              data: signature
            }, 'latest']
          });
          
          if (result && result !== '0x' && result !== '0x0') {
            // If function exists and returns non-zero, likely has fees
            const value = parseInt(result, 16);
            if (value > 0) {
              console.log(`🔍 Fee function detected for ${tokenAddress}: ${signature} = ${value}`);
              return true;
            }
          }
        } catch (error) {
          // Function doesn't exist, continue checking
          continue;
        }
      }

      return false;
    } catch (error) {
      console.error('Error checking fee functions:', error);
      return false;
    }
  }, [getProvider]);

  // Simulate transfer to detect fee behavior (most reliable method)
  const simulateTransferFee = useCallback(async (tokenAddress: string): Promise<{ hasFee: boolean; feePercentage: number }> => {
    try {
      const provider = getProvider();
      if (!provider) return { hasFee: false, feePercentage: 0 };

      const walletAddress = localStorage.getItem('reachswap_wallet_address');
      if (!walletAddress) return { hasFee: false, feePercentage: 0 };

      // Get token decimals first
      const decimalsSignature = '0x313ce567'; // decimals()
      let decimals = 18;
      
      try {
        const decimalsResult = await provider.request({
          method: 'eth_call',
          params: [{ to: tokenAddress, data: decimalsSignature }, 'latest']
        });
        if (decimalsResult && decimalsResult !== '0x') {
          decimals = parseInt(decimalsResult, 16);
        }
      } catch (e) {
        // Use default 18 decimals
      }

      // Check current balance
      const balanceOfSignature = '0x70a08231'; // balanceOf(address)
      const paddedAddress = walletAddress.slice(2).padStart(64, '0');
      const balanceData = balanceOfSignature + paddedAddress;

      const balanceResult = await provider.request({
        method: 'eth_call',
        params: [{ to: tokenAddress, data: balanceData }, 'latest']
      });

      if (!balanceResult || balanceResult === '0x' || balanceResult === '0x0') {
        // No balance to test with, use heuristic detection
        return await detectByHeuristics(tokenAddress);
      }

      const currentBalance = BigInt(balanceResult);
      if (currentBalance === BigInt(0)) {
        return await detectByHeuristics(tokenAddress);
      }

      // Use a small test amount (1% of balance or 1 token, whichever is smaller)
      const oneToken = BigInt(10 ** decimals);
      const onePercentBalance = currentBalance / BigInt(100);
      const testAmount = onePercentBalance < oneToken ? onePercentBalance : oneToken;

      if (testAmount === BigInt(0)) {
        return await detectByHeuristics(tokenAddress);
      }

      // Simulate transfer to self
      const transferSignature = '0xa9059cbb'; // transfer(address,uint256)
      const paddedTo = walletAddress.slice(2).padStart(64, '0');
      const paddedAmount = testAmount.toString(16).padStart(64, '0');
      const transferData = transferSignature + paddedTo + paddedAmount;

      try {
        // Use eth_call to simulate the transfer
        await provider.request({
          method: 'eth_call',
          params: [{
            from: walletAddress,
            to: tokenAddress,
            data: transferData
          }, 'latest']
        });

        // If simulation succeeds, check if it would result in expected balance
        // This is a simplified check - in reality, we'd need to compare before/after
        // For now, we'll use other detection methods
        return await detectByHeuristics(tokenAddress);

      } catch (error: any) {
        // If transfer simulation fails, it might indicate fee-on-transfer behavior
        if (error.message && (
          error.message.includes('transfer amount exceeds balance') ||
          error.message.includes('insufficient balance') ||
          error.message.includes('fee') ||
          error.message.includes('tax')
        )) {
          console.log(`🔍 Transfer simulation suggests fee token: ${tokenAddress}`);
          return { hasFee: true, feePercentage: 0.05 }; // Assume 5% fee
        }
        
        return await detectByHeuristics(tokenAddress);
      }
    } catch (error) {
      console.error('Error simulating transfer fee:', error);
      return { hasFee: false, feePercentage: 0 };
    }
  }, [getProvider]);

  // Heuristic detection based on token name/symbol patterns
  const detectByHeuristics = useCallback(async (tokenAddress: string): Promise<{ hasFee: boolean; feePercentage: number }> => {
    try {
      const provider = getProvider();
      if (!provider) return { hasFee: false, feePercentage: 0 };

      const nameSignature = '0x06fdde03'; // name()
      const symbolSignature = '0x95d89b41'; // symbol()
      
      const [nameResult, symbolResult] = await Promise.all([
        provider.request({
          method: 'eth_call',
          params: [{ to: tokenAddress, data: nameSignature }, 'latest']
        }).catch(() => '0x'),
        provider.request({
          method: 'eth_call',
          params: [{ to: tokenAddress, data: symbolSignature }, 'latest']
        }).catch(() => '0x')
      ]);

      // Decode name and symbol
      let name = '';
      let symbol = '';
      
      if (nameResult && nameResult !== '0x') {
        try {
          const nameHex = nameResult.slice(2);
          if (nameHex.length > 128) {
            const lengthHex = nameHex.slice(64, 128);
            const length = parseInt(lengthHex, 16);
            if (length > 0 && length <= 100) {
              const stringHex = nameHex.slice(128, 128 + (length * 2));
              name = Buffer.from(stringHex, 'hex').toString('utf8').replace(/\0/g, '');
            }
          }
        } catch (e) {
          // Fallback decoding
          try {
            name = Buffer.from(nameResult.slice(2), 'hex').toString('utf8').replace(/\0/g, '');
          } catch (e2) {
            // Silent fail
          }
        }
      }

      if (symbolResult && symbolResult !== '0x') {
        try {
          const symbolHex = symbolResult.slice(2);
          if (symbolHex.length > 128) {
            const lengthHex = symbolHex.slice(64, 128);
            const length = parseInt(lengthHex, 16);
            if (length > 0 && length <= 20) {
              const stringHex = symbolHex.slice(128, 128 + (length * 2));
              symbol = Buffer.from(stringHex, 'hex').toString('utf8').replace(/\0/g, '');
            }
          }
        } catch (e) {
          // Fallback decoding
          try {
            symbol = Buffer.from(symbolResult.slice(2), 'hex').toString('utf8').replace(/\0/g, '');
          } catch (e2) {
            // Silent fail
          }
        }
      }

      // Check for fee-related keywords in name/symbol
      const feeKeywords = [
        'tax', 'fee', 'burn', 'reflect', 'safe', 'moon', 'doge', 'shib', 'inu',
        'baby', 'mini', 'micro', 'deflationary', 'reward', 'dividend', 'auto',
        'liquidity', 'buyback', 'redistribution', 'holder'
      ];
      
      const nameSymbolText = (name + ' ' + symbol).toLowerCase();
      const hasHighRiskKeywords = feeKeywords.some(keyword => nameSymbolText.includes(keyword));
      
      // Additional patterns that suggest fee tokens
      const suspiciousPatterns = [
        /\d+%/, // Contains percentage
        /v\d+/, // Version numbers (common in meme tokens)
        /2\.0|3\.0/, // Version indicators
        /inu|doge|shib|safe|moon/i, // Common meme token patterns
      ];
      
      const hasSuspiciousPatterns = suspiciousPatterns.some(pattern => pattern.test(nameSymbolText));
      
      if (hasHighRiskKeywords || hasSuspiciousPatterns) {
        console.log(`🔍 Heuristic detection suggests fee token: ${symbol} (${name})`);
        return { hasFee: true, feePercentage: 0.05 }; // Assume 5% fee
      }

      // For LOOP network, assume most custom tokens have some form of fee
      // This is a conservative approach based on the network's characteristics
      if (tokenAddress.toLowerCase() !== '0x0000000000000000000000000000000000000000' &&
          tokenAddress.toLowerCase() !== '0x3936d20a39ed4b0d44eabfc91757b182f14a38d5') { // Not LOOP or wLOOP
        console.log(`🔍 Conservative detection: Assuming fee token for custom token: ${symbol}`);
        return { hasFee: true, feePercentage: 0.03 }; // Assume 3% fee for unknown tokens
      }

      return { hasFee: false, feePercentage: 0 };
    } catch (error) {
      console.error('Error in heuristic detection:', error);
      // Conservative fallback: assume fee for unknown tokens
      return { hasFee: true, feePercentage: 0.05 };
    }
  }, [getProvider]);

  // Main fee detection function with comprehensive approach
  const detectTokenFees = useCallback(async (tokenAddress: string): Promise<TokenFeeInfo> => {
    const normalizedAddress = tokenAddress.toLowerCase();
    
    // Check cache first
    if (detectionCache[normalizedAddress]) {
      return detectionCache[normalizedAddress];
    }

    // Native LOOP has no fees
    if (normalizedAddress === '0x0000000000000000000000000000000000000000') {
      const result: TokenFeeInfo = {
        address: normalizedAddress,
        hasTransferFee: false,
        buyFee: 0,
        sellFee: 0,
        isReflection: false,
        isDeflationary: false,
        requiresSpecialHandling: false
      };
      
      setDetectionCache(prev => ({ ...prev, [normalizedAddress]: result }));
      return result;
    }

    // wLOOP typically has no fees
    if (normalizedAddress === '0x3936d20a39ed4b0d44eabfc91757b182f14a38d5') {
      const result: TokenFeeInfo = {
        address: normalizedAddress,
        hasTransferFee: false,
        buyFee: 0,
        sellFee: 0,
        isReflection: false,
        isDeflationary: false,
        requiresSpecialHandling: false
      };
      
      setDetectionCache(prev => ({ ...prev, [normalizedAddress]: result }));
      return result;
    }

    setIsDetecting(true);

    try {
      // Check known fee tokens first
      const knownFeeToken = KNOWN_FEE_TOKENS[normalizedAddress];
      if (knownFeeToken) {
        const result: TokenFeeInfo = {
          address: normalizedAddress,
          hasTransferFee: true,
          buyFee: knownFeeToken.buyFee,
          sellFee: knownFeeToken.sellFee,
          isReflection: knownFeeToken.isReflection,
          isDeflationary: false,
          requiresSpecialHandling: true
        };
        
        setDetectionCache(prev => ({ ...prev, [normalizedAddress]: result }));
        console.log(`✅ Known fee token detected: ${normalizedAddress}`, result);
        return result;
      }

      // Run multiple detection methods in parallel
      const [hasFeeFunctions, simulationResult] = await Promise.all([
        detectFeeFunctions(normalizedAddress),
        simulateTransferFee(normalizedAddress)
      ]);

      const hasTransferFee = hasFeeFunctions || simulationResult.hasFee;
      const estimatedFee = simulationResult.feePercentage || (hasFeeFunctions ? 0.05 : 0);
      
      const result: TokenFeeInfo = {
        address: normalizedAddress,
        hasTransferFee,
        buyFee: hasTransferFee ? estimatedFee : 0,
        sellFee: hasTransferFee ? estimatedFee : 0,
        isReflection: hasFeeFunctions, // Assume reflection if has fee functions
        isDeflationary: false,
        requiresSpecialHandling: hasTransferFee
      };

      // Cache the result
      setDetectionCache(prev => ({ ...prev, [normalizedAddress]: result }));
      
      if (hasTransferFee) {
        console.log(`⚠️ Fee-on-transfer token detected: ${normalizedAddress}`, result);
      } else {
        console.log(`✅ Regular token (no fees detected): ${normalizedAddress}`);
      }

      return result;
    } catch (error) {
      console.error('Error detecting token fees:', error);
      
      // Conservative fallback: assume fees for unknown tokens on LOOP network
      const result: TokenFeeInfo = {
        address: normalizedAddress,
        hasTransferFee: true, // Conservative approach
        buyFee: 0.03, // 3% default
        sellFee: 0.03,
        isReflection: false,
        isDeflationary: false,
        requiresSpecialHandling: true
      };
      
      setDetectionCache(prev => ({ ...prev, [normalizedAddress]: result }));
      console.log(`⚠️ Error in detection, using conservative fallback: ${normalizedAddress}`);
      return result;
    } finally {
      setIsDetecting(false);
    }
  }, [detectionCache, detectFeeFunctions, simulateTransferFee]);

  // Simple boolean check for transfer fees
  const hasTransferFee = useCallback(async (tokenAddress: string): Promise<boolean> => {
    const feeInfo = await detectTokenFees(tokenAddress);
    return feeInfo.hasTransferFee;
  }, [detectTokenFees]);

  return {
    detectTokenFees,
    hasTransferFee,
    isDetecting,
    detectionCache
  };
};