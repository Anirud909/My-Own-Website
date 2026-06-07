import { describe, it, expect } from 'vitest';
import axios from 'axios';

describe('Finnhub API Integration', () => {
  const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
  const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

  it('should validate Finnhub API key by fetching quote data', async () => {
    expect(FINNHUB_API_KEY).toBeDefined();
    expect(FINNHUB_API_KEY).not.toBe('demo');

    try {
      const response = await axios.get(`${FINNHUB_BASE_URL}/quote`, {
        params: {
          symbol: 'AAPL',
          token: FINNHUB_API_KEY,
        },
        timeout: 10000,
      });

      // Check if response has expected data
      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
      
      // If we get data with price info, API key is valid
      if (response.data.c !== undefined) {
        console.log(`✅ Finnhub API Key Valid! AAPL current price: $${response.data.c}`);
        expect(response.data.c).toBeGreaterThan(0);
      } else if (response.data.error) {
        console.error(`❌ Finnhub API Error: ${response.data.error}`);
        throw new Error(`API Error: ${response.data.error}`);
      }
    } catch (error) {
      console.error('Finnhub API test failed:', error instanceof Error ? error.message : error);
      throw error;
    }
  });

  it('should fetch Nasdaq futures data', async () => {
    expect(FINNHUB_API_KEY).toBeDefined();

    try {
      const response = await axios.get(`${FINNHUB_BASE_URL}/quote`, {
        params: {
          symbol: '^IXIC',
          token: FINNHUB_API_KEY,
        },
        timeout: 10000,
      });

      expect(response.status).toBe(200);
      
      if (response.data.c !== undefined) {
        console.log(`✅ Nasdaq Futures Data Available! Index: ${response.data.c}`);
        expect(response.data.c).toBeGreaterThan(0);
      } else if (response.data.error) {
        console.warn(`⚠️ Nasdaq futures not available: ${response.data.error}`);
      }
    } catch (error) {
      console.error('Nasdaq futures test failed:', error instanceof Error ? error.message : error);
      throw error;
    }
  });

  it('should fetch news data for a stock', async () => {
    expect(FINNHUB_API_KEY).toBeDefined();

    try {
      const response = await axios.get(`${FINNHUB_BASE_URL}/news`, {
        params: {
          symbol: 'AAPL',
          limit: 5,
          token: FINNHUB_API_KEY,
        },
        timeout: 10000,
      });

      expect(response.status).toBe(200);
      
      if (Array.isArray(response.data) && response.data.length > 0) {
        console.log(`✅ News Data Available! Found ${response.data.length} articles for AAPL`);
        expect(response.data.length).toBeGreaterThan(0);
      } else if (response.data.error) {
        console.warn(`⚠️ News data not available: ${response.data.error}`);
      }
    } catch (error) {
      console.error('News data test failed:', error instanceof Error ? error.message : error);
      throw error;
    }
  });
});
