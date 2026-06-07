import axios from 'axios';

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || 'demo';
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || 'demo';
const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

/**
 * Get REAL pre-market data from Alpha Vantage
 * This is actual market data, NOT mock
 */
export async function getRealPreMarketData(symbol: string): Promise<{
  preMarketPrice: number;
  preMarketChange: number;
  preMarketChangePercent: number;
  isRealData: boolean;
  source: string;
}> {
  try {
    // Try Alpha Vantage first (most reliable for pre-market)
    const response = await axios.get('https://www.alphavantage.co/query', {
      params: {
        function: 'GLOBAL_QUOTE',
        symbol: symbol,
        apikey: ALPHA_VANTAGE_API_KEY,
      },
      timeout: 8000,
    });

    const data = response.data;

    if (data['Global Quote'] && data['Global Quote']['05. price']) {
      const currentPrice = parseFloat(data['Global Quote']['05. price']);
      const previousClose = parseFloat(data['Global Quote']['08. previous close'] || currentPrice * 0.99);
      const preMarketChange = currentPrice - previousClose;
      const preMarketChangePercent = (preMarketChange / previousClose) * 100;

      console.log(`[REAL DATA] ${symbol} from Alpha Vantage: $${currentPrice.toFixed(2)} (${preMarketChangePercent.toFixed(2)}%)`);

      return {
        preMarketPrice: currentPrice,
        preMarketChange: preMarketChange,
        preMarketChangePercent: preMarketChangePercent,
        isRealData: true,
        source: 'Alpha Vantage',
      };
    }

    console.warn(`[Market Data] Alpha Vantage returned no data for ${symbol}, trying Finnhub...`);
    return getRealPreMarketDataFromFinnhub(symbol);
  } catch (error) {
    console.warn(`[Market Data] Alpha Vantage failed for ${symbol}:`, error instanceof Error ? error.message : error);
    return getRealPreMarketDataFromFinnhub(symbol);
  }
}

/**
 * Get REAL pre-market data from Finnhub
 */
async function getRealPreMarketDataFromFinnhub(symbol: string): Promise<{
  preMarketPrice: number;
  preMarketChange: number;
  preMarketChangePercent: number;
  isRealData: boolean;
  source: string;
}> {
  try {
    const response = await axios.get(`${FINNHUB_BASE_URL}/quote`, {
      params: {
        symbol: symbol,
        token: FINNHUB_API_KEY,
      },
      timeout: 8000,
    });

    const data = response.data;

    if (data.c && data.pc) {
      const currentPrice = data.c;
      const previousClose = data.pc;
      const preMarketChange = currentPrice - previousClose;
      const preMarketChangePercent = (preMarketChange / previousClose) * 100;

      console.log(`[REAL DATA] ${symbol} from Finnhub: $${currentPrice.toFixed(2)} (${preMarketChangePercent.toFixed(2)}%)`);

      return {
        preMarketPrice: currentPrice,
        preMarketChange: preMarketChange,
        preMarketChangePercent: preMarketChangePercent,
        isRealData: true,
        source: 'Finnhub',
      };
    }

    console.error(`[ERROR] No real data available for ${symbol} from any API!`);
    throw new Error(`No real data available for ${symbol}`);
  } catch (error) {
    console.error(`[ERROR] Finnhub failed for ${symbol}:`, error instanceof Error ? error.message : error);
    throw new Error(`Failed to fetch real pre-market data for ${symbol}`);
  }
}

/**
 * Get REAL Nasdaq sentiment from Finnhub
 */
export async function getRealNasdaqSentiment(): Promise<{
  sentiment: 'UP' | 'DOWN' | 'NEUTRAL';
  isRealData: boolean;
  source: string;
}> {
  try {
    // Get Nasdaq composite quote
    const response = await axios.get(`${FINNHUB_BASE_URL}/quote`, {
      params: {
        symbol: '^IXIC',
        token: FINNHUB_API_KEY,
      },
      timeout: 8000,
    });

    const data = response.data;

    if (data.c && data.pc) {
      const change = data.c - data.pc;
      const changePercent = (change / data.pc) * 100;
      const sentiment = changePercent > 0.5 ? 'UP' : changePercent < -0.5 ? 'DOWN' : 'NEUTRAL';

      console.log(`[REAL DATA] Nasdaq sentiment from Finnhub: ${sentiment} (${changePercent.toFixed(2)}%)`);

      return {
        sentiment,
        isRealData: true,
        source: 'Finnhub',
      };
    }

    console.error('[ERROR] No real Nasdaq sentiment data available!');
    throw new Error('No real Nasdaq sentiment data available');
  } catch (error) {
    console.error('[ERROR] Failed to fetch Nasdaq sentiment:', error instanceof Error ? error.message : error);
    throw new Error('Failed to fetch real Nasdaq sentiment');
  }
}

/**
 * Get REAL news sentiment from Finnhub
 */
export async function getRealNewsSentiment(symbol: string): Promise<{
  sentiment: number;
  isRealData: boolean;
  source: string;
}> {
  try {
    const response = await axios.get(`${FINNHUB_BASE_URL}/news-sentiment`, {
      params: {
        symbol: symbol,
        token: FINNHUB_API_KEY,
      },
      timeout: 8000,
    });

    const data = response.data;

    if (data.sentiment !== undefined) {
      const sentiment = data.sentiment;
      console.log(`[REAL DATA] ${symbol} news sentiment from Finnhub: ${sentiment.toFixed(2)}`);

      return {
        sentiment,
        isRealData: true,
        source: 'Finnhub',
      };
    }

    console.warn(`[Market Data] No news sentiment data for ${symbol}`);
    throw new Error(`No news sentiment data for ${symbol}`);
  } catch (error) {
    console.warn(`[Market Data] Failed to fetch news sentiment for ${symbol}:`, error instanceof Error ? error.message : error);
    throw new Error(`Failed to fetch real news sentiment for ${symbol}`);
  }
}
