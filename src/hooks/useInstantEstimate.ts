import { useState, useCallback } from 'react';
import { Token } from '../types';

interface UseInstantEstimateReturn {
  calculateInstantEstimate: (
    tokenIn: Token,
    tokenOut: Token,
    amountIn: string
  ) => string;
  getInstantEstimate: () => string;
  clearEstimate: () => void;
}

export const useInstantEstimate = (): UseInstantEstimateReturn => {
  const [instantEstimate, setInstantEstimate] = useState<string>('');

  const calculateInstantEstimate = useCallback((
    tokenIn: Token,
    tokenOut: Token,
    amountIn: string
  ): string => {
    if (!amountIn || parseFloat(amountIn) <= 0) {
      setInstantEstimate('');
      return '';
    }

    try {
      const inputAmount = parseFloat(amountIn);
      const inputPrice = tokenIn.price || 0;
      const outputPrice = tokenOut.price || 1;
      
      if (inputPrice > 0 && outputPrice > 0) {
        // Simple price-based calculation for instant feedback
        const estimatedOutput = (inputAmount * inputPrice) / outputPrice;
        const withFee = estimatedOutput * 0.997; // Assume 0.3% fee
        const estimate = withFee.toFixed(6);
        setInstantEstimate(estimate);
        return estimate;
      }
      
      // Fallback calculation using 1:1 ratio
      const fallbackEstimate = (inputAmount * 0.997).toFixed(6);
      setInstantEstimate(fallbackEstimate);
      return fallbackEstimate;
    } catch (error) {
      setInstantEstimate('');
      return '';
    }
  }, []);

  const getInstantEstimate = useCallback(() => {
    return instantEstimate;
  }, [instantEstimate]);

  const clearEstimate = useCallback(() => {
    setInstantEstimate('');
  }, []);

  return {
    calculateInstantEstimate,
    getInstantEstimate,
    clearEstimate
  };
};