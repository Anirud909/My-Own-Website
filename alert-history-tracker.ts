import { getDb } from "./db";
import { alertHistory } from "../drizzle/schema";
import { eq } from "drizzle-orm";

export interface AlertRecord {
  symbol: string;
  alertLevel: string;
  alertConfidence: number;
  preMarketChange?: number;
  nasdaqFuturesSentiment?: string;
  newsSentiment?: number;
  currentPrice: number;
  buyPrice?: number;
  sellPrice?: number;
}

/**
 * Log an alert to the history table
 */
export async function logAlert(alert: AlertRecord): Promise<void> {
  try {
    const db = await getDb();
    if (!db) {
      console.warn("[AlertHistory] Database not available");
      return;
    }

    const record: any = {
      symbol: alert.symbol,
      alertLevel: alert.alertLevel,
      alertConfidence: alert.alertConfidence,
      preMarketChange: alert.preMarketChange ? parseFloat(alert.preMarketChange.toString()) : null,
      nasdaqFuturesSentiment: alert.nasdaqFuturesSentiment || null,
      newsSentiment: alert.newsSentiment ? parseFloat(alert.newsSentiment.toString()) : null,
      currentPrice: parseFloat(alert.currentPrice.toString()),
      buyPrice: alert.buyPrice ? parseFloat(alert.buyPrice.toString()) : null,
      sellPrice: alert.sellPrice ? parseFloat(alert.sellPrice.toString()) : null,
      timestamp: new Date().toISOString(),
    };
    await db.insert(alertHistory).values(record);

    console.log(`[AlertHistory] Logged ${alert.alertLevel} alert for ${alert.symbol}`);
  } catch (error) {
    console.error("[AlertHistory] Failed to log alert:", error);
  }
}

/**
 * Get alert accuracy for a specific stock over the past N days
 */
export async function getAlertAccuracy(symbol: string, days: number = 7): Promise<{
  totalAlerts: number;
  strongAlerts: number;
  profitableAlerts: number;
  accuracy: number;
  averageConfidence: number;
}> {
  try {
    const db = await getDb();
    if (!db) {
      console.warn("[AlertHistory] Database not available");
      return { totalAlerts: 0, strongAlerts: 0, profitableAlerts: 0, accuracy: 0, averageConfidence: 0 };
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Get all alerts for this stock in the past N days
    const alerts = await db
      .select()
      .from(alertHistory)
      .where(eq(alertHistory.symbol, symbol));

    if (alerts.length === 0) {
      return { totalAlerts: 0, strongAlerts: 0, profitableAlerts: 0, accuracy: 0, averageConfidence: 0 };
    }

    const strongAlerts = alerts.filter((a) => a.alertLevel === "STRONG");
    const profitableAlerts = alerts.filter((a) => a.actualOutcome === "PROFIT");
    const totalConfidence = alerts.reduce((sum, a) => sum + (a.alertConfidence || 0), 0);

    return {
      totalAlerts: alerts.length,
      strongAlerts: strongAlerts.length,
      profitableAlerts: profitableAlerts.length,
      accuracy: alerts.length > 0 ? (profitableAlerts.length / alerts.length) * 100 : 0,
      averageConfidence: alerts.length > 0 ? totalConfidence / alerts.length : 0,
    };
  } catch (error) {
    console.error("[AlertHistory] Failed to get accuracy:", error);
    return { totalAlerts: 0, strongAlerts: 0, profitableAlerts: 0, accuracy: 0, averageConfidence: 0 };
  }
}

/**
 * Get all alerts for a stock
 */
export async function getAlertHistory(symbol: string, limit: number = 100): Promise<any[]> {
  try {
    const db = await getDb();
    if (!db) {
      console.warn("[AlertHistory] Database not available");
      return [];
    }

    const alerts = await db
      .select()
      .from(alertHistory)
      .where(eq(alertHistory.symbol, symbol))
      .limit(limit);

    return alerts || [];
  } catch (error) {
    console.error("[AlertHistory] Failed to get alert history:", error);
    return [];
  }
}

/**
 * Get accuracy metrics for all stocks
 */
export async function getAllStocksAccuracy(days: number = 7): Promise<Map<string, any>> {
  try {
    const db = await getDb();
    if (!db) {
      console.warn("[AlertHistory] Database not available");
      return new Map();
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Get all unique symbols from alert history
    const allAlerts = await db.select().from(alertHistory);

    const symbolSet = new Set(allAlerts.map((a) => a.symbol));
    const symbols = Array.from(symbolSet);
    const accuracyMap = new Map();

    for (const symbol of symbols) {
      const accuracy = await getAlertAccuracy(symbol, days);
      accuracyMap.set(symbol, accuracy);
    }

    return accuracyMap;
  } catch (error) {
    console.error("[AlertHistory] Failed to get all stocks accuracy:", error);
    return new Map();
  }
}
