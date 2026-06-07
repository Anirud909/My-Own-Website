import { z } from 'zod';
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { getAllTrackedStocks, updateTrackedStock, getPriceHistory, addToWatchlist, removeFromWatchlist, getUserWatchlist, isInWatchlist, createPriceAlert, deletePriceAlert, getUserPriceAlerts, addStock as dbAddStock, removeStock as dbRemoveStock } from "./db";
import { fetchMarketDataBatch } from "./market-data-fetcher";
import { generateTradingSignal } from "./trading-logic";
import { notifyReadySignal } from "./email-notifier";
import { updateRealtimePrices as fetchRealtimePrices, notifyPriceAlerts } from "./realtime-price-service";
import { analyzeStockAI } from "./ai-stock-analyzer";
import { checkPriceAlerts, sendPriceAlertNotification } from "./watchlist-service";
import { getRealAlertAnalysis } from "./real-alert-system";
import { logAlert, getAlertAccuracy, getAlertHistory, getAllStocksAccuracy } from "./alert-history-tracker";
import { notifyStrongAlert } from "./strong-alert-notifier";
import { getRealPreMarketData, getRealNasdaqSentiment, getRealNewsSentiment } from "./real-market-data";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  trading: router({
    /**
     * Get all tracked stocks
     */
    getTrackedStocks: publicProcedure.query(async () => {
      const stocks = await getAllTrackedStocks();
      return stocks.map(stock => ({
        id: stock.id,
        stockName: stock.stockName,
        symbol: stock.symbol,
        currentPrice: stock.currentPrice ? parseFloat(stock.currentPrice as any) : null,
        movingAverage50: stock.movingAverage50 ? parseFloat(stock.movingAverage50 as any) : null,
        rsi14: stock.rsi14 ? parseFloat(stock.rsi14 as any) : null,
        supportLevel: stock.supportLevel ? parseFloat(stock.supportLevel as any) : null,
        resistanceLevel: stock.resistanceLevel ? parseFloat(stock.resistanceLevel as any) : null,
        averageVolume: stock.averageVolume,
        currentVolume: stock.currentVolume,
        trend: stock.trend,
        buyPrice: stock.buyPrice ? parseFloat(stock.buyPrice as any) : null,
        sellPrice: stock.sellPrice ? parseFloat(stock.sellPrice as any) : null,
        stopLoss: stock.stopLoss ? parseFloat(stock.stopLoss as any) : null,
        status: stock.status,
        reason: stock.reason,
        lastUpdated: stock.lastUpdated,
        alertLevel: stock.alertLevel || 'NONE',
        alertConfidence: stock.alertConfidence || 0,
        preMarketPrice: stock.preMarketPrice ? parseFloat(stock.preMarketPrice as any) : null,
        preMarketChange: stock.preMarketChange ? parseFloat(stock.preMarketChange as any) : null,
        nasdaqFuturesSentiment: stock.nasdaqFuturesSentiment || 'NEUTRAL',
        newsSentiment: stock.newsSentiment ? parseFloat(stock.newsSentiment as any) : null,
        dayOfWeekPattern: stock.dayOfWeekPattern || '',
      }));
    }),

    /**
     * Run market analysis for all tracked stocks
     * Fetches live data, applies trading rules, and updates database
     */
    runMarketAnalysis: publicProcedure.mutation(async () => {
      try {
        const stocks = await getAllTrackedStocks();
        const symbols = stocks.map(s => s.symbol);

        // Fetch market data for all stocks
        console.log(`[Analysis] Fetching market data for ${symbols.length} stocks...`);
        const marketData = await fetchMarketDataBatch(symbols);

        const readySignals = [];
        const previousReadySignals = new Set(
          stocks.filter(s => s.status === 'READY').map(s => s.symbol)
        );

        // Process each stock
        for (const stock of stocks) {
          const data = marketData[stock.symbol];

          if (!data) {
            console.warn(`[Analysis] No market data for ${stock.symbol}`);
            continue;
          }

          // Generate trading signal
          const signal = generateTradingSignal(data);

          // Get Real Alert System analysis
          const realAlert = await getRealAlertAnalysis(stock.symbol);

          // Update database with both trading signal and real alert data
          await updateTrackedStock(stock.symbol, {
            currentPrice: data.currentPrice.toString(),
            movingAverage50: data.movingAverage50.toString(),
            rsi14: data.rsi14.toString(),
            supportLevel: data.supportLevel.toString(),
            resistanceLevel: data.resistanceLevel.toString(),
            averageVolume: data.averageVolume,
            currentVolume: data.currentVolume,
            trend: signal.trend,
            buyPrice: signal.buyPrice > 0 ? signal.buyPrice.toString() : null,
            sellPrice: signal.sellPrice > 0 ? signal.sellPrice.toString() : null,
            stopLoss: signal.stopLoss > 0 ? signal.stopLoss.toString() : null,
            status: signal.status,
            reason: signal.reason,
            alertLevel: realAlert.alertLevel,
            alertConfidence: realAlert.alertConfidence,
            preMarketPrice: realAlert.preMarketPrice > 0 ? realAlert.preMarketPrice.toString() : null,
            preMarketChange: realAlert.preMarketChange !== 0 ? realAlert.preMarketChange.toString() : null,
            nasdaqFuturesSentiment: realAlert.nasdaqFuturesSentiment,
            newsSentiment: realAlert.newsSentiment !== 0 ? realAlert.newsSentiment.toString() : null,
            dayOfWeekPattern: realAlert.dayOfWeekPattern,
            lastUpdated: new Date().toISOString(),
          });

          // Log alert to history
          await logAlert({
            symbol: stock.symbol,
            alertLevel: realAlert.alertLevel,
            alertConfidence: realAlert.alertConfidence,
            preMarketChange: realAlert.preMarketChange,
            nasdaqFuturesSentiment: realAlert.nasdaqFuturesSentiment,
            newsSentiment: realAlert.newsSentiment,
            currentPrice: data.currentPrice,
            buyPrice: signal.buyPrice,
            sellPrice: signal.sellPrice,
          });

          // Send email for STRONG alerts
          if (realAlert.alertLevel === 'STRONG') {
            await notifyStrongAlert({
              symbol: stock.symbol,
              stockName: stock.stockName,
              currentPrice: data.currentPrice,
              buyPrice: signal.buyPrice,
              sellPrice: signal.sellPrice,
              stopLoss: signal.stopLoss,
              alertConfidence: realAlert.alertConfidence,
              preMarketChange: realAlert.preMarketChange,
              nasdaqFuturesSentiment: realAlert.nasdaqFuturesSentiment,
              newsSentiment: realAlert.newsSentiment,
              reasoning: realAlert.reasoning,
            });
          }

          // Track new READY signals for notification
          if (signal.status === 'READY' && !previousReadySignals.has(stock.symbol)) {
            readySignals.push({
              stockName: stock.stockName,
              symbol: stock.symbol,
              currentPrice: data.currentPrice,
              buyPrice: signal.buyPrice,
              sellPrice: signal.sellPrice,
              stopLoss: signal.stopLoss,
              reason: signal.reason,
              alertLevel: realAlert.alertLevel,
              alertConfidence: realAlert.alertConfidence,
              alertReasoning: realAlert.reasoning,
            });
          }

          console.log(`[Analysis] ${stock.symbol}: ${signal.status} - ${realAlert.alertLevel} (${realAlert.alertConfidence}%) - ${realAlert.reasoning}`);
        }

        // Send email notifications for new READY signals
        for (const signal of readySignals) {
          await notifyReadySignal(signal);
        }

        return {
          success: true,
          analyzed: symbols.length,
          readyCount: readySignals.length,
          readySignals,
        };
      } catch (error) {
        console.error('[Analysis] Error during market analysis:', error);
        throw error;
      }
    }),

    /**
     * Update real-time prices for all tracked stocks
     * Called every minute to fetch latest prices
     */
    updateRealtimePrices: publicProcedure.mutation(async () => {
      try {
        console.log('[Realtime] Updating prices...');
        const alerts = await fetchRealtimePrices();

        // Send notifications for price changes
        if (alerts.length > 0) {
          await notifyPriceAlerts(alerts);
        }

        return {
          success: true,
          alertCount: alerts.length,
          alerts: alerts.map(alert => ({
            symbol: alert.symbol,
            stockName: alert.stockName,
            previousPrice: alert.previousPrice,
            currentPrice: alert.currentPrice,
            priceChange: alert.priceChange,
            priceChangePercent: alert.priceChangePercent,
            timestamp: alert.timestamp,
          })),
        };
      } catch (error) {
        console.error('[Realtime] Error updating prices:', error);
        throw error;
      }
    }),

    /**
     * Get price history for a specific stock
     */
    getPriceHistory: publicProcedure
      .input(z.object({
        symbol: z.string(),
        limit: z.number().optional().default(100),
      }))
      .query(async ({ input }) => {
        const history = await getPriceHistory(input.symbol, input.limit);
        return history.map(h => ({
          price: h.price ? parseFloat(h.price as any) : null,
          priceChange: h.priceChange ? parseFloat(h.priceChange as any) : null,
          priceChangePercent: h.priceChangePercent ? parseFloat(h.priceChangePercent as any) : null,
          volume: h.volume,
          timestamp: h.timestamp,
        }));
      }),

    /**
     * AI-powered stock analysis
     * Provides buy/sell/hold recommendations with target prices
     */
    analyzeStock: publicProcedure
      .input(z.object({
        symbol: z.string(),
      }))
      .query(async ({ input }) => {
        try {
          const stocks = await getAllTrackedStocks();
          const stock = stocks.find(s => s.symbol === input.symbol);

          if (!stock) {
            throw new Error(`Stock ${input.symbol} not found`);
          }

          const analysis = await analyzeStockAI(
            stock.symbol,
            stock.stockName,
            stock.currentPrice ? parseFloat(stock.currentPrice as any) : 0,
            stock.movingAverage50 ? parseFloat(stock.movingAverage50 as any) : null,
            stock.rsi14 ? parseFloat(stock.rsi14 as any) : null,
            stock.supportLevel ? parseFloat(stock.supportLevel as any) : null,
            stock.resistanceLevel ? parseFloat(stock.resistanceLevel as any) : null,
            stock.trend,
            stock.currentVolume,
            stock.averageVolume
          );

          return analysis;
        } catch (error) {
          console.error(`[Analysis] Error analyzing stock:`, error);
          throw error;
        }
      }),

    /**
     * Add stock to user's watchlist
     */
    addToWatchlist: publicProcedure
      .input(z.object({
        symbol: z.string(),
        stockName: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error('Not authenticated');
        await addToWatchlist(ctx.user.id, input.symbol, input.stockName);
        return { success: true };
      }),

    /**
     * Remove stock from user's watchlist
     */
    removeFromWatchlist: publicProcedure
      .input(z.object({
        symbol: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error('Not authenticated');
        await removeFromWatchlist(ctx.user.id, input.symbol);
        return { success: true };
      }),

    /**
     * Get user's watchlist
     */
    getWatchlist: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new Error('Not authenticated');
      const watchlist = await getUserWatchlist(ctx.user.id);
      return watchlist.map(item => ({
        id: item.id,
        symbol: item.symbol,
        stockName: item.stockName,
        addedAt: item.addedAt,
      }));
    }),

    /**
     * Check if stock is in watchlist
     */
    isInWatchlist: publicProcedure
      .input(z.object({
        symbol: z.string(),
      }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error('Not authenticated');
        return await isInWatchlist(ctx.user.id, input.symbol);
      }),

    /**
     * Create price alert
     */
    createPriceAlert: publicProcedure
      .input(z.object({
        symbol: z.string(),
        alertType: z.enum(['ABOVE', 'BELOW']),
        targetPrice: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error('Not authenticated');
        await createPriceAlert(ctx.user.id, input.symbol, input.alertType, input.targetPrice);
        return { success: true };
      }),

    /**
     * Delete price alert
     */
    deletePriceAlert: publicProcedure
      .input(z.object({
        alertId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error('Not authenticated');
        await deletePriceAlert(input.alertId);
        return { success: true };
      }),

    /**
     * Get user's price alerts
     */
    getPriceAlerts: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new Error('Not authenticated');
      const alerts = await getUserPriceAlerts(ctx.user.id);
      return alerts.map(alert => ({
        id: alert.id,
        symbol: alert.symbol,
        alertType: alert.alertType,
        targetPrice: alert.targetPrice ? parseFloat(alert.targetPrice.toString()) : null,
        isActive: alert.isActive === 'true',
        lastTriggered: alert.lastTriggered,
        createdAt: alert.createdAt,
      }));
    }),

    addStock: publicProcedure
      .input(z.object({
        symbol: z.string(),
        stockName: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        console.log('[addStock] Input received:', input);
        const stock = await dbAddStock(input.symbol, input.stockName);
        return {
          success: true,
          stock: {
            id: stock.id,
            symbol: stock.symbol,
            stockName: stock.stockName,
          },
        };
      }),

    removeStock: publicProcedure
      .input(z.object({
        stockId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        await dbRemoveStock(input.stockId);
        return { success: true };
      }),

    /**
     * Get alert accuracy for a specific stock
     */
    getAlertAccuracy: publicProcedure
      .input(z.object({
        symbol: z.string(),
        days: z.number().default(7),
      }))
      .query(async ({ input }) => {
        return await getAlertAccuracy(input.symbol, input.days);
      }),

    /**
     * Get alert history for a specific stock
     */
    getAlertHistory: publicProcedure
      .input(z.object({
        symbol: z.string(),
        limit: z.number().default(100),
      }))
      .query(async ({ input }) => {
        return await getAlertHistory(input.symbol, input.limit);
      }),

    /**
     * Get accuracy metrics for all stocks
     */
    getAllStocksAccuracy: publicProcedure
      .input(z.object({
        days: z.number().default(7),
      }))
      .query(async ({ input }) => {
        const accuracyMap = await getAllStocksAccuracy(input.days);
        return Object.fromEntries(accuracyMap);
      }),

    /**
     * Get Nasdaq market data snapshot
     */
    getMarketDataSnapshot: publicProcedure.query(async () => {
      try {
        const nasdaq = await getRealNasdaqSentiment();
        return {
          nasdaqSentiment: nasdaq.sentiment,
          source: nasdaq.source,
          timestamp: new Date().toISOString(),
          dataSource: 'REAL',
        };
      } catch (error) {
        throw new Error(`Failed to fetch Nasdaq snapshot: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }),

    /**
     * Get real market data for a specific stock
     */
    getStockMarketData: publicProcedure
      .input(z.object({
        symbol: z.string(),
        currentPrice: z.number(),
      }))
      .query(async ({ input }) => {
        try {
          const [preMarketData, nasdaqData, newsData] = await Promise.allSettled([
            getRealPreMarketData(input.symbol),
            getRealNasdaqSentiment(),
            getRealNewsSentiment(input.symbol),
          ]);

          if (preMarketData.status === 'rejected' || nasdaqData.status === 'rejected') {
            throw new Error('Failed to fetch real market data - API unavailable');
          }

          const preMarket = preMarketData.value;
          const nasdaq = nasdaqData.value;
          const news = newsData.status === 'fulfilled' ? newsData.value : { sentiment: 0, isRealData: false, source: 'N/A' };

          return {
            symbol: input.symbol,
            currentPrice: input.currentPrice,
            preMarketPrice: preMarket.preMarketPrice,
            preMarketChange: preMarket.preMarketChange,
            preMarketChangePercent: preMarket.preMarketChangePercent,
            nasdaqSentiment: nasdaq.sentiment,
            newsSentiment: news.sentiment,
            lastUpdated: new Date().toLocaleTimeString('en-US', {
              timeZone: 'America/New_York',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }),
            dataSource: 'REAL',
            sources: {
              preMarket: preMarket.source,
              nasdaq: nasdaq.source,
              news: news.source,
            },
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`[ERROR] Failed to fetch real market data for ${input.symbol}:`, errorMessage);
          throw new Error(`Real market data unavailable: ${errorMessage}`);
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
