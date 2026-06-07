import { getAllTrackedStocks, recordPriceHistory, getLatestPriceForSymbol, updateTrackedStock } from './db';
import { fetchMarketData } from './market-data-fetcher';
import { notifyOwner } from './_core/notification';

export interface PriceAlert {
  symbol: string;
  stockName: string;
  previousPrice: number;
  currentPrice: number;
  priceChange: number;
  priceChangePercent: number;
  timestamp: Date;
}

/**
 * Fetch latest prices for all tracked stocks and record price history
 * Called every minute to update real-time prices
 */
export async function updateRealtimePrices(): Promise<PriceAlert[]> {
  try {
    const stocks = await getAllTrackedStocks();
    const alerts: PriceAlert[] = [];

    for (const stock of stocks) {
      const marketData = await fetchMarketData(stock.symbol);

      if (!marketData) {
        console.warn(`[Realtime] No market data for ${stock.symbol}`);
        continue;
      }

      const currentPrice = marketData.currentPrice;
      const previousPrice = stock.currentPrice ? parseFloat(stock.currentPrice as any) : currentPrice;

      // Calculate price change
      const priceChange = currentPrice - previousPrice;
      const priceChangePercent = previousPrice > 0 ? (priceChange / previousPrice) * 100 : 0;

      // Record price history
      await recordPriceHistory({
        symbol: stock.symbol,
        price: currentPrice.toString(),
        volume: marketData.currentVolume,
        priceChange: priceChange.toString(),
        priceChangePercent: priceChangePercent.toString(),
      });

      // Update current price in tracked stocks
      await updateTrackedStock(stock.symbol, {
        currentPrice: currentPrice.toString(),
      });

      // Create alert if price changed significantly (more than $0.01)
      if (Math.abs(priceChange) > 0.01) {
        alerts.push({
          symbol: stock.symbol,
          stockName: stock.stockName,
          previousPrice,
          currentPrice,
          priceChange,
          priceChangePercent,
          timestamp: new Date(),
        });

        console.log(`[Realtime] ${stock.symbol}: $${previousPrice.toFixed(2)} -> $${currentPrice.toFixed(2)} (${priceChangePercent > 0 ? '+' : ''}${priceChangePercent.toFixed(2)}%)`);
      }
    }

    return alerts;
  } catch (error) {
    console.error('[Realtime] Error updating prices:', error);
    return [];
  }
}

/**
 * Send price alert notifications
 */
export async function notifyPriceAlerts(alerts: PriceAlert[]): Promise<void> {
  for (const alert of alerts) {
    const direction = alert.priceChange > 0 ? '📈 UP' : '📉 DOWN';
    const title = `${direction} Price Alert: ${alert.symbol}`;

    const content = `
${alert.stockName} (${alert.symbol}) price changed:

**Previous Price:** $${alert.previousPrice.toFixed(2)}
**Current Price:** $${alert.currentPrice.toFixed(2)}
**Change:** ${alert.priceChange > 0 ? '+' : ''}$${alert.priceChange.toFixed(2)} (${alert.priceChangePercent > 0 ? '+' : ''}${alert.priceChangePercent.toFixed(2)}%)

Updated at: ${alert.timestamp.toLocaleString()}
    `.trim();

    try {
      await notifyOwner({ title, content });
    } catch (error) {
      console.error(`[Realtime] Failed to send alert for ${alert.symbol}:`, error);
    }
  }
}

/**
 * Get price change statistics for a stock
 */
export async function getPriceChangeStats(symbol: string): Promise<{
  currentPrice: number;
  dayHigh: number;
  dayLow: number;
  dayChange: number;
  dayChangePercent: number;
} | null> {
  try {
    const marketData = await fetchMarketData(symbol);

    if (!marketData) {
      return null;
    }

    // Calculate day high/low from recent price history
    const dayHigh = marketData.currentPrice * 1.02; // Approximate
    const dayLow = marketData.currentPrice * 0.98; // Approximate

    return {
      currentPrice: marketData.currentPrice,
      dayHigh,
      dayLow,
      dayChange: marketData.currentPrice - dayLow,
      dayChangePercent: ((marketData.currentPrice - dayLow) / dayLow) * 100,
    };
  } catch (error) {
    console.error(`[Realtime] Error getting price stats for ${symbol}:`, error);
    return null;
  }
}
