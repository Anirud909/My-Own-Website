import { describe, expect, it } from "vitest";
import { generateTradingSignal, MarketData } from "./trading-logic";

describe("Trading Logic", () => {
  describe("generateTradingSignal", () => {
    it("should return READY status when all conditions are met", () => {
      const data: MarketData = {
        currentPrice: 150,
        movingAverage50: 140,
        rsi14: 55,
        supportLevel: 140,
        resistanceLevel: 160,
        averageVolume: 1000000,
        currentVolume: 1500000,
      };

      const signal = generateTradingSignal(data);

      expect(signal.status).toBe("READY");
      expect(signal.trend).toBe("UPTREND");
      expect(signal.buyPrice).toBeGreaterThan(data.supportLevel);
      expect(signal.sellPrice).toBeLessThan(data.resistanceLevel);
      expect(signal.stopLoss).toBeLessThan(signal.buyPrice);
      expect(signal.reason).toContain("UPTREND");
      expect(signal.reason).toContain("Confirmed");
      expect(signal.reason).toContain("Buy Zone");
    });

    it("should return WAIT when price is below 50-day MA (downtrend)", () => {
      const data: MarketData = {
        currentPrice: 130,
        movingAverage50: 140,
        rsi14: 55,
        supportLevel: 120,
        resistanceLevel: 150,
        averageVolume: 1000000,
        currentVolume: 1500000,
      };

      const signal = generateTradingSignal(data);

      expect(signal.status).toBe("WAIT");
      expect(signal.trend).toBe("DOWNTREND");
      expect(signal.reason).toContain("DOWNTREND");
    });

    it("should return WAIT when volume is not confirmed", () => {
      const data: MarketData = {
        currentPrice: 150,
        movingAverage50: 140,
        rsi14: 55,
        supportLevel: 140,
        resistanceLevel: 160,
        averageVolume: 1000000,
        currentVolume: 500000, // Below average
      };

      const signal = generateTradingSignal(data);

      expect(signal.status).toBe("WAIT");
      expect(signal.reason).toContain("Weak");
    });

    it("should return WAIT when RSI is overbought (>75)", () => {
      const data: MarketData = {
        currentPrice: 150,
        movingAverage50: 140,
        rsi14: 80,
        supportLevel: 140,
        resistanceLevel: 160,
        averageVolume: 1000000,
        currentVolume: 1500000,
      };

      const signal = generateTradingSignal(data);

      expect(signal.status).toBe("WAIT");
      expect(signal.reason).toContain("Overbought");
    });

    it("should return WAIT when RSI is too weak (<45)", () => {
      const data: MarketData = {
        currentPrice: 150,
        movingAverage50: 140,
        rsi14: 40,
        supportLevel: 140,
        resistanceLevel: 160,
        averageVolume: 1000000,
        currentVolume: 1500000,
      };

      const signal = generateTradingSignal(data);

      expect(signal.status).toBe("WAIT");
      expect(signal.reason).toContain("Weak");
    });

    it("should return WAIT when RSI is outside buy zone (50-65)", () => {
      const data: MarketData = {
        currentPrice: 150,
        movingAverage50: 140,
        rsi14: 70,
        supportLevel: 140,
        resistanceLevel: 160,
        averageVolume: 1000000,
        currentVolume: 1500000,
      };

      const signal = generateTradingSignal(data);

      expect(signal.status).toBe("WAIT");
      expect(signal.reason).toContain("not in buy zone");
    });

    it("should calculate correct buy price (1-2% above support)", () => {
      const data: MarketData = {
        currentPrice: 150,
        movingAverage50: 140,
        rsi14: 55,
        supportLevel: 140,
        resistanceLevel: 160,
        averageVolume: 1000000,
        currentVolume: 1500000,
      };

      const signal = generateTradingSignal(data);

      const expectedBuyPrice = data.supportLevel * 1.015;
      expect(signal.buyPrice).toBeCloseTo(expectedBuyPrice, 2);
    });

    it("should calculate correct stop loss (4% below buy price)", () => {
      const data: MarketData = {
        currentPrice: 150,
        movingAverage50: 140,
        rsi14: 55,
        supportLevel: 140,
        resistanceLevel: 160,
        averageVolume: 1000000,
        currentVolume: 1500000,
      };

      const signal = generateTradingSignal(data);

      const expectedStopLoss = signal.buyPrice * 0.90;
      expect(signal.stopLoss).toBeCloseTo(expectedStopLoss, 1);
    });

    it("should include detailed reason with all metrics", () => {
      const data: MarketData = {
        currentPrice: 150,
        movingAverage50: 140,
        rsi14: 55,
        supportLevel: 140,
        resistanceLevel: 160,
        averageVolume: 1000000,
        currentVolume: 1500000,
      };

      const signal = generateTradingSignal(data);

      expect(signal.reason).toContain("Trend:");
      expect(signal.reason).toContain("Volume:");
      expect(signal.reason).toContain("RSI(14):");
      expect(signal.reason).toContain("|");
    });
  });
});
