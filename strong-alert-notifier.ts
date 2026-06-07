import { notifyOwner } from "./_core/notification";

export interface StrongAlertData {
  symbol: string;
  stockName: string;
  currentPrice: number;
  buyPrice: number;
  sellPrice: number;
  stopLoss: number;
  alertConfidence: number;
  preMarketChange: number;
  nasdaqFuturesSentiment: string;
  newsSentiment: number;
  reasoning: string;
}

/**
 * Send email notification for STRONG alerts
 */
export async function notifyStrongAlert(alert: StrongAlertData): Promise<boolean> {
  try {
    const title = `🚨 STRONG ALERT: ${alert.symbol} - ${alert.alertConfidence}% Confidence`;

    const content = `
**Stock:** ${alert.symbol} (${alert.stockName})
**Alert Type:** 🚨 STRONG SIGNAL

**Price Action:**
- Current Price: $${alert.currentPrice.toFixed(2)}
- Buy Price: $${alert.buyPrice.toFixed(2)}
- Sell Price: $${alert.sellPrice.toFixed(2)}
- Stop Loss: $${alert.stopLoss.toFixed(2)}

**Market Sentiment:**
- Pre-Market Change: ${alert.preMarketChange > 0 ? "🟢" : "🔴"} ${alert.preMarketChange.toFixed(2)}%
- Nasdaq Futures: ${alert.nasdaqFuturesSentiment === "UP" ? "🟢 UP" : alert.nasdaqFuturesSentiment === "DOWN" ? "🔴 DOWN" : "⚪ NEUTRAL"}
- News Sentiment: ${alert.newsSentiment > 0 ? "🟢 Positive" : alert.newsSentiment < 0 ? "🔴 Negative" : "⚪ Neutral"} (${alert.newsSentiment.toFixed(2)})

**Alert Reasoning:**
${alert.reasoning}

**Confidence:** ${alert.alertConfidence}%

**Recommended Action:**
This is a STRONG signal with high confidence. Consider entering a position at the buy price with stop loss at ${alert.stopLoss.toFixed(2)}.

---
*This is an automated trading alert. Always do your own research before trading.*
    `;

    const result = await notifyOwner({
      title,
      content,
    });

    if (result) {
      console.log(`[StrongAlertNotifier] Email sent for ${alert.symbol}`);
    } else {
      console.warn(`[StrongAlertNotifier] Failed to send email for ${alert.symbol}`);
    }

    return result;
  } catch (error) {
    console.error("[StrongAlertNotifier] Error sending notification:", error);
    return false;
  }
}

/**
 * Send email notification for multiple STRONG alerts
 */
export async function notifyMultipleStrongAlerts(alerts: StrongAlertData[]): Promise<void> {
  for (const alert of alerts) {
    await notifyStrongAlert(alert);
    // Add delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
