import { eq, and, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { users, trackedStocks, priceHistory, watchlists, priceAlerts } from "../drizzle/schema";

// Define types based on table definitions
export type InsertUser = typeof users.$inferInsert;
export type TrackedStock = typeof trackedStocks.$inferSelect;
export type InsertTrackedStock = typeof trackedStocks.$inferInsert;
export type PriceHistory = typeof priceHistory.$inferSelect;
export type InsertPriceHistory = typeof priceHistory.$inferInsert;
export type Watchlist = typeof watchlists.$inferSelect;
export type InsertWatchlist = typeof watchlists.$inferInsert;
export type PriceAlert = typeof priceAlerts.$inferSelect;
export type InsertPriceAlert = typeof priceAlerts.$inferInsert;
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date().toISOString();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date().toISOString();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Stock tracking queries
export async function getAllTrackedStocks(): Promise<TrackedStock[]> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get stocks: database not available");
    return [];
  }

  return await db.select().from(trackedStocks);
}

export async function updateTrackedStock(symbol: string, data: Partial<InsertTrackedStock>): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update stock: database not available");
    return;
  }

  await db.update(trackedStocks).set(data).where(eq(trackedStocks.symbol, symbol));
}

export async function getTrackedStockBySymbol(symbol: string): Promise<TrackedStock | undefined> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get stock: database not available");
    return undefined;
  }

  const result = await db.select().from(trackedStocks).where(eq(trackedStocks.symbol, symbol)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// Price history queries
export async function recordPriceHistory(data: InsertPriceHistory): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot record price: database not available");
    return;
  }

  await db.insert(priceHistory).values(data);
}

export async function getPriceHistory(symbol: string, limit: number = 100): Promise<PriceHistory[]> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get price history: database not available");
    return [];
  }

  return await db
    .select()
    .from(priceHistory)
    .where(eq(priceHistory.symbol, symbol))
    .orderBy(desc(priceHistory.timestamp))
    .limit(limit);
}

export async function getLatestPriceForSymbol(symbol: string): Promise<PriceHistory | undefined> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get latest price: database not available");
    return undefined;
  }

  const result = await db
    .select()
    .from(priceHistory)
    .where(eq(priceHistory.symbol, symbol))
    .orderBy(desc(priceHistory.timestamp))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Watchlist queries
export async function addToWatchlist(userId: number, symbol: string, stockName: string): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot add to watchlist: database not available");
    return;
  }

  await db.insert(watchlists).values({ userId, symbol, stockName });
}

export async function removeFromWatchlist(userId: number, symbol: string): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot remove from watchlist: database not available");
    return;
  }

  await db.delete(watchlists).where(and(eq(watchlists.userId, userId), eq(watchlists.symbol, symbol)));
}

export async function getUserWatchlist(userId: number): Promise<Watchlist[]> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get watchlist: database not available");
    return [];
  }

  return await db.select().from(watchlists).where(eq(watchlists.userId, userId));
}

export async function isInWatchlist(userId: number, symbol: string): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot check watchlist: database not available");
    return false;
  }

  const result = await db.select().from(watchlists).where(and(eq(watchlists.userId, userId), eq(watchlists.symbol, symbol))).limit(1);
  return result.length > 0;
}

// Price Alert queries
export async function createPriceAlert(userId: number, symbol: string, alertType: "ABOVE" | "BELOW", targetPrice: number): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot create price alert: database not available");
    return;
  }

  const data: InsertPriceAlert = { userId, symbol, alertType, targetPrice: targetPrice.toString() as any, isActive: "true" };
  await db.insert(priceAlerts).values(data);
}

export async function deletePriceAlert(alertId: number): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot delete price alert: database not available");
    return;
  }

  await db.delete(priceAlerts).where(eq(priceAlerts.id, alertId));
}

export async function getUserPriceAlerts(userId: number): Promise<PriceAlert[]> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get price alerts: database not available");
    return [];
  }

  return await db.select().from(priceAlerts).where(eq(priceAlerts.userId, userId));
}

export async function getActivePriceAlertsForSymbol(symbol: string): Promise<PriceAlert[]> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get active alerts: database not available");
    return [];
  }

  return await db.select().from(priceAlerts).where(and(eq(priceAlerts.symbol, symbol), eq(priceAlerts.isActive, "true")));
}

export async function updatePriceAlertTriggered(alertId: number): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update alert: database not available");
    return;
  }

  await db.update(priceAlerts).set({ lastTriggered: new Date().toISOString() }).where(eq(priceAlerts.id, alertId));
}


// Add/Remove Stock queries
export async function addStock(symbol: string, stockName: string): Promise<TrackedStock> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const result = await db.insert(trackedStocks).values({
    symbol: symbol.toUpperCase(),
    stockName,
    status: "WAIT",
  });

  // Fetch and return the inserted stock
  const stocks = await db.select().from(trackedStocks).where(eq(trackedStocks.symbol, symbol.toUpperCase()));
  if (stocks.length === 0) {
    throw new Error("Failed to add stock");
  }
  return stocks[0];
}

export async function removeStock(stockId: number): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  await db.delete(trackedStocks).where(eq(trackedStocks.id, stockId));
}
