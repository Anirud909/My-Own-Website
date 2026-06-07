import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import axios from 'axios';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || 'demo';
const POLYGON_BASE_URL = 'https://api.polygon.io';
const YAHOO_FINANCE_API = 'https://query1.finance.yahoo.com/v10/finance/quoteSummary';

interface PriceUpdate {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  timestamp: string;
  nasdaqPrice?: number;
  nasdaqChange?: number;
  preMarketPrice?: number;
  preMarketChange?: number;
}

interface ClientData {
  symbols: Set<string>;
  lastUpdate: Record<string, number>;
}

const clientData = new WeakMap<WebSocket, ClientData>();
let wss: WebSocketServer;
let updateInterval: NodeJS.Timeout | null = null;

/**
 * Convert UTC timestamp to India timezone (IST)
 */
function toIST(date: Date = new Date()): string {
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}


/**
 * Determine if US is in Daylight Saving Time (EDT) or Standard Time (EST)
 */
function isEDT(date: Date = new Date()): boolean {
  const year = date.getFullYear();
  // DST starts: second Sunday of March at 2:00 AM
  // DST ends: first Sunday of November at 2:00 AM
  const marchSecondSunday = new Date(year, 2, 8);
  while (marchSecondSunday.getDay() !== 0) {
    marchSecondSunday.setDate(marchSecondSunday.getDate() + 1);
  }
  const novemberFirstSunday = new Date(year, 10, 1);
  while (novemberFirstSunday.getDay() !== 0) {
    novemberFirstSunday.setDate(novemberFirstSunday.getDate() + 1);
  }
  return date >= marchSecondSunday && date < novemberFirstSunday;
}

/**
 * Get market status with timezone info
 */
function getMarketStatus(): { isOpen: boolean; timezone: string; isDST: boolean } {
  const now = new Date();
  const estTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hours = estTime.getHours();
  const day = estTime.getDay();
  
  // Market is open Mon-Fri 9:30 AM - 4:00 PM EST/EDT
  const isOpen = day >= 1 && day <= 5 && hours >= 9 && hours < 16;
  const isDST = isEDT();
  const timezone = isDST ? 'EDT' : 'EST';
  
  return { isOpen, timezone, isDST };
}

/**
 * Fetch live price from Polygon.io
 */
async function getLivePrice(symbol: string): Promise<Partial<PriceUpdate> | null> {
  try {
    const response = await axios.get(`${POLYGON_BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}`, {
      params: {
        apiKey: POLYGON_API_KEY,
      },
      timeout: 5000,
    });

    const data = response.data?.results?.[0];
    if (!data) return null;

    const price = data.lastQuote?.ask || data.lastTrade?.p || 0;
    const prevClose = data.prevClose || price * 0.98;
    const change = price - prevClose;
    const changePercent = (change / prevClose) * 100;

    return {
      symbol,
      price,
      change,
      changePercent,
      timestamp: toIST(),
    };
  } catch (error) {
    console.warn(`[WebSocket] Failed to fetch price for ${symbol}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Fetch Nasdaq futures data
 */
async function getNasdaqData(): Promise<{ price: number; change: number } | null> {
  try {
    const response = await axios.get(`${POLYGON_BASE_URL}/v2/snapshot/locale/us/markets/indices/tickers/%5EGSPC`, {
      params: {
        apiKey: POLYGON_API_KEY,
      },
      timeout: 5000,
    });

    const data = response.data?.results?.[0];
    if (!data) return null;

    const price = data.lastQuote?.ask || data.lastTrade?.p || 0;
    const prevClose = data.prevClose || price * 0.98;
    const change = price - prevClose;

    return { price, change };
  } catch (error) {
    console.warn('[WebSocket] Failed to fetch Nasdaq data:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Fetch pre-market data
 */
async function getPreMarketData(symbol: string): Promise<{ price: number; change: number } | null> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const response = await axios.get(`${POLYGON_BASE_URL}/v1/open-close/${symbol}/${today}`, {
      params: {
        adjusted: true,
        apiKey: POLYGON_API_KEY,
      },
      timeout: 5000,
    });

    const data = response.data;
    if (data.status !== 'OK') return null;

    const price = data.c || 0;
    const prevClose = data.o || price * 0.98;
    const change = price - prevClose;

    return { price, change };
  } catch (error) {
    console.warn(`[WebSocket] Failed to fetch pre-market for ${symbol}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Broadcast price updates to all connected clients
 */
async function broadcastPriceUpdates() {
  if (!wss) return;

  const clients = wss.clients;
  if (clients.size === 0) return;

  // Collect all unique symbols from all clients
  const allSymbols = new Set<string>();
  clients.forEach((client) => {
    const data = clientData.get(client);
    if (data) {
      data.symbols.forEach((symbol) => allSymbols.add(symbol));
    }
  });

  if (allSymbols.size === 0) return;

  // Fetch all prices in parallel
  const priceUpdates: Record<string, PriceUpdate> = {};
  const nasdaqData = await getNasdaqData();

  const pricePromises = Array.from(allSymbols).map(async (symbol) => {
    const priceData = await getLivePrice(symbol);
    const preMarketData = await getPreMarketData(symbol);

    if (priceData) {
      priceUpdates[symbol] = {
        ...priceData,
        nasdaqPrice: nasdaqData?.price,
        nasdaqChange: nasdaqData?.change,
        preMarketPrice: preMarketData?.price,
        preMarketChange: preMarketData?.change,
      } as PriceUpdate;
    }
  });

  await Promise.all(pricePromises);

  // Send updates to each client for their subscribed symbols
  clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      const data = clientData.get(client);
      if (data) {
        const updates = Array.from(data.symbols)
          .filter((symbol) => priceUpdates[symbol])
          .map((symbol) => priceUpdates[symbol]);

        if (updates.length > 0) {
          client.send(
            JSON.stringify({
              type: 'price_update',
              data: updates,
              timestamp: toIST(),
            }),
          );
        }
      }
    }
  });
}

/**
 * Initialize WebSocket server
 */
export function initializeWebSocketServer(httpServer: Server) {
  wss = new WebSocketServer({ noServer: true });

  // Handle HTTP upgrade requests for WebSocket
  httpServer.on('upgrade', (request, socket, head) => {
    if (request.url === '/api/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws: any) => {
    console.log('[WebSocket] New client connected');

    // Initialize client data
    clientData.set(ws, {
      symbols: new Set(),
      lastUpdate: {},
    });

    // Handle incoming messages
    ws.on('message', (message: string) => {
      try {
        const data = JSON.parse(message);

        if (data.type === 'subscribe') {
          const clientInfo = clientData.get(ws);
          if (clientInfo) {
            data.symbols.forEach((symbol: string) => {
              clientInfo.symbols.add(symbol.toUpperCase());
            });
            console.log(`[WebSocket] Client subscribed to: ${data.symbols.join(', ')}`);

            // Send confirmation
            ws.send(
              JSON.stringify({
                type: 'subscribed',
                symbols: Array.from(clientInfo.symbols),
              }),
            );
          }
        } else if (data.type === 'unsubscribe') {
          const clientInfo = clientData.get(ws);
          if (clientInfo) {
            data.symbols.forEach((symbol: string) => {
              clientInfo.symbols.delete(symbol.toUpperCase());
            });
          }
        }
      } catch (error) {
        console.error('[WebSocket] Error parsing message:', error);
      }
    });

    // Handle client disconnect
    ws.on('close', () => {
      console.log('[WebSocket] Client disconnected');
      clientData.delete(ws);
    });

    // Handle errors
    ws.on('error', (error: any) => {
      console.error('[WebSocket] Client error:', error);
    });
  });

  // Start broadcasting price updates every 2 seconds
  if (!updateInterval) {
    updateInterval = setInterval(broadcastPriceUpdates, 2000);
    console.log('[WebSocket] Price update interval started (every 2 seconds)');
  }

  console.log('[WebSocket] Server initialized');
}

/**
 * Cleanup WebSocket server
 */
export function closeWebSocketServer() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }

  if (wss) {
    wss.clients.forEach((client: any) => {
      client.close();
    });
    wss.close();
  }
}
