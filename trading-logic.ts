/**
 * Trading logic module that applies trading rules and generates signals
 */

export interface MarketData {
  currentPrice: number;
  movingAverage50: number;
  rsi14: number;
  supportLevel: number;
  resistanceLevel: number;
  averageVolume: number;
  currentVolume: number;
}

export interface TradingSignal {
  trend: "UPTREND" | "DOWNTREND";
  buyPrice: number;
  sellPrice: number;
  stopLoss: number; // Stop Loss price level (4% below buy price)
  status: "READY" | "WAIT";
  reason: string;
}

/**
 * Apply trading rules to generate buy/sell signals
 * 
 * RULE A — Trend: If Current Price > 50 Day MA → UPTREND, else DOWNTREND
 * RULE B — Volume: Only valid if Current Volume > Average Volume
 * RULE C — RSI: Buy zone 50-65, avoid if RSI > 75 (overbought) or < 45 (weak)
 * RULE D — Trading Plan:
 *   If UPTREND AND Volume confirmed AND RSI in buy zone:
 *     Buy Price = 1-2% above Support Level
 *     Sell Price = near Resistance Level
 *     Stop Loss = 4% below Buy Price
 *     Status = READY
 *   Else: Status = WAIT
 */
export function generateTradingSignal(data: MarketData): TradingSignal {
  const reasons: string[] = [];

  // RULE A — Trend Analysis
  const trend: "UPTREND" | "DOWNTREND" = data.currentPrice > data.movingAverage50 ? "UPTREND" : "DOWNTREND";
  const trendDiff = ((data.currentPrice - data.movingAverage50) / data.movingAverage50) * 100;
  reasons.push(`Trend: ${trend} (Price ${data.currentPrice.toFixed(2)} vs MA50 ${data.movingAverage50.toFixed(2)}, ${trendDiff > 0 ? '+' : ''}${trendDiff.toFixed(2)}%)`);

  // RULE B — Volume Confirmation
  const volumeConfirmed = data.currentVolume > data.averageVolume;
  const volumeRatio = (data.currentVolume / data.averageVolume).toFixed(2);
  reasons.push(`Volume: ${volumeConfirmed ? '✓ Confirmed' : '✗ Weak'} (Current ${data.currentVolume} vs Avg ${data.averageVolume}, ratio ${volumeRatio}x)`);

  // RULE C — RSI Validation
  const rsiInBuyZone = data.rsi14 >= 50 && data.rsi14 <= 65;
  const rsiOverbought = data.rsi14 > 75;
  const rsiWeak = data.rsi14 < 45;
  let rsiStatus = "Neutral";
  if (rsiOverbought) rsiStatus = "Overbought (>75)";
  else if (rsiWeak) rsiStatus = "Weak (<45)";
  else if (rsiInBuyZone) rsiStatus = "Buy Zone (50-65)";
  reasons.push(`RSI(14): ${data.rsi14.toFixed(2)} - ${rsiStatus}`);

  // RULE D — Trading Plan
  const isReady = trend === "UPTREND" && volumeConfirmed && rsiInBuyZone && !rsiOverbought && !rsiWeak;

  let buyPrice = 0;
  let sellPrice = 0;
  let stopLoss = 0;

  if (isReady) {
    // Buy Price: 5% below current price (good entry point for dip)
    buyPrice = data.currentPrice * 0.95;
    // Sell Price: 8% above current price (good profit target)
    sellPrice = data.currentPrice * 1.08;
    // Stop Loss: 10% below current price (safety exit to limit losses)
    stopLoss = data.currentPrice * 0.90;
    reasons.push(`Trading Plan: Buy ${buyPrice.toFixed(2)} | Sell ${sellPrice.toFixed(2)} | Stop Loss ${stopLoss.toFixed(2)}`);
  } else {
    const failReasons: string[] = [];
    if (trend !== "UPTREND") failReasons.push("Not in uptrend");
    if (!volumeConfirmed) failReasons.push("Volume not confirmed");
    if (!rsiInBuyZone) failReasons.push("RSI not in buy zone");
    if (rsiOverbought) failReasons.push("RSI overbought");
    if (rsiWeak) failReasons.push("RSI too weak");
    reasons.push(`Status: WAIT - ${failReasons.join(", ")}`);
  }

  return {
    trend,
    buyPrice,
    sellPrice,
    stopLoss,
    status: isReady ? "READY" : "WAIT",
    reason: reasons.join(" | "),
  };
}
