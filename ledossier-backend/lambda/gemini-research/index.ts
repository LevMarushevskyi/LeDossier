import { callBedrock, callGemini, parseAIJson } from "../shared/ai";

const PROMPT = `You are a research analyst. Search the web for information relevant to this business idea and return ONLY valid JSON (no markdown fencing, no explanation).

Business Idea:
{enrichedDescription}

Search these specific topics:
{searchQueries}

Return this exact JSON structure:
{
  "sources": [
    {
      "title": "Article or source title",
      "url": "https://source-url.com",
      "date": "2025-01-15",
      "category": "competitor|market_trend|technology|regulation|news",
      "summary": "2-3 sentence summary of how this source relates to the idea",
      "relevanceScore": 0.85
    }
  ],
  "landscapeSummary": "A 2-3 paragraph summary of the current landscape based on research findings, including key competitors, market trends, and notable developments"
}

Find 5-10 relevant sources. Focus on recent, credible sources. Each source should have a relevance score between 0.0 and 1.0.`;

const FALLBACK_PROMPT = `You are a research analyst. Based on your knowledge, provide research relevant to this business idea. Return ONLY valid JSON.

Business Idea:
{enrichedDescription}

Research topics:
{searchQueries}

Return this exact JSON structure:
{
  "sources": [
    {
      "title": "Source title",
      "url": "https://example.com",
      "date": "2025-01-01",
      "category": "market_trend",
      "summary": "Summary of relevance",
      "relevanceScore": 0.7
    }
  ],
  "landscapeSummary": "Summary of the current landscape"
}

Provide 3-5 sources based on your knowledge. Note: these are from training data, not live web results.`;

export async function searchWithGemini(
  enrichedDescription: string,
  searchQueries: string[]
): Promise<any> {
  const queriesText = searchQueries
    .map((q, i) => `${i + 1}. ${q}`)
    .join("\n");

  const prompt = PROMPT
    .replace("{enrichedDescription}", enrichedDescription)
    .replace("{searchQueries}", queriesText);

  try {
    const result = await callGemini(prompt);
    return parseAIJson(result.text, "GeminiResearch");
  } catch (err: any) {
    console.warn("Gemini failed, using Bedrock fallback for research:", err.message);
    const fallbackPrompt = FALLBACK_PROMPT
      .replace("{enrichedDescription}", enrichedDescription)
      .replace("{searchQueries}", queriesText);
    const fallbackRaw = await callBedrock(fallbackPrompt);
    return parseAIJson(fallbackRaw, "BedrockResearchFallback");
  }
}
