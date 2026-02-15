import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { randomUUID } from "crypto";
import { getUserFromEvent } from "../shared/auth";
import { success, error } from "../shared/responses";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const bedrock = new BedrockRuntimeClient({});

const IDEAS_TABLE = process.env.IDEAS_TABLE!;
const UPDATES_TABLE = process.env.UPDATES_TABLE!;
const DOSSIER_BUCKET = process.env.DOSSIER_BUCKET!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

// --- Bedrock Converse API ---

async function callBedrock(prompt: string): Promise<string> {
  const response = await bedrock.send(
    new ConverseCommand({
      modelId: "nvidia.nemotron-nano-12b-v2",
      messages: [{ role: "user", content: [{ text: prompt }] }],
    })
  );
  return response.output?.message?.content?.[0]?.text ?? "";
}

function parseAIJson(raw: string, label: string = "AI"): any {
  console.log(`[${label}] Raw response (${raw.length} chars):`, raw.substring(0, 500));

  // Strip markdown fencing
  let cleaned = raw.replace(/```json\n?|```\n?/g, "").trim();

  // Try direct parse first
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    // Try to extract JSON object from surrounding text
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (e: any) {
        console.error(`[${label}] Failed to parse extracted JSON:`, e.message);
        console.error(`[${label}] Full raw response:`, raw);
        throw new Error(`${label}: Could not parse AI response as JSON`);
      }
    }
    console.error(`[${label}] No JSON object found in response:`, raw);
    throw new Error(`${label}: No JSON found in AI response`);
  }
}

// --- Gemini API ---

async function callGemini(prompt: string): Promise<any> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ googleSearch: {} }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return { text, groundingMetadata: data.candidates?.[0]?.groundingMetadata };
}

// --- Pipeline Functions ---

async function analyzeIdea(
  name: string,
  description: string
): Promise<any> {
  const prompt = `You are a business idea analyst. Analyze the following idea and return ONLY valid JSON (no markdown fencing, no explanation).

Idea Name: ${name}
Idea Description: ${description}

Return this exact JSON structure:
{
  "enrichedDescription": "A detailed 2-3 paragraph description expanding on the core idea, its value proposition, and potential impact",
  "domain": "The primary industry/domain (e.g., 'HealthTech', 'EdTech', 'FinTech')",
  "targetMarket": "Description of the target market and audience",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "searchQueries": [
    "specific search query 1 about competitors or market",
    "specific search query 2 about technology or trends",
    "specific search query 3 about target audience",
    "specific search query 4 about regulatory or industry news"
  ],
  "keyAssumptions": [
    "Key assumption 1 that this idea relies on",
    "Key assumption 2 that needs validation",
    "Key assumption 3 about the market"
  ]
}`;

  const raw = await callBedrock(prompt);
  return parseAIJson(raw, "IdeaAnalysis");
}

async function searchWithGemini(
  enrichedDescription: string,
  searchQueries: string[]
): Promise<any> {
  const queriesText = searchQueries
    .map((q, i) => `${i + 1}. ${q}`)
    .join("\n");

  const prompt = `You are a research analyst. Search the web for information relevant to this business idea and return ONLY valid JSON (no markdown fencing, no explanation).

Business Idea:
${enrichedDescription}

Search these specific topics:
${queriesText}

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

  try {
    const result = await callGemini(prompt);
    return parseAIJson(result.text, "GeminiResearch");
  } catch (err: any) {
    console.warn("Gemini failed, using Bedrock fallback for research:", err.message);
    const fallbackPrompt = `You are a research analyst. Based on your knowledge, provide research relevant to this business idea. Return ONLY valid JSON.

Business Idea:
${enrichedDescription}

Research topics:
${queriesText}

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
    const fallbackRaw = await callBedrock(fallbackPrompt);
    return parseAIJson(fallbackRaw, "BedrockResearchFallback");
  }
}

async function generateSWOT(
  ideaAnalysis: any,
  researchResults: any
): Promise<{ swotJson: any; swotMarkdown: string }> {
  const prompt = `You are a strategic business analyst. Generate a SWOT analysis based on the idea analysis and research below. Return ONLY valid JSON (no markdown fencing, no explanation).

IDEA ANALYSIS:
${JSON.stringify(ideaAnalysis, null, 2)}

RESEARCH RESULTS:
${JSON.stringify(researchResults, null, 2)}

Return this exact JSON structure:
{
  "swot": {
    "strengths": [
      "Specific strength 1 based on analysis",
      "Specific strength 2 based on analysis",
      "Specific strength 3 based on analysis"
    ],
    "weaknesses": [
      "Specific weakness 1 based on analysis",
      "Specific weakness 2 based on analysis",
      "Specific weakness 3 based on analysis"
    ],
    "opportunities": [
      "Specific opportunity 1 based on research",
      "Specific opportunity 2 based on research",
      "Specific opportunity 3 based on research"
    ],
    "threats": [
      "Specific threat 1 based on research",
      "Specific threat 2 based on research",
      "Specific threat 3 based on research"
    ]
  },
  "confidenceScore": 0.65,
  "confidenceRationale": "Explanation of why this confidence level was assigned. 0.3-0.4 = questionable, 0.5-0.6 = plausible, 0.7-0.8 = strong evidence, 0.9+ = exceptionally rare",
  "recommendedNextStep": "The single most impactful next step the founder should take"
}

Be specific, not generic. Reference actual findings from the research. Calibrate the confidence score carefully — most ideas should score 0.4-0.7.`;

  const raw = await callBedrock(prompt);
  const swotJson = parseAIJson(raw, "SWOTGeneration");

  const swotMarkdown = `# SWOT Analysis

## Strengths
${swotJson.swot.strengths.map((s: string) => `- ${s}`).join("\n")}

## Weaknesses
${swotJson.swot.weaknesses.map((w: string) => `- ${w}`).join("\n")}

## Opportunities
${swotJson.swot.opportunities.map((o: string) => `- ${o}`).join("\n")}

## Threats
${swotJson.swot.threats.map((t: string) => `- ${t}`).join("\n")}

---

**Confidence Score**: ${swotJson.confidenceScore}
**Rationale**: ${swotJson.confidenceRationale}
**Recommended Next Step**: ${swotJson.recommendedNextStep}
`;

  return { swotJson, swotMarkdown };
}

// --- S3 Helpers ---

async function storeToS3(key: string, body: string, contentType: string) {
  await s3.send(
    new PutObjectCommand({
      Bucket: DOSSIER_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

// --- Main Handler ---

export async function handler(event: any) {
  try {
    // 1. Parse input
    const body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    const { name, description } = body || {};

    if (!name || !description) {
      return error("Both 'name' and 'description' are required", 400);
    }

    // 2. Authenticate
    const user = await getUserFromEvent(event);

    // 3. Generate IDs
    const ideaId = randomUUID();
    const now = new Date().toISOString();

    // 4. Store raw idea in DynamoDB
    await ddb.send(
      new PutCommand({
        TableName: IDEAS_TABLE,
        Item: {
          userId: user.userId,
          ideaId,
          title: name,
          rawInput: description,
          status: "stasis",
          createdAt: now,
          lastViewedAt: now,
          lastUpdatedAt: now,
          alertSensitivity: "balanced",
          tags: [],
          confidenceScore: 0,
          swot: null,
        },
      })
    );

    // 5. Idea Analysis (Bedrock)
    const ideaAnalysis = await analyzeIdea(name, description);
    await storeToS3(
      `ideas/${ideaId}/analysis.json`,
      JSON.stringify(ideaAnalysis, null, 2),
      "application/json"
    );

    // 6. Research (Gemini with grounding)
    const researchResults = await searchWithGemini(
      ideaAnalysis.enrichedDescription,
      ideaAnalysis.searchQueries
    );
    await storeToS3(
      `ideas/${ideaId}/research.json`,
      JSON.stringify(researchResults, null, 2),
      "application/json"
    );

    // 7. SWOT Generation (Bedrock)
    const { swotJson, swotMarkdown } = await generateSWOT(
      ideaAnalysis,
      researchResults
    );
    await storeToS3(
      `ideas/${ideaId}/swot.md`,
      swotMarkdown,
      "text/markdown"
    );

    // 8. Update DynamoDB with results
    await ddb.send(
      new UpdateCommand({
        TableName: IDEAS_TABLE,
        Key: { userId: user.userId, ideaId },
        UpdateExpression:
          "SET #swot = :swot, confidenceScore = :score, tags = :tags, #status = :status, lastUpdatedAt = :now",
        ExpressionAttributeNames: {
          "#swot": "swot",
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":swot": swotJson.swot,
          ":score": swotJson.confidenceScore,
          ":tags": ideaAnalysis.tags || [],
          ":status": "active",
          ":now": new Date().toISOString(),
        },
      })
    );

    // 9. Log update
    await ddb.send(
      new PutCommand({
        TableName: UPDATES_TABLE,
        Item: {
          ideaId,
          timestamp: now,
          type: "creation",
          summary: `Idea "${name}" created and analyzed`,
        },
      })
    );

    // 10. Return full dossier
    return success({
      ideaId,
      title: name,
      rawInput: description,
      status: "active",
      createdAt: now,
      analysis: ideaAnalysis,
      research: researchResults,
      swot: swotJson,
      user: { userId: user.userId, name: user.name },
    });
  } catch (err: any) {
    console.error("Pipeline error:", err);
    return error(`Pipeline failed: ${err.message}`, 500);
  }
}
