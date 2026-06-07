import { notifyOwner } from './_core/notification';
import { TradingSignal } from './trading-logic';

export interface ReadySignalNotification {
  stockName: string;
  symbol: string;
  currentPrice: number;
  buyPrice: number;
  sellPrice: number;
  stopLoss: number;
  reason: string;
}

/**
 * Send email notification to owner when a READY signal is detected
 */
export async function notifyReadySignal(notification: ReadySignalNotification): Promise<boolean> {
  const title = `🚀 Trading Signal READY: ${notification.stockName} (${notification.symbol})`;
  
  const content = `
A new trading signal is READY for action:

**Stock:** ${notification.stockName} (${notification.symbol})
**Current Price:** $${notification.currentPrice.toFixed(2)}

**Trading Plan:**
- Buy Price: $${notification.buyPrice.toFixed(2)}
- Sell Price: $${notification.sellPrice.toFixed(2)}
- Stop Loss: $${notification.stopLoss.toFixed(2)}

**Analysis:**
${notification.reason}

Log in to the dashboard to review the full analysis and execute trades manually in Vested.
  `.trim();

  try {
    const result = await notifyOwner({ title, content });
    console.log(`[Email] Notification sent for ${notification.symbol}: ${result}`);
    return result;
  } catch (error) {
    console.error(`[Email] Failed to send notification for ${notification.symbol}:`, error);
    return false;
  }
}

/**
 * Batch notify for multiple READY signals
 */
export async function notifyReadySignalsBatch(notifications: ReadySignalNotification[]): Promise<boolean[]> {
  const results = await Promise.all(
    notifications.map(notification => notifyReadySignal(notification))
  );
  return results;
}
