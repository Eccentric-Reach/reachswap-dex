import { Token } from '../types';

/**
 * Normalizes a token object to ensure all required fields are present
 * and properly formatted for UI rendering
 */
export const normalizeToken = (token: Partial<Token>): Token => {
  // Validate required fields
  if (!token.address || !token.symbol) {
    throw new Error('Token must have address and symbol');
  }

  // Clean and validate symbol
  const cleanSymbol = token.symbol.trim().toUpperCase();
  if (cleanSymbol.length === 0) {
    throw new Error('Token symbol cannot be empty');
  }

  // Clean and validate name
  const cleanName = token.name?.trim() || cleanSymbol;

  // Validate decimals
  const decimals = typeof token.decimals === 'number' && token.decimals >= 0 && token.decimals <= 77 
    ? token.decimals 
    : 18;

  // Ensure logoUrl is a string (empty string triggers fallback rendering)
  const logoUrl = typeof token.logoUrl === 'string' ? token.logoUrl : '';

  return {
    symbol: cleanSymbol,
    name: cleanName,
    address: token.address.toLowerCase(), // Normalize address to lowercase
    decimals,
    logoUrl,
    price: typeof token.price === 'number' && token.price >= 0 ? token.price : 0,
    isImported: Boolean(token.isImported),
    balance: token.balance
  };
};

/**
 * Validates if a token object is safe for UI rendering
 */
export const isValidToken = (token: any): token is Token => {
  try {
    if (!token || typeof token !== 'object') {
      return false;
    }

    // Check required string fields
    if (typeof token.symbol !== 'string' || token.symbol.trim().length === 0) {
      return false;
    }

    if (typeof token.name !== 'string' || token.name.trim().length === 0) {
      return false;
    }

    if (typeof token.address !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(token.address)) {
      return false;
    }

    // Check decimals
    if (typeof token.decimals !== 'number' || token.decimals < 0 || token.decimals > 77) {
      return false;
    }

    // logoUrl should be a string (can be empty)
    if (typeof token.logoUrl !== 'string') {
      return false;
    }

    return true;
  } catch (error) {
    console.warn('Token validation error:', error);
    return false;
  }
};

/**
 * Gets a safe display name for a token
 */
export const getTokenDisplayName = (token: Token | null | undefined): string => {
  if (!token) return 'Select Token';
  
  try {
    // Ensure we have a valid symbol
    if (token.symbol && typeof token.symbol === 'string' && token.symbol.trim().length > 0) {
      return token.symbol.trim();
    }
    
    // Fallback to name if symbol is missing
    if (token.name && typeof token.name === 'string' && token.name.trim().length > 0) {
      return token.name.trim();
    }
    
    // Last resort fallback
    return 'Unknown Token';
  } catch (error) {
    console.warn('Error getting token display name:', error);
    return 'Unknown Token';
  }
};

/**
 * Gets a safe logo URL for a token with fallback
 */
export const getTokenLogoUrl = (token: Token | null | undefined): string => {
  if (!token) {
    return ''; // Return empty string to trigger fallback rendering
  }
  
  try {
    // Return logoUrl if it's a valid string, otherwise empty string for fallback
    return (typeof token.logoUrl === 'string' && token.logoUrl.length > 0) ? token.logoUrl : '';
  } catch (error) {
    console.warn('Error getting token logo URL:', error);
    return '';
  }
};

/**
 * Formats token balance for display
 */
export const formatTokenBalance = (balance: string | number | undefined): string => {
  if (!balance || balance === '0' || balance === 0) {
    return '0.000000';
  }
  
  try {
    const numBalance = typeof balance === 'string' ? parseFloat(balance) : balance;
    
    if (isNaN(numBalance) || numBalance < 0) {
      return '0.000000';
    }
    
    // CRITICAL FIX: Better precision for token balance display
    if (numBalance >= 1000) {
      return numBalance.toFixed(2); // 2 decimals for large amounts
    } else if (numBalance >= 1) {
      return numBalance.toFixed(4); // 4 decimals for medium amounts
    } else {
      return numBalance.toFixed(6); // 6 decimals for small amounts
    }
  } catch (error) {
    console.warn('Error formatting token balance:', error);
    return '0.000000';
  }
};

/**
 * Creates a fallback token object for error cases
 */
export const createFallbackToken = (address: string, symbol?: string): Token => {
  const fallbackSymbol = symbol?.trim() || `TOKEN_${address.slice(-4).toUpperCase()}`;
  
  return {
    symbol: fallbackSymbol,
    name: `${fallbackSymbol} Token`,
    address: address.toLowerCase(),
    decimals: 18,
    logoUrl: '',
    price: 0,
    isImported: true
  };
};

/**
 * Safely extracts token metadata from contract call results
 */
export const extractTokenMetadata = (
  address: string,
  symbolResult?: string,
  nameResult?: string,
  decimalsResult?: string
): Partial<Token> => {
  try {
    // Extract symbol
    let symbol = '';
    if (symbolResult && symbolResult !== '0x' && symbolResult !== '0x0') {
      symbol = decodeContractString(symbolResult);
    }
    
    // Extract name
    let name = '';
    if (nameResult && nameResult !== '0x' && nameResult !== '0x0') {
      name = decodeContractString(nameResult);
    }
    
    // Extract decimals
    let decimals = 18;
    if (decimalsResult && decimalsResult !== '0x' && decimalsResult !== '0x0') {
      const parsed = parseInt(decimalsResult, 16);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 77) {
        decimals = parsed;
      }
    }
    
    // Fallback for missing symbol
    if (!symbol || symbol.length === 0) {
      symbol = `TOKEN_${address.slice(-4).toUpperCase()}`;
    }
    
    // Fallback for missing name
    if (!name || name.length === 0) {
      name = `${symbol} Token`;
    }
    
    return {
      symbol: symbol.substring(0, 20), // Limit symbol length
      name: name.substring(0, 50), // Limit name length
      address: address.toLowerCase(),
      decimals,
      logoUrl: '',
      price: 0,
      isImported: true
    };
  } catch (error) {
    console.warn('Error extracting token metadata:', error);
    return createFallbackToken(address);
  }
};

/**
 * Decodes a string from contract call result
 */
export const decodeContractString = (hexData: string): string => {
  if (!hexData || hexData === '0x' || hexData === '0x0') {
    return '';
  }
  
  try {
    // Remove 0x prefix
    const data = hexData.slice(2);
    
    // For simple string returns (like some tokens), try direct conversion first
    if (data.length <= 64) {
      let result = '';
      for (let i = 0; i < data.length; i += 2) {
        const byte = parseInt(data.substr(i, 2), 16);
        if (byte !== 0) {
          result += String.fromCharCode(byte);
        }
      }
      const cleaned = result.replace(/\0/g, '').trim();
      if (cleaned.length > 0) {
        return cleaned;
      }
    }
    
    // For ABI-encoded strings, skip offset and length info
    if (data.length > 128) {
      const lengthHex = data.slice(64, 128);
      const length = parseInt(lengthHex, 16);
      
      if (length > 0 && length <= 100) { // Reasonable length limit
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
    console.warn('Error decoding contract string:', error);
    return '';
  }
};

/**
 * Validates and normalizes an imported token before adding to the list
 */
export const validateImportedToken = (tokenData: any): Token => {
  if (!tokenData || typeof tokenData !== 'object') {
    throw new Error('Invalid token data');
  }
  
  // Ensure required fields exist
  if (!tokenData.address || typeof tokenData.address !== 'string') {
    throw new Error('Token address is required');
  }
  
  if (!tokenData.symbol || typeof tokenData.symbol !== 'string' || tokenData.symbol.trim().length === 0) {
    throw new Error('Token symbol is required');
  }
  
  // Validate address format
  if (!/^0x[a-fA-F0-9]{40}$/.test(tokenData.address)) {
    throw new Error('Invalid token address format');
  }
  
  try {
    return normalizeToken({
      ...tokenData,
      isImported: true
    });
  } catch (error) {
    throw new Error(`Failed to normalize token: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};