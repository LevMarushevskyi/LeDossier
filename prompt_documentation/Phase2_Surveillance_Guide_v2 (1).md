# LeDossier Phase 2 — Automated Surveillance & Return Briefings (v2)

> Updated to reflect the refactored backend structure where shared modules (`shared/ai.ts`, `shared/storage.ts`, `shared/ideas.ts`) and pipeline functions (`idea-analysis/`, `gemini-research/`, `swot-generation/`) are already extracted.

---

## Your Current File Structure

```
lambda/
├── shared/
│   ├── ai.ts            ← callBedrock, callGemini, parseAIJson
│   ├── auth.ts          ← getUserFromEvent, authenticateRequest
│   ├── ideas.ts         ← handleGetIdeas
│   ├── responses.ts     ← success, error
│   └── storage.ts       ← storeToS3
├── idea-analysis/
│   └── index.ts         ← analyzeIdea(title, rawInput)
├── gemini-research/
│   └── index.ts         ← searchWithGemini(enrichedDesc, queries)
├── swot-generation/
│   └── index.ts         ← generateSWOT(analysis, research)
├── idea-intake/
│   └── index.ts         ← orchestrates the full pipeline
├── get-ideas/
│   └── index.ts         ← standalone GET handler
```

**What this means for Phase 2:** The original guide's Step 1 (extract shared functions) is already done. The surveillance Lambda and idea-view Lambda can directly import your existing modules. You're ready to build.

---

## What You Already Have (Reusing)

| Component | File | Reuse Plan |
|---|---|---|
| `callBedrock()` | `shared/ai.ts` | Import directly in surveillance + idea-view Lambdas |
| `callGemini()` | `shared/ai.ts` | Import directly in surveillance Lambda |
| `parseAIJson()` | `shared/ai.ts` | Import directly in both new Lambdas |
| `searchWithGemini()` | `gemini-research/index.ts` | Import directly — re-runs research for each idea |
| `storeToS3()` | `shared/storage.ts` | Import directly — stores versioned snapshots |
| `getUserFromEvent()` | `shared/auth.ts` | Import in idea-view Lambda |
| `success()` / `error()` | `shared/responses.ts` | Import in idea-view Lambda |
| DynamoDB Ideas table | CDK stack | Already has `lastViewedAt`, `lastUpdatedAt`, `status` |
| DynamoDB Updates table | CDK stack | Already tracks events per idea — add surveillance + view events |
| S3 dossier bucket | CDK stack | Already stores analysis/research/SWOT — add versioned snapshots |

---

## The Two Flows

### Flow A: Automated Surveillance (Scheduled, No User)

```
EventBridge (every 6 hours)
    ↓
Surveillance Lambda
    ├── Scan DynamoDB for all active/stasis ideas
    ├── For each idea:
    │     ├── Load existing analysis from S3
    │     ├── Re-run Gemini research (reuse searchWithGemini)
    │     ├── Generate diff-aware SWOT update via Bedrock
    │     ├── Store versioned snapshots in S3
    │     ├── Update DynamoDB (new SWOT, confidence, lastUpdatedAt)
    │     └── Log surveillance event to Updates table
    └── Done
```

### Flow B: Return Briefing (User Opens an Idea)

```
User taps idea → GET /ideas/{ideaId}
    ↓
Idea-View Lambda
    ├── Authenticate + fetch idea from DynamoDB
    ├── Calculate time since lastViewedAt
    ├── If away > 24 hours:
    │     ├── Query Updates table for events since last visit
    │     ├── Generate return briefing via Bedrock
    │     └── Return idea + briefing
    ├── Else: return idea data only
    ├── Update lastViewedAt
    └── Log "viewed" event to Updates table
```

---

## Step 1: Add `getFromS3` to `shared/storage.ts`

Your `storage.ts` currently only has `storeToS3`. The surveillance Lambda needs to read existing analysis files. Add this:

```typescript
// Add to shared/storage.ts

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({});

// existing storeToS3 stays as-is...

export async function getFromS3(key: string): Promise<string | null> {
  try {
    const result = await s3.send(
      new GetObjectCommand({
        Bucket: process.env.DOSSIER_BUCKET!,
        Key: key,
      })
    );
    return (await result.Body?.transformToString()) ?? null;
  } catch (err: any) {
    if (err.name === "NoSuchKey") return null;
    throw err;
  }
}
```

> **Note:** You'll need to update the existing `import` line in `storage.ts` to include `GetObjectCommand`.

---

## Step 2: Surveillance Lambda

### Create `lambda/surveillance/index.ts`

This Lambda is triggered by EventBridge, not API Gateway. No auth needed — it processes all ideas across all users.

```typescript
// lambda/surveillance/index.ts

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { callBedrock, parseAIJson } from "../shared/ai";
import { searchWithGemini } from "../gemini-research";
import { storeToS3, getFromS3 } from "../shared/storage";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const IDEAS_TABLE = process.env.IDEAS_TABLE!;
const UPDATES_TABLE = process.env.UPDATES_TABLE!;

export async function handler(event: any) {
  console.log("Surveillance cycle starting...");

  // 1. Get all active/stasis ideas
  //    Scan is fine at hackathon scale — in production use a GSI on status
  const scanResult = await ddb.send(
    new ScanCommand({
      TableName: IDEAS_TABLE,
      FilterExpression: "#s IN (:stasis, :active)",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":stasis": "stasis",
        ":active": "active",
      },
    })
  );

  const ideas = scanResult.Items ?? [];
  console.log(`Found ${ideas.length} ideas to surveil`);

  let processed = 0;
  let failed = 0;

  for (const idea of ideas) {
    try {
      await surveilleIdea(idea);
      processed++;
    } catch (err: any) {
      console.error(`Failed to surveil idea ${idea.ideaId}:`, err.message);
      failed++;
    }
  }

  console.log(`Surveillance complete: ${processed} processed, ${failed} failed`);
  return { processed, failed, total: ideas.length };
}

async function surveilleIdea(idea: any) {
  const { userId, ideaId, title, rawInput, swot, confidenceScore } = idea;
  const now = new Date().toISOString();

  // 1. Load existing analysis from S3 (has the search queries we need)
  let existingAnalysis: any = null;
  const analysisJson = await getFromS3(`ideas/${ideaId}/analysis.json`);
  if (analysisJson) {
    try {
      existingAnalysis = JSON.parse(analysisJson);
    } catch {
      console.warn(`Could not parse analysis.json for ${ideaId}`);
    }
  }

  // 2. Run fresh Gemini research using the original search queries
  const searchQueries = existingAnalysis?.searchQueries ?? [
    `${title} competitors 2025`,
    `${title} technology trends`,
    `${title} market news`,
    `${title} industry developments`,
  ];

  const enrichedDesc = existingAnalysis?.enrichedDescription ?? rawInput;
  const newResearch = await searchWithGemini(enrichedDesc, searchQueries);

  // 3. Store versioned research snapshot + overwrite latest
  await storeToS3(
    `ideas/${ideaId}/research-${now}.json`,
    JSON.stringify(newResearch, null, 2),
    "application/json"
  );
  await storeToS3(
    `ideas/${ideaId}/research.json`,
    JSON.stringify(newResearch, null, 2),
    "application/json"
  );

  // 4. Generate diff-aware SWOT update
  const swotUpdate = await generateSWOTUpdate(
    existingAnalysis,
    swot,
    confidenceScore,
    newResearch
  );

  // 5. Store versioned SWOT snapshot + overwrite latest
  const swotMarkdown = formatSWOTMarkdown(swotUpdate, now);
  await storeToS3(
    `ideas/${ideaId}/swot-${now}.md`,
    swotMarkdown,
    "text/markdown"
  );
  await storeToS3(
    `ideas/${ideaId}/swot.md`,
    swotMarkdown,
    "text/markdown"
  );

  // 6. Update DynamoDB idea record
  await ddb.send(
    new UpdateCommand({
      TableName: IDEAS_TABLE,
      Key: { userId, ideaId },
      UpdateExpression:
        "SET #swot = :swot, confidenceScore = :score, lastUpdatedAt = :now",
      ExpressionAttributeNames: { "#swot": "swot" },
      ExpressionAttributeValues: {
        ":swot": swotUpdate.swot,
        ":score": swotUpdate.confidenceScore,
        ":now": now,
      },
    })
  );

  // 7. Log surveillance event in Updates table
  await ddb.send(
    new PutCommand({
      TableName: UPDATES_TABLE,
      Item: {
        ideaId,
        timestamp: now,
        type: "surveillance",
        summary: swotUpdate.changeSummary,
        confidenceDelta: swotUpdate.confidenceScore - (confidenceScore ?? 0),
        newSourceCount: newResearch.sources?.length ?? 0,
      },
    })
  );

  console.log(
    `Surveilled "${title}": confidence ${confidenceScore} → ${swotUpdate.confidenceScore}`
  );
}

// ════════════════════════════════════════════════
//  Diff-Aware SWOT Update Prompt
// ════════════════════════════════════════════════

const SWOT_UPDATE_PROMPT = `You are a strategic surveillance analyst for LeDossier, monitoring an idea over time.

<existing_idea>
{ideaAnalysis}
</existing_idea>

<existing_swot>
{existingSWOT}
</existing_swot>

<previous_confidence_score>{existingScore}</previous_confidence_score>

<new_research>
{newResearch}
</new_research>

Based on the NEW research compared to the EXISTING SWOT, generate an updated SWOT analysis.

Important instructions:
- Keep existing SWOT entries that are still valid
- Add new entries based on the fresh research
- Remove entries that are no longer accurate based on new information
- Adjust the confidence score UP or DOWN based on what the new research reveals
- Write a changeSummary that describes what changed since the last analysis — this is what the user will see when they return

Return ONLY valid JSON:
{
  "swot": {
    "strengths": ["..."],
    "weaknesses": ["..."],
    "opportunities": ["..."],
    "threats": ["..."]
  },
  "confidenceScore": 0.0-1.0,
  "confidenceRationale": "Why the score changed (or didn't)",
  "changeSummary": "2-3 sentence summary of what's new or different since last analysis. Be specific — mention new competitors, market shifts, or technology changes by name.",
  "recommendedNextStep": "Updated recommended next step based on current landscape"
}`;

async function generateSWOTUpdate(
  ideaAnalysis: any,
  existingSWOT: any,
  existingScore: number,
  newResearch: any
) {
  const prompt = SWOT_UPDATE_PROMPT
    .replace("{ideaAnalysis}", JSON.stringify(ideaAnalysis ?? {}, null, 2))
    .replace("{existingSWOT}", JSON.stringify(existingSWOT ?? {}, null, 2))
    .replace("{existingScore}", String(existingScore ?? 0.5))
    .replace("{newResearch}", JSON.stringify(newResearch, null, 2));

  const raw = await callBedrock(prompt);
  return parseAIJson(raw, "SWOTUpdate");
}

function formatSWOTMarkdown(swotData: any, timestamp: string): string {
  const { swot, confidenceScore, confidenceRationale, changeSummary, recommendedNextStep } =
    swotData;
  return `# SWOT Analysis — Updated ${timestamp.split("T")[0]}

## Confidence Score: ${Math.round((confidenceScore ?? 0) * 100)}%
${confidenceRationale ?? ""}

## What Changed
${changeSummary ?? "Initial analysis"}

---

## Strengths
${(swot?.strengths ?? []).map((s: string) => `- ${s}`).join("\n")}

## Weaknesses
${(swot?.weaknesses ?? []).map((w: string) => `- ${w}`).join("\n")}

## Opportunities
${(swot?.opportunities ?? []).map((o: string) => `- ${o}`).join("\n")}

## Threats
${(swot?.threats ?? []).map((t: string) => `- ${t}`).join("\n")}

---

## Recommended Next Step
${recommendedNextStep ?? "N/A"}
`;
}
```

### Design notes on the surveillance Lambda:

**Import paths match your structure exactly** — `searchWithGemini` comes from `../gemini-research` (your existing module), AI helpers from `../shared/ai`, storage from `../shared/storage`.

**Prompt follows your existing pattern** — template string with `{placeholder}` replacements, same as your `idea-analysis/index.ts` and `swot-generation/index.ts` do. The prompt text should also be saved to `prompts/swot-update.txt` for the GenAI log.

**No auth required** — EventBridge invokes this Lambda directly. It scans across all users since it's a background process.

---

## Step 3: Idea View Lambda

### Create `lambda/idea-view/index.ts`

Handles `GET /ideas/{ideaId}` — when the user taps into a specific idea. Detects how long they've been away and generates a briefing if needed.

```typescript
// lambda/idea-view/index.ts

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { getUserFromEvent } from "../shared/auth";
import { success, error } from "../shared/responses";
import { callBedrock, parseAIJson } from "../shared/ai";
import { storeToS3 } from "../shared/storage";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const IDEAS_TABLE = process.env.IDEAS_TABLE!;
const UPDATES_TABLE = process.env.UPDATES_TABLE!;

// How long (in hours) before a return triggers a briefing
const BRIEFING_THRESHOLD_HOURS = 24;

export async function handler(event: any) {
  try {
    const user = await getUserFromEvent(event);
    const ideaId = event.pathParameters?.ideaId;

    if (!ideaId) {
      return error("ideaId is required", 400);
    }

    // 1. Fetch the idea
    const ideaResult = await ddb.send(
      new GetCommand({
        TableName: IDEAS_TABLE,
        Key: { userId: user.userId, ideaId },
      })
    );

    const idea = ideaResult.Item;
    if (!idea) {
      return error("Idea not found", 404);
    }

    const now = new Date();
    const lastViewed = idea.lastViewedAt ? new Date(idea.lastViewedAt) : now;
    const hoursAway =
      (now.getTime() - lastViewed.getTime()) / (1000 * 60 * 60);
    const daysAway = Math.floor(hoursAway / 24);

    // 2. Generate briefing if user has been away long enough
    let briefing = null;

    if (hoursAway >= BRIEFING_THRESHOLD_HOURS) {
      briefing = await generateReturnBriefing(idea, lastViewed.toISOString());
    }

    // 3. Update lastViewedAt
    await ddb.send(
      new UpdateCommand({
        TableName: IDEAS_TABLE,
        Key: { userId: user.userId, ideaId },
        UpdateExpression: "SET lastViewedAt = :now",
        ExpressionAttributeValues: { ":now": now.toISOString() },
      })
    );

    // 4. Log the view event
    await ddb.send(
      new PutCommand({
        TableName: UPDATES_TABLE,
        Item: {
          ideaId,
          timestamp: now.toISOString(),
          type: "viewed",
          summary: `User returned after ${daysAway} day${daysAway !== 1 ? "s" : ""} away`,
          daysAway,
        },
      })
    );

    // 5. Return idea + briefing
    return success({
      idea,
      briefing,
      daysAway,
      hasBriefing: briefing !== null,
    });
  } catch (err: any) {
    console.error("Idea view error:", err);
    return error(`Failed to load idea: ${err.message}`, 500);
  }
}

// ════════════════════════════════════════════════
//  Return Briefing Generation
// ════════════════════════════════════════════════

const BRIEFING_PROMPT = `You are the lead intelligence analyst at LeDossier. A user is returning to an idea they haven't looked at in a while. Write them a concise briefing.

<idea_title>{title}</idea_title>

<current_swot>
{swot}
</current_swot>

<current_confidence_score>{confidenceScore}</current_confidence_score>

<surveillance_updates_since_last_visit>
{updatesList}
</surveillance_updates_since_last_visit>

Write a return briefing that:
1. Starts with the most important thing they need to know
2. Summarizes what changed while they were away (be specific — name competitors, technologies, or trends)
3. States whether the idea looks more or less viable than when they left
4. Ends with one recommended action

Keep it concise — 4-6 sentences total. Write in a direct, analyst tone. Not casual, not stiff.

Return ONLY valid JSON:
{
  "headline": "One-line summary of the most important change (or 'No major changes')",
  "body": "The 4-6 sentence briefing",
  "viabilityDirection": "up | down | stable",
  "recommendedAction": "One specific next step"
}`;

async function generateReturnBriefing(idea: any, lastViewedAt: string) {
  const { ideaId, title, swot, confidenceScore } = idea;

  // 1. Query all updates since the user last looked
  const updatesResult = await ddb.send(
    new QueryCommand({
      TableName: UPDATES_TABLE,
      KeyConditionExpression: "ideaId = :id AND #ts > :since",
      ExpressionAttributeNames: { "#ts": "timestamp" },
      ExpressionAttributeValues: {
        ":id": ideaId,
        ":since": lastViewedAt,
      },
      ScanIndexForward: true, // chronological
    })
  );

  const recentUpdates = updatesResult.Items ?? [];
  const surveillanceUpdates = recentUpdates.filter(
    (u: any) => u.type === "surveillance"
  );

  // If no surveillance ran since they left, return a simple message
  if (surveillanceUpdates.length === 0) {
    return {
      headline: "Welcome back",
      body: "You've been away, but no new intelligence has been gathered yet. Your dossier is as you left it.",
      viabilityDirection: "stable",
      recommendedAction: "Check back soon — surveillance runs every 6 hours.",
      changeSummaries: [],
      surveillanceRunCount: 0,
      daysAway: Math.floor(
        (Date.now() - new Date(lastViewedAt).getTime()) / (1000 * 60 * 60 * 24)
      ),
    };
  }

  // 2. Collect change summaries
  const changeSummaries = surveillanceUpdates.map((u: any) => ({
    date: u.timestamp,
    summary: u.summary,
    confidenceDelta: u.confidenceDelta ?? 0,
    newSourceCount: u.newSourceCount ?? 0,
  }));

  // 3. Build the updates list for the prompt
  const updatesList = changeSummaries
    .map(
      (c: any) =>
        `[${c.date}] ${c.summary} (${c.newSourceCount} new sources, confidence delta: ${c.confidenceDelta > 0 ? "+" : ""}${(c.confidenceDelta ?? 0).toFixed(2)})`
    )
    .join("\n");

  // 4. Ask Bedrock to synthesize a return briefing
  const prompt = BRIEFING_PROMPT
    .replace("{title}", title)
    .replace("{swot}", JSON.stringify(swot ?? {}, null, 2))
    .replace("{confidenceScore}", String(confidenceScore ?? "unknown"))
    .replace("{updatesList}", updatesList);

  try {
    const raw = await callBedrock(prompt);
    const briefingData = parseAIJson(raw, "ReturnBriefing");

    // Store the briefing
    const now = new Date().toISOString();
    await storeToS3(
      `ideas/${ideaId}/briefings/briefing-${now}.json`,
      JSON.stringify({ ...briefingData, changeSummaries, generatedAt: now }),
      "application/json"
    );

    return {
      ...briefingData,
      changeSummaries,
      surveillanceRunCount: surveillanceUpdates.length,
      daysAway: Math.floor(
        (Date.now() - new Date(lastViewedAt).getTime()) / (1000 * 60 * 60 * 24)
      ),
    };
  } catch (err: any) {
    console.error("Briefing generation failed:", err);
    // Fallback: return raw change summaries without AI synthesis
    const totalDelta = surveillanceUpdates.reduce(
      (sum: number, u: any) => sum + (u.confidenceDelta ?? 0),
      0
    );
    return {
      headline: "Updates while you were away",
      body: changeSummaries.map((c: any) => c.summary).join(" "),
      viabilityDirection:
        totalDelta > 0.05 ? "up" : totalDelta < -0.05 ? "down" : "stable",
      recommendedAction: "Review the latest SWOT analysis for details.",
      changeSummaries,
      surveillanceRunCount: surveillanceUpdates.length,
      daysAway: Math.floor(
        (Date.now() - new Date(lastViewedAt).getTime()) / (1000 * 60 * 60 * 24)
      ),
    };
  }
}
```

### Design notes on the idea-view Lambda:

**Prompt pattern matches your codebase** — template constant at the top with `{placeholder}` replacements, same as `idea-analysis/index.ts`, `gemini-research/index.ts`, and `swot-generation/index.ts`.

**Imports only from your existing shared modules** — no new dependencies needed.

---

## Step 4: CDK Stack Updates

Add the new Lambdas, EventBridge rule, and API routes to `lib/ledossier-stack.ts`.

### 4.1 — Add imports at the top of the file

```typescript
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
```

### 4.2 — Add inside the constructor, after the existing API Gateway routes

```typescript
    // ─── Surveillance Lambda (EventBridge triggered) ───

    const surveillanceFn = new lambda.NodejsFunction(this, "SurveillanceFn", {
      entry: path.join(__dirname, "../lambda/surveillance/index.ts"),
      handler: "handler",
      runtime: lambdaRuntime.Runtime.NODEJS_18_X,
      timeout: cdk.Duration.minutes(5),  // needs more time — processes multiple ideas
      memorySize: 512,
      environment: {
        IDEAS_TABLE: ideasTable.tableName,
        UPDATES_TABLE: updatesTable.tableName,
        DOSSIER_BUCKET: dossierBucket.bucketName,
        GEMINI_API_KEY: geminiApiKey,
      },
      bundling: { externalModules: [], minify: true, sourceMap: true },
    });

    ideasTable.grantReadWriteData(surveillanceFn);
    updatesTable.grantReadWriteData(surveillanceFn);
    dossierBucket.grantReadWrite(surveillanceFn);
    surveillanceFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream", "bedrock:Converse"],
        resources: ["*"],
      })
    );

    // ─── EventBridge Schedule ───

    const surveillanceRule = new events.Rule(this, "SurveillanceSchedule", {
      ruleName: "LeDossier-Surveillance",
      schedule: events.Schedule.rate(cdk.Duration.hours(6)),
      description: "Runs idea surveillance every 6 hours",
    });
    surveillanceRule.addTarget(new targets.LambdaFunction(surveillanceFn));

    // ─── Idea View Lambda (GET /ideas/{ideaId}) ───

    const ideaViewFn = new lambda.NodejsFunction(this, "IdeaViewFn", {
      entry: path.join(__dirname, "../lambda/idea-view/index.ts"),
      handler: "handler",
      runtime: lambdaRuntime.Runtime.NODEJS_18_X,
      timeout: cdk.Duration.seconds(60),
      memorySize: 256,
      environment: {
        IDEAS_TABLE: ideasTable.tableName,
        UPDATES_TABLE: updatesTable.tableName,
        DOSSIER_BUCKET: dossierBucket.bucketName,
        GEMINI_API_KEY: geminiApiKey,
        USER_POOL_ID: "us-east-1_XSZEJwbSO",
        USER_POOL_CLIENT_ID: "1n389pqmf8khutobtkj23rpd8n",
      },
      bundling: { externalModules: [], minify: true, sourceMap: true },
    });

    ideasTable.grantReadWriteData(ideaViewFn);
    updatesTable.grantReadWriteData(ideaViewFn);
    dossierBucket.grantReadWrite(ideaViewFn);
    ideaViewFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream", "bedrock:Converse"],
        resources: ["*"],
      })
    );

    // ─── New API Routes ───

    // GET /ideas/{ideaId} → view single idea + trigger return briefing
    const singleIdea = ideasResource.addResource("{ideaId}");
    singleIdea.addMethod(
      "GET",
      new apigateway.LambdaIntegration(ideaViewFn),
      { authorizer, authorizationType: apigateway.AuthorizationType.COGNITO }
    );

    // POST /surveillance/trigger → manual trigger for demo
    const surveillanceResource = api.root.addResource("surveillance");
    const triggerResource = surveillanceResource.addResource("trigger");
    triggerResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(surveillanceFn),
      { authorizer, authorizationType: apigateway.AuthorizationType.COGNITO }
    );
```

### 4.3 — After this step, your file tree will be:

```
lambda/
├── shared/
│   ├── ai.ts            ← unchanged
│   ├── auth.ts          ← unchanged
│   ├── ideas.ts         ← unchanged
│   ├── responses.ts     ← unchanged
│   └── storage.ts       ← add getFromS3 (Step 1)
├── idea-analysis/
│   └── index.ts         ← unchanged
├── gemini-research/
│   └── index.ts         ← unchanged
├── swot-generation/
│   └── index.ts         ← unchanged
├── idea-intake/
│   └── index.ts         ← unchanged
├── get-ideas/
│   └── index.ts         ← unchanged
├── surveillance/         ← NEW
│   └── index.ts
└── idea-view/            ← NEW
    └── index.ts
```

---

## Step 5: Frontend Integration

### 5.1 — Update IdeaVault: tap an idea → call view endpoint

When a user taps an idea card, call the new `GET /ideas/{ideaId}` endpoint instead of just showing cached data:

```typescript
// In IdeaVault.tsx — update the idea card tap handler

const handleIdeaTap = async (idea: Dossier) => {
  try {
    const token = await getAuthToken();
    const response = await fetch(`${API_URL}/ideas/${idea.ideaId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await response.json();

    if (response.ok) {
      setSelectedIdea(data.idea);
      setActiveDossier(data.idea);

      // If there's a return briefing, show it first
      if (data.hasBriefing && data.briefing) {
        setReturnBriefing(data.briefing);
        setShowBriefingModal(true);
      } else {
        setShowIdeaDetail(true);
      }
    }
  } catch (err) {
    console.error('Failed to load idea:', err);
    // Fallback: show cached data
    setSelectedIdea(idea);
    setActiveDossier(idea);
    setShowIdeaDetail(true);
  }
};
```

### 5.2 — Add briefing modal state + UI

```typescript
// New state variables
const [returnBriefing, setReturnBriefing] = useState<any>(null);
const [showBriefingModal, setShowBriefingModal] = useState(false);

// Briefing modal JSX (add alongside your other modals)
<Modal visible={showBriefingModal} transparent animationType="fade">
  <View style={styles.modalOverlay}>
    <View style={styles.briefingPanel}>
      <Text style={styles.briefingHeadline}>
        {returnBriefing?.headline}
      </Text>
      <Text style={styles.briefingDaysAway}>
        You were away {returnBriefing?.daysAway} day{returnBriefing?.daysAway !== 1 ? 's' : ''}
      </Text>
      <View style={styles.viabilityBadge}>
        <Text style={styles.viabilityText}>
          Viability: {returnBriefing?.viabilityDirection === 'up' ? '↑ Improving' :
                      returnBriefing?.viabilityDirection === 'down' ? '↓ Declining' : '→ Stable'}
        </Text>
      </View>
      <Text style={styles.briefingBody}>
        {returnBriefing?.body}
      </Text>
      <Text style={styles.briefingAction}>
        Next step: {returnBriefing?.recommendedAction}
      </Text>
      <TouchableOpacity
        style={styles.briefingDismiss}
        onPress={() => {
          setShowBriefingModal(false);
          setShowIdeaDetail(true);
        }}
      >
        <Text style={styles.briefingDismissText}>View Full Dossier</Text>
      </TouchableOpacity>
    </View>
  </View>
</Modal>
```

### 5.3 — Manual surveillance trigger button (for demo)

You can't wait 6 hours for EventBridge during a demo. Add a button:

```typescript
<TouchableOpacity
  style={styles.testButton}
  onPress={async () => {
    setLoading(true);
    setLoadingMessage('Running surveillance cycle...');
    try {
      const token = await getAuthToken();
      await fetch(`${API_URL}/surveillance/trigger`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      // Refresh ideas list after surveillance completes
      const res = await fetch(`${API_URL}/ideas`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ideas) {
        const stored = data.ideas.map((idea: any, i: number) => ({
          ...idea,
          x: 80 + (i % 3) * 100,
          y: 80 + Math.floor(i / 3) * 80,
        }));
        setDossiers(stored);
        setIdeas(stored);
      }
    } catch (err) {
      console.error('Surveillance trigger failed:', err);
    } finally {
      setLoading(false);
    }
  }}
>
  <Text style={styles.testButtonText}>Run Surveillance</Text>
</TouchableOpacity>
```

---

## Step 6: New Prompts for GENAI_LOG.md

Save the prompt template strings to your `prompts/` directory and log them:

| Prompt | Model | Save to |
|---|---|---|
| SWOT Update (diff-aware) | Nemotron Nano 12B v2 | `prompts/swot-update.txt` |
| Return Briefing | Nemotron Nano 12B v2 | `prompts/return-briefing.txt` |

Add entries to `GENAI_LOG.md`:

```markdown
## [Hour X] — SWOT Update Prompt (Surveillance)
**Tool**: AWS Bedrock (NVIDIA Nemotron Nano 12B v2)
**Prompt**: See ledossier-backend/prompts/swot-update.txt
**Result**: Generates diff-aware SWOT updates comparing new research to existing analysis
**Iteration**: v1

## [Hour X] — Return Briefing Prompt
**Tool**: AWS Bedrock (NVIDIA Nemotron Nano 12B v2)
**Prompt**: See ledossier-backend/prompts/return-briefing.txt
**Result**: Generates concise briefing summarizing changes since user's last visit
**Iteration**: v1
```

---

## Step 7: Seed Demo Data

Since surveillance hasn't been running for days, seed realistic data before the demo:

1. Set your demo idea's `lastViewedAt` to 3-4 days ago in DynamoDB
2. Insert 3-5 fake surveillance events into the Updates table with staggered timestamps:

```json
// Example events to seed in LeDossier-Updates
{ "ideaId": "your-demo-idea-id", "timestamp": "2026-02-12T08:00:00Z", "type": "surveillance", "summary": "New competitor FreshCheck launched a food safety app in the Austin market with $2M seed funding.", "confidenceDelta": -0.05, "newSourceCount": 4 }
{ "ideaId": "your-demo-idea-id", "timestamp": "2026-02-13T14:00:00Z", "type": "surveillance", "summary": "FDA announced new digital health inspection pilot program, creating potential regulatory tailwind.", "confidenceDelta": 0.08, "newSourceCount": 3 }
{ "ideaId": "your-demo-idea-id", "timestamp": "2026-02-14T20:00:00Z", "type": "surveillance", "summary": "Toast POS published restaurant compliance API, opening integration opportunities.", "confidenceDelta": 0.03, "newSourceCount": 5 }
```

This way when you open the idea during the demo, the briefing generates from real-looking history.

---

## Implementation Order

| Step | What | Time | Depends On |
|---|---|---|---|
| 1 | Add `getFromS3` to `shared/storage.ts` | 5 min | Nothing |
| 2 | Create `lambda/surveillance/index.ts` | 30 min | Step 1 |
| 3 | Create `lambda/idea-view/index.ts` | 25 min | Step 1 |
| 4 | CDK stack updates + deploy | 15 min | Steps 2 & 3 |
| 5 | Frontend: idea tap → view endpoint | 15 min | Step 4 deployed |
| 6 | Frontend: briefing modal | 15 min | Step 5 |
| 7 | Manual surveillance trigger button | 10 min | Step 4 deployed |
| 8 | Prompt files + GENAI_LOG entries | 10 min | Steps 2 & 3 |
| 9 | Seed demo data | 10 min | Step 4 deployed |
| **Total** | | **~2.5 hours** | |

> Time estimate dropped from ~3 hours to ~2.5 hours since the shared module extraction is already done.
