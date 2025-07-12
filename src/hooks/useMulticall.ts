import { useCallback } from 'react';

interface MulticallRequest {
  target: string;
  callData: string;
}

interface MulticallResult {
  success: boolean;
  returnData: string;
}

interface UseMulticallReturn {
  multicall: (calls: MulticallRequest[]) => Promise<MulticallResult[]>;
  batchTokenBalances: (tokenAddresses: string[], userAddress: string) => Promise<{ [address: string]: string }>;
  batchTokenMetadata: (tokenAddresses: string[]) => Promise<{ [address: string]: { symbol: string; decimals: number; name: string } }>;
}

export const useMulticall = (): UseMulticallReturn => {
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

  // Execute multiple calls in parallel (simulated multicall)
  const multicall = useCallback(async (calls: MulticallRequest[]): Promise<MulticallResult[]> => {
    try {
      const provider = getProvider();
      if (!provider) {
        throw new Error('No provider available');
      }

      // Execute all calls in parallel
      const results = await Promise.allSettled(
        calls.map(async (call) => {
          try {
            const result = await provider.request({
              method: 'eth_call',
              params: [{
                to: call.target,
                data: call.callData
              }, 'latest']
            });
            
            return {
              success: true,
              returnData: result || '0x'
            };
          } catch (error) {
            console.warn(`Multicall failed for ${call.target}:`, error);
            return {
              success: false,
              returnData: '0x'
            };
          }
        })
      );

      return results.map(result => 
        result.status === 'fulfilled' 
          ? result.value 
          : { success: false, returnData: '0x' }
      );
    } catch (error) {
      console.error('Multicall batch failed:', error);
      return calls.map(() => ({ success: false, returnData: '0x' }));
    }
  }, [getProvider]);

  // Batch token balance calls
  const batchTokenBalances = useCallback(async (
    tokenAddresses: string[], 
    userAddress: string
  ): Promise<{ [address: string]: string }> => {
    try {
      const balanceOfSignature = '0x70a08231'; // balanceOf(address)
      const paddedUserAddress = userAddress.slice(2).padStart(64, '0');
      
      const calls: MulticallRequest[] = tokenAddresses.map(tokenAddress => ({
        target: tokenAddress,
        callData: balanceOfSignature + paddedUserAddress
      }));

      const results = await multicall(calls);
      const balances: { [address: string]: string } = {};

      results.forEach((result, index) => {
        const tokenAddress = tokenAddresses[index];
        if (result.success && result.returnData !== '0x') {
          try {
            const balance = BigInt(result.returnData);
            balances[tokenAddress] = balance.toString();
          } catch (error) {
            balances[tokenAddress] = '0';
          }
        } else {
          balances[tokenAddress] = '0';
        }
      });

      return balances;
    } catch (error) {
      console.error('Batch token balances failed:', error);
      return {};
    }
  }, [multicall]);

  // Batch token metadata calls
  const batchTokenMetadata = useCallback(async (
    tokenAddresses: string[]
  ): Promise<{ [address: string]: { symbol: string; decimals: number; name: string } }> => {
    try {
      const symbolSignature = '0x95d89b41'; // symbol()
      const decimalsSignature = '0x313ce567'; // decimals()
      const nameSignature = '0x06fdde03'; // name()

      const calls: MulticallRequest[] = [];
      
      // Add calls for each token (symbol, decimals, name)
      tokenAddresses.forEach(tokenAddress => {
        calls.push(
          { target: tokenAddress, callData: symbolSignature },
          { target: tokenAddress, callData: decimalsSignature },
          { target: tokenAddress, callData: nameSignature }
        );
      });

      const results = await multicall(calls);
      const metadata: { [address: string]: { symbol: string; decimals: number; name: string } } = {};

      // Process results in groups of 3 (symbol, decimals, name)
      for (let i = 0; i < tokenAddresses.length; i++) {
        const tokenAddress = tokenAddresses[i];
        const symbolResult = results[i * 3];
        const decimalsResult = results[i * 3 + 1];
        const nameResult = results[i * 3 + 2];

        let symbol = `TOKEN_${tokenAddress.slice(-4).toUpperCase()}`;
        let decimals = 18;
        let name = 'Unknown Token';

        // Decode symbol
        if (symbolResult.success && symbolResult.returnData !== '0x') {
          try {
            symbol = decodeString(symbolResult.returnData) || symbol;
          } catch (e) {
            // Keep default
          }
        }

        // Decode decimals
        if (decimalsResult.success && decimalsResult.returnData !== '0x') {
          try {
            decimals = parseInt(decimalsResult.returnData, 16);
            if (isNaN(decimals) || decimals < 0 || decimals > 77) {
              decimals = 18;
            }
          } catch (e) {
            decimals = 18;
          }
        }

        // Decode name
        if (nameResult.success && nameResult.returnData !== '0x') {
          try {
            name = decodeString(nameResult.returnData) || name;
          } catch (e) {
            // Keep default
          }
        }

        metadata[tokenAddress] = { symbol, decimals, name };
      }

      return metadata;
    } catch (error) {
      console.error('Batch token metadata failed:', error);
      return {};
    }
  }, [multicall]);

  // Helper function to decode string from hex
  const decodeString = (hexData: string): string => {
    if (!hexData || hexData === '0x') return '';
    
    try {
      const data = hexData.slice(2);
      
      // For simple string returns
      if (data.length <= 64) {
        let result = '';
        for (let i = 0; i < data.length; i += 2) {
          const byte = parseInt(data.substr(i, 2), 16);
          if (byte !== 0) {
            result += String.fromCharCode(byte);
          }
        }
        return result.replace(/\0/g, '').trim();
      }
      
      // For ABI-encoded strings
      if (data.length > 128) {
        const lengthHex = data.slice(64, 128);
        const length = parseInt(lengthHex, 16);
        
        if (length > 0 && length <= 100) {
          const stringHex = data.slice(128, 128 + (length * 2));
          let result = '';
          for (let i = 0; i < stringHex.length; i += 2) {
            const byte = parseInt(stringHex.substr(i, 2), 16);
            if (byte !== 0) {
              result += String.fromCharCode(byte);
            }
          }
          return result.replace(/\0/g, '').trim();
        }
      }
      
      return '';
    } catch (error) {
      return '';
    }
  };

  return {
    multicall,
    batchTokenBalances,
    batchTokenMetadata
  };
};