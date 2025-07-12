import { useState, useCallback } from 'react';
import { Token } from '../types';
import { extractTokenMetadata, validateImportedToken } from '../utils/tokenUtils';

interface TokenMetadata {
  symbol: string;
  name: string;
  decimals: number;
  isValid: boolean;
  error?: string;
}

interface UseTokenMetadataReturn {
  fetchTokenMetadata: (address: string) => Promise<TokenMetadata | null>;
  isLoading: boolean;
  error: string | null;
}

export const useTokenMetadata = (): UseTokenMetadataReturn => {
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

  // Validate Ethereum address format
  const isValidAddress = useCallback((address: string): boolean => {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }, []);

  // Call contract function with timeout and error handling
  const callContractFunction = useCallback(async (
    tokenAddress: string,
    functionSignature: string,
    timeoutMs: number = 5000
  ): Promise<string> => {
    const provider = getProvider();
    if (!provider) {
      throw new Error('No wallet provider available');
    }

    // Create a timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Contract call timeout')), timeoutMs);
    });

    // Create the actual call promise
    const callPromise = provider.request({
      method: 'eth_call',
      params: [{
        to: tokenAddress,
        data: functionSignature
      }, 'latest']
    });

    // Race between the call and timeout
    const result = await Promise.race([callPromise, timeoutPromise]);
    return result;
  }, [getProvider]);

  // Fetch token metadata from contract
  const fetchTokenMetadata = useCallback(async (address: string): Promise<TokenMetadata | null> => {
    setIsLoading(true);
    setError(null);

    try {
      // Validate address format
      if (!isValidAddress(address)) {
        throw new Error('Invalid contract address format');
      }

      console.log(`🔍 Fetching metadata for token: ${address}`);

      // ERC-20 function signatures
      const symbolSignature = '0x95d89b41'; // symbol()
      const nameSignature = '0x06fdde03';   // name()
      const decimalsSignature = '0x313ce567'; // decimals()

      // Fetch all metadata with shorter timeout and error handling
      const metadataPromises = [
        callContractFunction(address, symbolSignature, 3000).catch(() => '0x'),
        callContractFunction(address, nameSignature, 3000).catch(() => '0x'),
        callContractFunction(address, decimalsSignature, 3000).catch(() => '0x')
      ];

      const [symbolResult, nameResult, decimalsResult] = await Promise.all(metadataPromises);

      // Extract metadata using utility function
      const tokenData = extractTokenMetadata(address, symbolResult, nameResult, decimalsResult);

      // Validate the extracted data
      try {
        const validatedToken = validateImportedToken(tokenData);
        
        const metadata: TokenMetadata = {
          symbol: validatedToken.symbol,
          name: validatedToken.name,
          decimals: validatedToken.decimals,
          isValid: true
        };

        console.log(`✅ Token metadata fetched successfully:`, metadata);
        return metadata;

      } catch (validationError) {
        console.warn('Token validation failed, using fallback:', validationError);
        
        // Return fallback metadata that's still usable
        return {
          symbol: tokenData.symbol || `TOKEN_${address.slice(-4).toUpperCase()}`,
          name: tokenData.name || 'Unknown Token',
          decimals: tokenData.decimals || 18,
          isValid: false,
          error: 'Token validation failed, using fallback data'
        };
      }

    } catch (error: any) {
      console.error('Error fetching token metadata:', error);
      const errorMessage = error.message || 'Failed to fetch token metadata';
      setError(errorMessage);
      
      // Return fallback metadata instead of null to prevent UI breaks
      return {
        symbol: `TOKEN_${address.slice(-4).toUpperCase()}`,
        name: 'Unknown Token',
        decimals: 18,
        isValid: false,
        error: errorMessage
      };
    } finally {
      setIsLoading(false);
    }
  }, [isValidAddress, callContractFunction]);

  return {
    fetchTokenMetadata,
    isLoading,
    error
  };
};