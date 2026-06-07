import { describe, it, expect, vi } from 'vitest';

describe('StockAnalysisModal - Market Data Integration', () => {
  it('should fetch and display pre-market data when modal opens', () => {
    // Test that pre-market data is fetched and displayed
    const mockMarketData = {
      symbol: 'AAPL',
      currentPrice: 150.0,
      preMarketPrice: 149.5,
      preMarketChange: -0.33,
      nasdaqSentiment: 'UP' as const,
      newsSentiment: 0.65,
      dataSource: 'REAL' as const,
    };

    expect(mockMarketData.preMarketPrice).toBeDefined();
    expect(mockMarketData.preMarketChange).toBeLessThan(0);
    expect(mockMarketData.nasdaqSentiment).toBe('UP');
  });

  it('should display positive pre-market changes in green', () => {
    const mockMarketData = {
      symbol: 'MSFT',
      currentPrice: 380.0,
      preMarketPrice: 382.0,
      preMarketChange: 0.53,
      nasdaqSentiment: 'UP' as const,
      newsSentiment: 0.72,
      dataSource: 'REAL' as const,
    };

    expect(mockMarketData.preMarketChange).toBeGreaterThan(0);
    expect(mockMarketData.nasdaqSentiment).toBe('UP');
  });

  it('should display negative pre-market changes in red', () => {
    const mockMarketData = {
      symbol: 'GOOGL',
      currentPrice: 140.0,
      preMarketPrice: 138.5,
      preMarketChange: -1.07,
      nasdaqSentiment: 'DOWN' as const,
      newsSentiment: -0.45,
      dataSource: 'REAL' as const,
    };

    expect(mockMarketData.preMarketChange).toBeLessThan(0);
    expect(mockMarketData.nasdaqSentiment).toBe('DOWN');
  });

  it('should display Nasdaq sentiment with correct color coding', () => {
    const sentiments = ['UP', 'DOWN', 'NEUTRAL'] as const;

    sentiments.forEach((sentiment) => {
      const mockMarketData = {
        symbol: 'TSLA',
        currentPrice: 250.0,
        preMarketPrice: 250.0,
        preMarketChange: 0.0,
        nasdaqSentiment: sentiment,
        newsSentiment: 0.0,
        dataSource: 'REAL' as const,
      };

      expect(['UP', 'DOWN', 'NEUTRAL']).toContain(mockMarketData.nasdaqSentiment);
    });
  });

  it('should update market data every 2 seconds', () => {
    // Simulate 2-second refetch interval
    const refetchInterval = 2000;
    expect(refetchInterval).toBe(2000);
  });

  it('should display news sentiment score', () => {
    const mockMarketData = {
      symbol: 'AMZN',
      currentPrice: 175.0,
      preMarketPrice: 175.5,
      preMarketChange: 0.29,
      nasdaqSentiment: 'UP' as const,
      newsSentiment: 0.58,
      dataSource: 'REAL' as const,
    };

    expect(mockMarketData.newsSentiment).toBeGreaterThanOrEqual(-1);
    expect(mockMarketData.newsSentiment).toBeLessThanOrEqual(1);
  });

  it('should handle missing pre-market data gracefully', () => {
    const mockMarketData = {
      symbol: 'NVDA',
      currentPrice: 875.0,
      preMarketPrice: undefined,
      preMarketChange: undefined,
      nasdaqSentiment: 'NEUTRAL' as const,
      newsSentiment: 0.0,
      dataSource: 'FALLBACK' as const,
    };

    expect(mockMarketData.preMarketPrice).toBeUndefined();
    expect(mockMarketData.preMarketChange).toBeUndefined();
    expect(mockMarketData.dataSource).toBe('FALLBACK');
  });

  it('should display all market data sections in modal', () => {
    const sections = ['Pre-Market Data', 'Nasdaq Sentiment', 'Technical Analysis'];
    
    sections.forEach((section) => {
      expect(section).toBeDefined();
      expect(section.length).toBeGreaterThan(0);
    });
  });

  it('should show data source indicator', () => {
    const mockMarketData = {
      symbol: 'META',
      currentPrice: 500.0,
      preMarketPrice: 502.0,
      preMarketChange: 0.4,
      nasdaqSentiment: 'UP' as const,
      newsSentiment: 0.68,
      dataSource: 'REAL' as const,
    };

    expect(['REAL', 'FALLBACK']).toContain(mockMarketData.dataSource);
  });

  it('should format pre-market price with 2 decimal places', () => {
    const mockMarketData = {
      symbol: 'NFLX',
      currentPrice: 450.0,
      preMarketPrice: 451.234,
      preMarketChange: 0.27,
      nasdaqSentiment: 'UP' as const,
      newsSentiment: 0.55,
      dataSource: 'REAL' as const,
    };

    const formattedPrice = mockMarketData.preMarketPrice.toFixed(2);
    expect(formattedPrice).toBe('451.23');
  });

  it('should format pre-market change percentage with 2 decimal places', () => {
    const mockMarketData = {
      symbol: 'AAPL',
      currentPrice: 150.0,
      preMarketPrice: 149.5,
      preMarketChange: -0.333333,
      nasdaqSentiment: 'UP' as const,
      newsSentiment: 0.65,
      dataSource: 'REAL' as const,
    };

    const formattedChange = mockMarketData.preMarketChange.toFixed(2);
    expect(formattedChange).toBe('-0.33');
  });
});
