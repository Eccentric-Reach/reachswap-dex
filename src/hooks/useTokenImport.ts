import { useState, useCallback } from 'react';
import { Token } from '../types';
import { normalizeToken, isValidToken, validateImportedToken } from '../utils/tokenUtils';

interface ImportedToken extends Token {
  isImported: boolean;
  importedAt: number;
}

interface UseTokenImportReturn {
  importedTokens: ImportedToken[];
  importToken: (token: Token | Partial<Token>) => void;
  removeImportedToken: (address: string) => void;
  isTokenImported: (address: string) => boolean;
  clearImportedTokens: () => void;
}

const STORAGE_KEY = 'reachswap_imported_tokens';
const MAX_IMPORTED_TOKENS = 50; // Prevent storage bloat

export const useTokenImport = (): UseTokenImportReturn => {
  // Load imported tokens from localStorage with validation
  const loadImportedTokens = useCallback((): ImportedToken[] => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];

      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) {
        console.warn('Invalid imported tokens format, clearing storage');
        localStorage.removeItem(STORAGE_KEY);
        return [];
      }

      // Validate and normalize each token
      const validTokens: ImportedToken[] = [];
      
      for (const token of parsed) {
        try {
          // Skip if not a valid token object
          if (!isValidToken(token)) {
            console.warn('Invalid imported token found, skipping:', token);
            continue;
          }

          // Normalize the token
          const normalized = normalizeToken(token);
          
          validTokens.push({
            ...normalized,
            isImported: true,
            importedAt: token.importedAt || Date.now()
          });
        } catch (error) {
          console.warn('Error normalizing imported token, skipping:', token, error);
        }
      }

      // Sort by import date (newest first) and limit count
      const sortedTokens = validTokens
        .sort((a, b) => b.importedAt - a.importedAt)
        .slice(0, MAX_IMPORTED_TOKENS);

      // If we had to clean up tokens, save the cleaned list
      if (sortedTokens.length !== parsed.length) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sortedTokens));
      }

      console.log(`📦 Loaded ${sortedTokens.length} imported tokens`);
      return sortedTokens;

    } catch (error) {
      console.error('Error loading imported tokens:', error);
      // Clear corrupted data
      localStorage.removeItem(STORAGE_KEY);
      return [];
    }
  }, []);

  const [importedTokens, setImportedTokens] = useState<ImportedToken[]>(loadImportedTokens);

  // Save imported tokens to localStorage with validation
  const saveImportedTokens = useCallback((tokens: ImportedToken[]) => {
    try {
      // Validate all tokens before saving
      const validTokens = tokens.filter(token => {
        try {
          return isValidToken(token);
        } catch (error) {
          console.warn('Invalid token filtered out during save:', token);
          return false;
        }
      });

      // Limit the number of tokens and sort by import date
      const tokensToSave = validTokens
        .sort((a, b) => b.importedAt - a.importedAt)
        .slice(0, MAX_IMPORTED_TOKENS);

      localStorage.setItem(STORAGE_KEY, JSON.stringify(tokensToSave));
      setImportedTokens(tokensToSave);
      
      console.log(`💾 Saved ${tokensToSave.length} imported tokens`);
    } catch (error) {
      console.error('Error saving imported tokens:', error);
      // Don't update state if save failed
    }
  }, []);

  // Import a new token with comprehensive validation
  const importToken = useCallback((token: Token | Partial<Token>) => {
    try {
      console.log('🔄 Attempting to import token:', token);

      // Validate and normalize the token
      const validatedToken = validateImportedToken(token);
      
      const importedToken: ImportedToken = {
        ...validatedToken,
        isImported: true,
        importedAt: Date.now()
      };

      const currentTokens = loadImportedTokens();
      
      // Check if token already exists (case-insensitive address comparison)
      const existingIndex = currentTokens.findIndex(
        t => t.address.toLowerCase() === importedToken.address.toLowerCase()
      );
      
      let updatedTokens: ImportedToken[];
      
      if (existingIndex >= 0) {
        // Update existing token with new data
        updatedTokens = [...currentTokens];
        updatedTokens[existingIndex] = {
          ...importedToken,
          importedAt: currentTokens[existingIndex].importedAt // Keep original import date
        };
        console.log(`🔄 Updated existing imported token: ${importedToken.symbol}`);
      } else {
        // Add new token to the beginning of the list
        updatedTokens = [importedToken, ...currentTokens];
        console.log(`✅ Added new imported token: ${importedToken.symbol}`);
      }

      saveImportedTokens(updatedTokens);
      
    } catch (error) {
      console.error('Error importing token:', error);
      throw new Error(`Failed to import token: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [loadImportedTokens, saveImportedTokens]);

  // Remove an imported token
  const removeImportedToken = useCallback((address: string) => {
    try {
      const currentTokens = loadImportedTokens();
      const filteredTokens = currentTokens.filter(
        t => t.address.toLowerCase() !== address.toLowerCase()
      );
      
      saveImportedTokens(filteredTokens);
      console.log(`🗑️ Removed imported token: ${address}`);
    } catch (error) {
      console.error('Error removing imported token:', error);
    }
  }, [loadImportedTokens, saveImportedTokens]);

  // Check if a token is imported (case-insensitive)
  const isTokenImported = useCallback((address: string): boolean => {
    try {
      return importedTokens.some(t => t.address.toLowerCase() === address.toLowerCase());
    } catch (error) {
      console.warn('Error checking if token is imported:', error);
      return false;
    }
  }, [importedTokens]);

  // Clear all imported tokens
  const clearImportedTokens = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      setImportedTokens([]);
      console.log('🧹 All imported tokens cleared');
    } catch (error) {
      console.error('Error clearing imported tokens:', error);
    }
  }, []);

  return {
    importedTokens,
    importToken,
    removeImportedToken,
    isTokenImported,
    clearImportedTokens
  };
};