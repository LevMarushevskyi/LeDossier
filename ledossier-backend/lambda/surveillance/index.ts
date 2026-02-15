import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { callBedrock, parseAIJson } from "../shared/ai";
import { searchWithGemini } from "../gemini-research";
import { storeToS3, getFromS3 } from "../shared/storage";
import { success } from "../shared/responses";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const IDEAS_TABLE = process.env.IDEAS_TABLE!;
const UPDATES_TABLE = process.env.UPDATES_TABLE!;

const SWOT_UPDATE_PROMPT = `You are a strategic business analyst performing a periodic surveillance update. Compare new research against the existing SWOT analysis and produce an updated assessment with an intelligence report. Return ONLY valid JSON (no markdown fencing, no explanation).

EXISTING IDEA ANALYSIS:
{ideaAnalysis}

EXISTING SWOT ANALYSIS:
{existingSWOT}

EXISTING CONFIDENCE SCORE: {existingConfidence}

PREVIOUS SURVEILLANCE REPORT:
{previousReport}

NEW RESEARCH RESULTS:
{newResearch}

Instructions:
- Keep existing SWOT entries that are still valid and supported by evidence
- Add new entries based on the fresh research findings
- Remove entries that are now outdated or contradicted by new evidence
- If a previous surveillance report exists, fold its relevant intelligence into the updated SWOT entries
- Adjust the confidence score up or down based on whether new research strengthens or weakens the idea's viability
- Provide a concise changeSummary describing what's new or different
- Generate a surveillance report with two parts:
  1. "discoveries": An array of real-world findings from the research. Each discovery should describe what was found in the real world (a news event, market shift, competitor move, regulatory change, technology trend, etc.) and then explain specifically how it impacts this idea — positively or negatively. These should read like intelligence briefings, not SWOT bullets.
  2. "actionPlan": A detailed article (3-5 paragraphs) written in a direct, advisory tone that lays out the best course of action to address the discoveries. It should be specific and actionable — what to do first, what to prioritize, what to watch out for, and how to position the idea given the current landscape.

Return this exact JSON structure:
{
  "swot": {
    "strengths": ["Specific strength 1", "Specific strength 2", "Specific strength 3"],
    "weaknesses": ["Specific weakness 1", "Specific weakness 2", "Specific weakness 3"],
    "opportunities": ["Specific opportunity 1", "Specific opportunity 2", "Specific opportunity 3"],
    "threats": ["Specific threat 1", "Specific threat 2", "Specific threat 3"]
  },
  "confidenceScore": 0.65,
  "confidenceRationale": "Explanation of confidence level and how it changed",
  "changeSummary": "2-3 sentences describing what changed since the last assessment",
  "recommendedNextStep": "The single most impactful next step based on updated intelligence",
  "report": {
    "headline": "One-line summary of what changed (10 words max)",
    "viabilityDirection": "up|down|stable",
    "discoveries": [
      {
        "finding": "What was discovered in the real world — a specific event, trend, data point, or competitive move sourced from the research",
        "impact": "How this specifically affects the idea — is it a tailwind, headwind, or something to adapt to, and why"
      }
    ],
    "actionPlan": "A 3-5 paragraph article in direct advisory tone. Start with the most pressing concern or opportunity. Lay out concrete steps: what to do first, what to prioritize next, what to watch for. Reference specific discoveries. End with a forward-looking statement on positioning. Write as if briefing a founder who needs to make decisions this week."
  }
}

Generate 3-6 discoveries. Be specific, not generic — reference actual findings from the new research. The actionPlan should be substantial (at least 200 words) and read like a strategy memo, not bullet points. Calibrate the confidence score carefully — most ideas should score 0.4-0.7.`;

const STACK_REPORT_PROMPT = `You are a strategic intelligence analyst. The user has an UNREAD surveillance report from a previous sweep. New research has come in since then. Your job is to consolidate the previous unread report with the new findings into a single updated report with the 3-4 most important insights.

Do NOT update the SWOT analysis — it stays unchanged. Only produce a consolidated report.

IDEA TITLE: {ideaTitle}

IDEA ANALYSIS:
{ideaAnalysis}

PREVIOUS UNREAD REPORT:
{previousReport}

NEW RESEARCH RESULTS:
{newResearch}

Instructions:
- Review both the previous unread report's discoveries and the new research
- Select the 3-4 most significant and actionable insights across both sources
- If a new finding supersedes or updates a previous discovery, use the newer version
- If a previous discovery is still the most important, keep it
- Write a new actionPlan that accounts for all selected discoveries
- Update the headline to reflect the consolidated intelligence
- Adjust viabilityDirection based on the overall picture

Return ONLY valid JSON (no markdown fencing, no explanation):
{
  "report": {
    "headline": "One-line summary of the consolidated intelligence (10 words max)",
    "viabilityDirection": "up|down|stable",
    "discoveries": [
      {
        "finding": "What was discovered — a specific event, trend, data point, or competitive move",
        "impact": "How this specifically affects the idea"
      }
    ],
    "actionPlan": "A 3-5 paragraph article in direct advisory tone consolidating the best course of action across all discoveries. Write as if briefing a founder who needs to make decisions this week."
  },
  "confidenceDelta": 0.05
}

Generate exactly 3-4 discoveries — only the most impactful ones. The actionPlan should be at least 200 words. Be specific, reference actual findings.`;

const DISCOVERY_RETRY_PROMPT = `You are a business intelligence analyst. Based on the research below, identify 3-4 significant real-world discoveries relevant to this business idea. Return ONLY valid JSON (no markdown fencing).

IDEA: {ideaTitle}

CONTEXT: {changeSummary}

RESEARCH:
{newResearch}

Return this exact JSON:
{
  "discoveries": [
    {
      "finding": "What was discovered — a specific event, trend, data point, or competitive move",
      "impact": "How this specifically affects the idea — is it a tailwind, headwind, or something to adapt to"
    }
  ],
  "actionPlan": "A 3-5 paragraph article in direct advisory tone. Lay out concrete steps based on these discoveries. Write as if briefing a founder who needs to make decisions this week."
}

Generate exactly 3-4 discoveries. Be specific, reference actual findings from the research. The actionPlan should be at least 200 words.`;

function formatSWOTMarkdown(swotData: any): string {
  return `# SWOT Analysis (Surveillance Update)

## Strengths
${swotData.swot.strengths.map((s: string) => `- ${s}`).join("\n")}

## Weaknesses
${swotData.swot.weaknesses.map((w: string) => `- ${w}`).join("\n")}

## Opportunities
${swotData.swot.opportunities.map((o: string) => `- ${o}`).join("\n")}

## Threats
${swotData.swot.threats.map((t: string) => `- ${t}`).join("\n")}

---

**Confidence Score**: ${swotData.confidenceScore}
**Rationale**: ${swotData.confidenceRationale}

## What Changed
${swotData.changeSummary}

**Recommended Next Step**: ${swotData.recommendedNextStep}
`;
}

async function surveilleIdea(idea: any): Promise<void> {
  const { userId, ideaId, title, confidenceScore: existingConfidence } = idea;
  const reportViewed = idea.reportViewed ?? true; // Default true so first run does full SWOT update
  const now = new Date().toISOString();

  console.log(`[Surveillance] Processing idea: ${ideaId} ("${title}") — reportViewed: ${reportViewed}`);

  // Load existing analysis from S3
  const analysisRaw = await getFromS3(`ideas/${ideaId}/analysis.json`);
  const analysis = analysisRaw ? JSON.parse(analysisRaw) : null;

  // Extract search queries — fallback to generic queries based on title
  const searchQueries = analysis?.searchQueries ?? [
    `${title} market trends`,
    `${title} competitors`,
    `${title} industry news`,
    `${title} technology developments`,
  ];
  const enrichedDescription = analysis?.enrichedDescription ?? title;

  // Run Gemini research + SWOT read in parallel (SWOT read doesn't depend on research)
  console.log(`[Surveillance] Running fresh research for: ${ideaId}`);
  const needsSWOT = reportViewed || !idea.latestReport;
  const [newResearch, existingSWOTRaw] = await Promise.all([
    searchWithGemini(enrichedDescription, searchQueries),
    needsSWOT ? getFromS3(`ideas/${ideaId}/swot.md`) : Promise.resolve(null),
  ]);

  // Store research snapshots in parallel
  const researchJson = JSON.stringify(newResearch, null, 2);
  await Promise.all([
    storeToS3(`ideas/${ideaId}/research-${now}.json`, researchJson, "application/json"),
    storeToS3(`ideas/${ideaId}/research.json`, researchJson, "application/json"),
  ]);

  const newSourceCount = newResearch?.sources?.length ?? 0;
  let latestReport: any;
  let swotUpdate: any = null;

  if (needsSWOT) {
    // === MODE 1: Report was viewed (or no previous report) ===
    // Merge old report intel into SWOT, generate fresh report
    console.log(`[Surveillance] Mode: FRESH — merging old report into SWOT update`);

    const existingSWOT = existingSWOTRaw
      ? existingSWOTRaw.substring(0, 3000)
      : "No previous SWOT analysis available.";

    const previousReport = idea.latestReport
      ? JSON.stringify(idea.latestReport)
      : "No previous report available.";

    const prompt = SWOT_UPDATE_PROMPT
      .replace("{ideaAnalysis}", JSON.stringify(analysis))
      .replace("{existingSWOT}", existingSWOT)
      .replace("{existingConfidence}", String(existingConfidence ?? 0))
      .replace("{previousReport}", previousReport)
      .replace("{newResearch}", JSON.stringify(newResearch));

    const raw = await callBedrock(prompt);
    swotUpdate = parseAIJson(raw, "SWOTUpdate", ["swot", "confidenceScore"]);

    // Retry with focused prompt if discoveries are missing
    if (!swotUpdate.report?.discoveries || swotUpdate.report.discoveries.length === 0) {
      console.warn(`[Surveillance] Missing discoveries for ${ideaId}, retrying with focused prompt`);
      const retryPrompt = DISCOVERY_RETRY_PROMPT
        .replace("{ideaTitle}", title)
        .replace("{changeSummary}", swotUpdate.changeSummary ?? "")
        .replace("{newResearch}", JSON.stringify(newResearch));
      try {
        const retryRaw = await callBedrock(retryPrompt, { maxTokens: 2048 });
        const retryResult = parseAIJson(retryRaw, "DiscoveryRetry");
        if (retryResult.discoveries?.length > 0) {
          swotUpdate.report = swotUpdate.report ?? {};
          swotUpdate.report.discoveries = retryResult.discoveries;
          if (retryResult.actionPlan) swotUpdate.report.actionPlan = retryResult.actionPlan;
        }
      } catch (retryErr: any) {
        console.error(`[Surveillance] Discovery retry failed for ${ideaId}:`, retryErr.message);
      }
    }

    // Format and store SWOT markdown
    const swotMarkdown = formatSWOTMarkdown(swotUpdate);
    await Promise.all([
      storeToS3(`ideas/${ideaId}/swot-${now}.md`, swotMarkdown, "text/markdown"),
      storeToS3(`ideas/${ideaId}/swot.md`, swotMarkdown, "text/markdown"),
    ]);

    const confidenceDelta = (swotUpdate.confidenceScore ?? 0) - (existingConfidence ?? 0);

    latestReport = {
      headline: swotUpdate.report?.headline ?? swotUpdate.changeSummary?.substring(0, 60) ?? "Surveillance complete",
      viabilityDirection: swotUpdate.report?.viabilityDirection ?? (confidenceDelta > 0.05 ? "up" : confidenceDelta < -0.05 ? "down" : "stable"),
      discoveries: swotUpdate.report?.discoveries ?? [],
      actionPlan: swotUpdate.report?.actionPlan ?? swotUpdate.changeSummary ?? "",
      generatedAt: now,
      confidenceDelta,
      newSourceCount,
    };
  } else {
    // === MODE 2: Report NOT yet viewed ===
    // Stack new intel on top of unread report — consolidate top 3-4 discoveries
    console.log(`[Surveillance] Mode: STACK — consolidating with unread report`);

    const prompt = STACK_REPORT_PROMPT
      .replace("{ideaTitle}", title)
      .replace("{ideaAnalysis}", JSON.stringify(analysis))
      .replace("{previousReport}", JSON.stringify(idea.latestReport))
      .replace("{newResearch}", JSON.stringify(newResearch));

    const raw = await callBedrock(prompt);
    const stackResult = parseAIJson(raw, "StackReport");

    // Retry with focused prompt if discoveries are missing
    if (!stackResult.report?.discoveries || stackResult.report.discoveries.length === 0) {
      console.warn(`[Surveillance] Missing discoveries in stacked report for ${ideaId}, retrying`);
      const retryPrompt = DISCOVERY_RETRY_PROMPT
        .replace("{ideaTitle}", title)
        .replace("{changeSummary}", "Consolidating latest intelligence for this idea.")
        .replace("{newResearch}", JSON.stringify(newResearch));
      try {
        const retryRaw = await callBedrock(retryPrompt, { maxTokens: 2048 });
        const retryResult = parseAIJson(retryRaw, "DiscoveryRetry");
        if (retryResult.discoveries?.length > 0) {
          stackResult.report = stackResult.report ?? {};
          stackResult.report.discoveries = retryResult.discoveries;
          if (retryResult.actionPlan) stackResult.report.actionPlan = retryResult.actionPlan;
        }
      } catch (retryErr: any) {
        console.error(`[Surveillance] Discovery retry failed for ${ideaId}:`, retryErr.message);
      }
    }

    const confidenceDelta = stackResult.confidenceDelta ?? idea.latestReport.confidenceDelta ?? 0;

    latestReport = {
      headline: stackResult.report?.headline ?? idea.latestReport.headline,
      viabilityDirection: stackResult.report?.viabilityDirection ?? idea.latestReport.viabilityDirection,
      discoveries: stackResult.report?.discoveries ?? idea.latestReport.discoveries ?? [],
      actionPlan: stackResult.report?.actionPlan ?? idea.latestReport.actionPlan ?? "",
      generatedAt: now,
      confidenceDelta,
      newSourceCount: (idea.latestReport.newSourceCount ?? 0) + newSourceCount,
    };
  }

  // Archive report to S3 + update DynamoDB in parallel
  if (swotUpdate) {
    const confidenceDelta = (swotUpdate.confidenceScore ?? 0) - (existingConfidence ?? 0);
    await Promise.all([
      storeToS3(`ideas/${ideaId}/reports/report-${now}.json`, JSON.stringify(latestReport, null, 2), "application/json"),
      ddb.send(new UpdateCommand({
        TableName: IDEAS_TABLE,
        Key: { userId, ideaId },
        UpdateExpression: "SET #swot = :swot, confidenceScore = :score, lastUpdatedAt = :now, latestReport = :report, reportViewed = :viewed",
        ExpressionAttributeNames: { "#swot": "swot" },
        ExpressionAttributeValues: {
          ":swot": swotUpdate.swot,
          ":score": swotUpdate.confidenceScore,
          ":now": now,
          ":report": latestReport,
          ":viewed": false,
        },
      })),
      ddb.send(new PutCommand({
        TableName: UPDATES_TABLE,
        Item: {
          ideaId,
          timestamp: now,
          type: "surveillance",
          summary: swotUpdate.changeSummary,
          confidenceDelta,
          newSourceCount,
        },
      })),
    ]);

    console.log(`[Surveillance] Completed idea: ${ideaId} (FRESH — confidence delta: ${confidenceDelta.toFixed(2)}, new sources: ${newSourceCount})`);
  } else {
    await Promise.all([
      storeToS3(`ideas/${ideaId}/reports/report-${now}.json`, JSON.stringify(latestReport, null, 2), "application/json"),
      ddb.send(new UpdateCommand({
        TableName: IDEAS_TABLE,
        Key: { userId, ideaId },
        UpdateExpression: "SET lastUpdatedAt = :now, latestReport = :report, reportViewed = :viewed",
        ExpressionAttributeValues: {
          ":now": now,
          ":report": latestReport,
          ":viewed": false,
        },
      })),
      ddb.send(new PutCommand({
        TableName: UPDATES_TABLE,
        Item: {
          ideaId,
          timestamp: now,
          type: "surveillance-stacked",
          summary: `Stacked new intel onto unread report (${newSourceCount} new sources)`,
          newSourceCount,
        },
      })),
    ]);

    console.log(`[Surveillance] Completed idea: ${ideaId} (STACKED — ${newSourceCount} new sources added to unread report)`);
  }
}

export async function handler() {
  console.log("[Surveillance] Starting surveillance sweep");

  // Scan for all active/stasis ideas
  const scanResult = await ddb.send(
    new ScanCommand({
      TableName: IDEAS_TABLE,
      FilterExpression: "#status IN (:active, :stasis)",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":active": { S: "active" },
        ":stasis": { S: "stasis" },
      },
    })
  );

  const ideas = (scanResult.Items ?? []).map((item) => unmarshall(item));
  const total = ideas.length;
  let processed = 0;
  let failed = 0;

  console.log(`[Surveillance] Found ${total} ideas to process`);

  // Process ideas with bounded concurrency (3 at a time)
  const CONCURRENCY = 3;
  const queue = [...ideas];
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0) {
      const idea = queue.shift()!;
      try {
        await surveilleIdea(idea);
        processed++;
      } catch (err: any) {
        failed++;
        console.error(`[Surveillance] Failed to process idea ${idea.ideaId}:`, err.message);
      }
    }
  });
  await Promise.all(workers);

  const result = { processed, failed, total };
  console.log("[Surveillance] Sweep complete:", result);
  return success(result);
}
