import { getActivePriceAlertsForSymbol, updatePriceAlertTriggered } from "./db";
import { notifyOwner } from "./_core/notification";

export interface PriceAlertTriggered {
  alertId: number;
  symbol: string;
  alertType: "ABOVE" | "BELOW";
  targetPrice: number;
  currentPrice: number;
  userId: number;
}

/**
 * Check if any price alerts should be triggered for a given stock price
 */
export async function checkPriceAlerts(symbol: string, currentPrice: number): Promise<PriceAlertTriggered[]> {
  const alerts = await getActivePriceAlertsForSymbol(symbol);
  const triggeredAlerts: PriceAlertTriggered[] = [];

  for (const alert of alerts) {
    const targetPrice = parseFloat(alert.targetPrice.toString());
    let shouldTrigger = false;

    if (alert.alertType === "ABOVE" && currentPrice >= targetPrice) {
      shouldTrigger = true;
    } else if (alert.alertType === "BELOW" && currentPrice <= targetPrice) {
      shouldTrigger = true;
    }

    if (shouldTrigger) {
      triggeredAlerts.push({
        alertId: alert.id,
        symbol,
        alertType: alert.alertType,
        targetPrice,
        currentPrice,
        userId: alert.userId,
      });

      // Update the alert's lastTriggered timestamp
      await updatePriceAlertTriggered(alert.id);
    }
  }

  return triggeredAlerts;
}

/**
 * Send email notification for triggered price alerts
 */
export async function sendPriceAlertNotification(alerts: PriceAlertTriggered[]): Promise<void> {
  if (alerts.length === 0) return;

  const alertDetails = alerts
    .map((alert) => {
      const direction = alert.alertType === "ABOVE" ? "above" : "below";
      return `• ${alert.symbol}: Price ${alert.currentPrice.toFixed(2)} is ${direction} your target of ${alert.targetPrice.toFixed(2)}`;
    })
    .join("\n");

  const content = `Price alerts triggered:\n\n${alertDetails}\n\nCheck your watchlist for more details.`;

  try {
    await notifyOwner({
      title: `🚨 Price Alerts Triggered (${alerts.length})`,
      content,
    });
  } catch (error) {
    console.error("[Watchlist] Failed to send price alert notification:", error);
  }
}
