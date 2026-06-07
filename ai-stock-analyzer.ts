import { invokeLLM } from "./_core/llm";

export interface StockAnalysisResult {
  symbol: string;
  stockName: string;
  currentPrice: number;
  currentTrend: string;
  technicalAnalysis: string;
  
  // Buy recommendation
  buyRecommendation: {
    action: "BUY" | "WAIT" | "AVOID";
    targetPrice: number;
    reasoning: string;
    confidence: number; // 0-100
    timeframe: string; // e.g., "1-2 weeks", "3-5 days"
  };
  
  // Sell recommendation
  sellRecommendation: {
    action: "SELL" | "HOLD" | "WAIT";
    targetPrice: number;
    reasoning: string;
    confidence: number; // 0-100
    timeframe: string;
  };
  
  // Immediate action
  immediateAction: {
    recommendation: "BUY" | "SELL" | "HOLD";
    reasoning: string;
    riskLevel: "LOW" | "MEDIUM" | "HIGH";
    potentialGain: string; // e.g., "5-8%"
    potentialLoss: string; // e.g., "2-3%"
  };
  
  keyFactors: string[];
  newsImpact: string;
  overallSentiment: "BULLISH" | "NEUTRAL" | "BEARISH";
}

export async function analyzeStockAI(
  symbol: string,
  stockName: string,
  currentPrice: number,
  movingAverage50: number | null,
  rsi14: number | null,
  supportLevel: number | null,
  resistanceLevel: number | null,
  trend: string | null,
  currentVolume: number | null,
  averageVolume: number | null
): Promise<StockAnalysisResult> {
  const technicalContext = `
Stock: ${symbol} (${stockName})
Current Price: $${currentPrice.toFixed(2)}
50-Day MA: ${movingAverage50 ? `$${movingAverage50.toFixed(2)}` : "N/A"}
RSI(14): ${rsi14 ? rsi14.toFixed(2) : "N/A"}
Support Level: ${supportLevel ? `$${supportLevel.toFixed(2)}` : "N/A"}
Resistance Level: ${resistanceLevel ? `$${resistanceLevel.toFixed(2)}` : "N/A"}
Trend: ${trend || "UNKNOWN"}
Volume Ratio: ${currentVolume && averageVolume ? (currentVolume / averageVolume).toFixed(2) + "x" : "N/A"}
  `.trim();

  const prompt = `You are an expert financial analyst. Analyze this stock and provide specific trading recommendations.

${technicalContext}

Provide a detailed analysis with:
1. Current technical trend assessment
2. BUY recommendation: When should someone buy? What's the target price? Why? (confidence 0-100)
3. SELL recommendation: When should someone sell? What's the target price? Why? (confidence 0-100)
4. IMMEDIATE ACTION: Right now, should they BUY, SELL, or HOLD? Why? What's the risk level (LOW/MEDIUM/HIGH)?
5. Key factors affecting the price
6. News/sentiment impact
7. Overall sentiment (BULLISH/NEUTRAL/BEARISH)

Format your response as JSON with this exact structure:
{
  "technicalAnalysis": "Brief technical analysis",
  "buyRecommendation": {
    "action": "BUY|WAIT|AVOID",
    "targetPrice": number,
    "reasoning": "Why this target price and action",
    "confidence": number,
    "timeframe": "e.g., 1-2 weeks"
  },
  "sellRecommendation": {
    "action": "SELL|HOLD|WAIT",
    "targetPrice": number,
    "reasoning": "Why this target price and action",
    "confidence": number,
    "timeframe": "e.g., 3-5 days"
  },
  "immediateAction": {
    "recommendation": "BUY|SELL|HOLD",
    "reasoning": "Why this action right now",
    "riskLevel": "LOW|MEDIUM|HIGH",
    "potentialGain": "e.g., 5-8%",
    "potentialLoss": "e.g., 2-3%"
  },
  "keyFactors": ["factor1", "factor2", "factor3"],
  "newsImpact": "Brief description of recent news impact",
  "overallSentiment": "BULLISH|NEUTRAL|BEARISH"
}`;

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "You are an expert financial analyst. Provide accurate trading recommendations based on technical analysis. Always respond with valid JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "stock_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              technicalAnalysis: { type: "string" },
              buyRecommendation: {
                type: "object",
                properties: {
                  action: { type: "string", enum: ["BUY", "WAIT", "AVOID"] },
                  targetPrice: { type: "number" },
                  reasoning: { type: "string" },
                  confidence: { type: "number" },
                  timeframe: { type: "string" }
                },
                required: ["action", "targetPrice", "reasoning", "confidence", "timeframe"]
              },
              sellRecommendation: {
                type: "object",
                properties: {
                  action: { type: "string", enum: ["SELL", "HOLD", "WAIT"] },
                  targetPrice: { type: "number" },
                  reasoning: { type: "string" },
                  confidence: { type: "number" },
                  timeframe: { type: "string" }
                },
                required: ["action", "targetPrice", "reasoning", "confidence", "timeframe"]
              },
              immediateAction: {
                type: "object",
                properties: {
                  recommendation: { type: "string", enum: ["BUY", "SELL", "HOLD"] },
                  reasoning: { type: "string" },
                  riskLevel: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
                  potentialGain: { type: "string" },
                  potentialLoss: { type: "string" }
                },
                required: ["recommendation", "reasoning", "riskLevel", "potentialGain", "potentialLoss"]
              },
              keyFactors: { type: "array", items: { type: "string" } },
              newsImpact: { type: "string" },
              overallSentiment: { type: "string", enum: ["BULLISH", "NEUTRAL", "BEARISH"] }
            },
            required: [
              "technicalAnalysis",
              "buyRecommendation",
              "sellRecommendation",
              "immediateAction",
              "keyFactors",
              "newsImpact",
              "overallSentiment"
            ]
          }
        }
      }
    });

    // Parse the response
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No content in LLM response");
    }

    const analysisData = typeof content === "string" ? JSON.parse(content) : content;

    return {
      symbol,
      stockName,
      currentPrice,
      currentTrend: trend || "UNKNOWN",
      technicalAnalysis: analysisData.technicalAnalysis,
      buyRecommendation: analysisData.buyRecommendation,
      sellRecommendation: analysisData.sellRecommendation,
      immediateAction: analysisData.immediateAction,
      keyFactors: analysisData.keyFactors,
      newsImpact: analysisData.newsImpact,
      overallSentiment: analysisData.overallSentiment
    };
  } catch (error) {
    console.error(`[AI Analysis] Error analyzing ${symbol}:`, error);
    throw error;
  }
}
