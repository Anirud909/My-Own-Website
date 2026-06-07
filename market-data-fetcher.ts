import axios from 'axios';
import { MarketData } from './trading-logic';

/**
 * Fetch live market data from Alpha Vantage API
 * Includes: current price, 50-day MA, RSI(14), volume data, support/resistance levels
 */

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || 'demo';
const ALPHA_VANTAGE_BASE_URL = 'https://www.alphavantage.co/query';

interface AlphaVantageTimeSeries {
  [date: string]: {
    '1. open': string;
    '2. high': string;
    '3. low': string;
    '4. close': string;
    '5. volume': string;
  };
}

interface AlphaVantageResponse {
  'Time Series (Daily)'?: AlphaVantageTimeSeries;
  'Technical Analysis: RSI'?: {
    [date: string]: {
      'RSI': string;
    };
  };
  'Error Message'?: string;
  'Note'?: string;
}

/**
 * Calculate 50-day moving average from historical data
 */
function calculate50DayMA(timeSeries: AlphaVantageTimeSeries): number {
  const dates = Object.keys(timeSeries).slice(0, 50);
  if (dates.length === 0) return 0;

  const sum = dates.reduce((acc, date) => {
    return acc + parseFloat(timeSeries[date]['4. close']);
  }, 0);

  return sum / dates.length;
}

/**
 * Calculate support and resistance levels using recent highs/lows
 */
function calculateSupportResistance(timeSeries: AlphaVantageTimeSeries): { support: number; resistance: number } {
  const dates = Object.keys(timeSeries).slice(0, 30); // Last 30 days
  let highestHigh = 0;
  let lowestLow = Infinity;

  dates.forEach(date => {
    const high = parseFloat(timeSeries[date]['2. high']);
    const low = parseFloat(timeSeries[date]['3. low']);
    if (high > highestHigh) highestHigh = high;
    if (low < lowestLow) lowestLow = low;
  });

  return {
    resistance: highestHigh,
    support: lowestLow,
  };
}

/**
 * Calculate average volume from last 20 days
 */
function calculateAverageVolume(timeSeries: AlphaVantageTimeSeries): number {
  const dates = Object.keys(timeSeries).slice(0, 20);
  if (dates.length === 0) return 0;

  const sum = dates.reduce((acc, date) => {
    return acc + parseInt(timeSeries[date]['5. volume']);
  }, 0);

  return Math.round(sum / dates.length);
}

// Mock market data for testing when API is unavailable
const MOCK_DATA: Record<string, MarketData> = {
  'AAPL': { currentPrice: 298.87, movingAverage50: 264.68, rsi14: 50, supportLevel: 280, resistanceLevel: 310, averageVolume: 49128769, currentVolume: 52684260 },
  'MSFT': { currentPrice: 405.21, movingAverage50: 398.76, rsi14: 50, supportLevel: 385, resistanceLevel: 425, averageVolume: 35157954, currentVolume: 29667073 },
  'GOOGL': { currentPrice: 402.62, movingAverage50: 328.86, rsi14: 50, supportLevel: 380, resistanceLevel: 420, averageVolume: 27981000, currentVolume: 28144555 },
  'AMZN': { currentPrice: 270.13, movingAverage50: 234.80, rsi14: 50, supportLevel: 250, resistanceLevel: 290, averageVolume: 46865861, currentVolume: 39670915 },
  'NVDA': { currentPrice: 225.83, movingAverage50: 191.18, rsi14: 50, supportLevel: 210, resistanceLevel: 240, averageVolume: 150202079, currentVolume: 150405386 },
  'TSLA': { currentPrice: 445.27, movingAverage50: 385.70, rsi14: 50, supportLevel: 420, resistanceLevel: 470, averageVolume: 62724927, currentVolume: 68283229 },
  'PLTR': { currentPrice: 130.05, movingAverage50: 145.17, rsi14: 50, supportLevel: 120, resistanceLevel: 150, averageVolume: 45599325, currentVolume: 55189399 },
};

export async function fetchMarketData(symbol: string): Promise<MarketData | null> {
  try {
    // Fetch daily time series data
    const dailyResponse = await axios.get<AlphaVantageResponse>(ALPHA_VANTAGE_BASE_URL, {
      params: {
        function: 'TIME_SERIES_DAILY',
        symbol: symbol,
        apikey: ALPHA_VANTAGE_API_KEY,
      },
      timeout: 10000,
    });

    if (dailyResponse.data['Error Message'] || dailyResponse.data['Note']) {
      console.warn(`[Market Data] API error for ${symbol}:`, dailyResponse.data['Error Message'] || dailyResponse.data['Note']);
      // Fall back to mock data
      if (MOCK_DATA[symbol]) {
        console.log(`[Market Data] Using mock data for ${symbol}`);
        return MOCK_DATA[symbol];
      }
      return null;
    }

    const timeSeries = dailyResponse.data['Time Series (Daily)'];
    if (!timeSeries) {
      console.warn(`[Market Data] No time series data for ${symbol}`);
      // Fall back to mock data
      if (MOCK_DATA[symbol]) {
        console.log(`[Market Data] Using mock data for ${symbol}`);
        return MOCK_DATA[symbol];
      }
      return null;
    }

    const dates = Object.keys(timeSeries);
    const latestDate = dates[0];
    const latestData = timeSeries[latestDate];

    const currentPrice = parseFloat(latestData['4. close']);
    const currentVolume = parseInt(latestData['5. volume']);

    // Fetch RSI data
    const rsiResponse = await axios.get<AlphaVantageResponse>(ALPHA_VANTAGE_BASE_URL, {
      params: {
        function: 'RSI',
        symbol: symbol,
        interval: 'daily',
        time_period: 14,
        apikey: ALPHA_VANTAGE_API_KEY,
      },
      timeout: 10000,
    });

    let rsi14 = 50; // Default neutral RSI
    if (rsiResponse.data['Technical Analysis: RSI']) {
      const rsiData = rsiResponse.data['Technical Analysis: RSI'];
      const rsiDates = Object.keys(rsiData);
      if (rsiDates.length > 0) {
        rsi14 = parseFloat(rsiData[rsiDates[0]]['RSI']);
      }
    }

    const movingAverage50 = calculate50DayMA(timeSeries);
    const { support: supportLevel, resistance: resistanceLevel } = calculateSupportResistance(timeSeries);
    const averageVolume = calculateAverageVolume(timeSeries);

    return {
      currentPrice,
      movingAverage50,
      rsi14,
      supportLevel,
      resistanceLevel,
      averageVolume,
      currentVolume,
    };
  } catch (error) {
    console.error(`[Market Data] Failed to fetch data for ${symbol}:`, error);
    // Fall back to mock data on error
    if (MOCK_DATA[symbol]) {
      console.log(`[Market Data] Using mock data for ${symbol} due to error`);
      return MOCK_DATA[symbol];
    }
    return null;
  }
}

/**
 * Fetch market data for multiple symbols
 */
export async function fetchMarketDataBatch(symbols: string[]): Promise<Record<string, MarketData | null>> {
  const results: Record<string, MarketData | null> = {};

  for (const symbol of symbols) {
    // Add delay between API calls to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 1000));
    results[symbol] = await fetchMarketData(symbol);
  }

  return results;
}
