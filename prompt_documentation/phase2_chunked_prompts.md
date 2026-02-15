# LeDossier Phase 2 — Broken Into 3 Chunks

## Overview

Phase 2 (Automated Surveillance & Return Briefings) is broken into 3 sequential chunks that can each be handed to a fresh Claude Code session:

| Chunk | What | Estimated Time | Depends On |
|-------|------|---------------|------------|
| **1. Backend Lambda Code** | Update `shared/storage.ts`, create `surveillance/index.ts`, create `idea-view/index.ts`, save prompt files | ~45 min | Nothing |
| **2. CDK Infrastructure + Deploy** | Add new Lambdas + EventBridge + API routes to the CDK stack, deploy | ~20 min | Chunk 1 committed |
| **3. Frontend + Demo Prep** | IdeaVault tap handler, briefing modal, surveillance trigger button, GENAI_LOG, seed demo data | ~45 min | Chunk 2 deployed |

---

## Chunk 1 Prompt (below)

Copy everything between the `---START---` and `---END---` markers and paste it as your first message in a new Claude Code session, run from the `ledossier-backend/` directory.

---START---

# Task: LeDossier Phase 2, Chunk 1 — Backend Lambda Code

You are working on **LeDossier**, a hackathon project — an AI-powered idea incubation platform with a noir detective theme. The backend is an AWS CDK project with Lambda functions written in TypeScript.

## What You're Building

Phase 2 adds two new capabilities:
1. **Automated Surveillance** — a Lambda triggered by EventBridge that periodically re-runs research and updates the SWOT analysis for every active idea.
2. **Return Briefings** — a Lambda for `GET /ideas/{ideaId}` that detects how long the user has been away and generates a concise briefing summarizing what changed.

**This chunk covers only the Lambda code and shared module changes. CDK/infra changes come in a separate step.**

## Your Current File Structure

```
ledossier-backend/
├── lambda/
│   ├── shared/
│   │   ├── ai.ts            ← callBedrock, callGemini, parseAIJson
│   │   ├── auth.ts          ← getUserFromEvent, authenticateRequest
│   │   ├── ideas.ts         ← handleGetIdeas
│   │   ├── responses.ts     ← success, error helpers
│   │   └── storage.ts       ← storeToS3 (NEEDS getFromS3 added)
│   ├── idea-analysis/
│   │   └── index.ts         ← analyzeIdea(title, rawInput)
│   ├── gemini-research/
│   │   └── index.ts         ← searchWithGemini(enrichedDesc, queries)
│   ├── swot-generation/
│   │   └── index.ts         ← generateSWOT(analysis, research)
│   ├── idea-intake/
│   │   └── index.ts         ← orchestrates the full intake pipeline
│   └── get-ideas/
│       └── index.ts         ← standalone GET handler
├── prompts/
│   ├── idea-analysis.txt
│   ├── gemini-research.txt
│   ├── gemini-research-fallback.txt
│   └── swot-generation.txt
└── lib/
    └── ledossier-stack.ts   ← CDK stack (DO NOT MODIFY in this chunk)
```

## Existing Code You Need to Know

These are the shared modules you'll import from. **Do not modify these files** (except `storage.ts` as noted).

### `shared/ai.ts` — AI helper functions
```typescript
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

const bedrock = new BedrockRuntimeClient({});

export async function callBedrock(prompt: string): Promise<string> {
  const response = await bedrock.send(
    new ConverseCommand({
      modelId: "nvidia.nemotron-nano-12b-v2",
      messages: [{ role: "user", content: [{ text: prompt }] }],
    })
  );
  return response.output?.message?.content?.[0]?.text ?? "";
}

export async function callGemini(prompt: string): Promise<{ text: string; groundingMetadata: any }> {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
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

export function parseAIJson(raw: string, label: string = "AI"): any {
  console.log(`[${label}] Raw response (${raw.length} chars):`, raw.substring(0, 500));
  let cleaned = raw.replace(/```json\n?|```\n?/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (e: any) {
        console.error(`[${label}] Failed to parse extracted JSON:`, e.message);
        throw new Error(`${label}: Could not parse AI response as JSON`);
      }
    }
    throw new Error(`${label}: No JSON found in AI response`);
  }
}
```

### `shared/storage.ts` — Current state (you will add `getFromS3` here)
```typescript
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({});

export async function storeToS3(key: string, body: string, contentType: string): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.DOSSIER_BUCKET!,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}
```

### `shared/auth.ts` — Auth helpers
```typescript
import { CognitoJwtVerifier } from "aws-jwt-verify";

export interface AuthUser {
  userId: string;
  email: string;
  name: string;
}

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.USER_POOL_ID!,
  tokenUse: "id",
  clientId: process.env.USER_POOL_CLIENT_ID!,
});

export async function authenticateRequest(authHeader?: string): Promise<AuthUser> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }
  const token = authHeader.replace("Bearer ", "");
  const payload = await verifier.verify(token);
  return {
    userId: payload.sub,
    email: (payload.email as string) ?? "",
    name: (payload.name as string) ?? (payload.email as string) ?? "",
  };
}

export async function getUserFromEvent(event: any): Promise<AuthUser> {
  const authHeader = event.headers?.Authorization || event.headers?.authorization;
  return authenticateRequest(authHeader);
}
```

### `shared/responses.ts` — API response helpers
```typescript
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Amz-Date,X-Api-Key",
  "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
};

export function success(body: any, statusCode = 200) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function error(message: string, statusCode = 500) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ error: message }),
  };
}
```

### `gemini-research/index.ts` — the function the surveillance Lambda re-uses
```typescript
import { callBedrock, callGemini, parseAIJson } from "../shared/ai";

// ... (prompt templates omitted for brevity) ...

export async function searchWithGemini(
  enrichedDescription: string,
  searchQueries: string[]
): Promise<any> {
  const queriesText = searchQueries.map((q, i) => `${i + 1}. ${q}`).join("\n");
  const prompt = PROMPT
    .replace("{enrichedDescription}", enrichedDescription)
    .replace("{searchQueries}", queriesText);
  try {
    const result = await callGemini(prompt);
    return parseAIJson(result.text, "GeminiResearch");
  } catch (err: any) {
    console.warn("Gemini failed, using Bedrock fallback:", err.message);
    const fallbackPrompt = FALLBACK_PROMPT
      .replace("{enrichedDescription}", enrichedDescription)
      .replace("{searchQueries}", queriesText);
    const fallbackRaw = await callBedrock(fallbackPrompt);
    return parseAIJson(fallbackRaw, "BedrockResearchFallback");
  }
}
```

### DynamoDB Schema Context
- **Ideas table** (`LeDossier-Ideas`): PK=`userId`, SK=`ideaId`. Each item has: `title`, `rawInput`, `status` ("stasis"|"active"), `swot`, `confidenceScore`, `tags`, `createdAt`, `lastViewedAt`, `lastUpdatedAt`, `alertSensitivity`.
- **Updates table** (`LeDossier-Updates`): PK=`ideaId`, SK=`timestamp`. Each item has: `type` ("creation"|"surveillance"|"viewed"), `summary`, and optional fields like `confidenceDelta`, `newSourceCount`, `daysAway`.

### S3 Key Pattern
Ideas are stored under `ideas/{ideaId}/` with files like `analysis.json`, `research.json`, `swot.md`.

### Environment Variables Available in Lambda
`IDEAS_TABLE`, `UPDATES_TABLE`, `DOSSIER_BUCKET`, `GEMINI_API_KEY`, `USER_POOL_ID`, `USER_POOL_CLIENT_ID`

### Lambda `package.json` dependencies (already installed)
```json
{
  "dependencies": {
    "@aws-sdk/client-bedrock-runtime": "^3.700.0",
    "@aws-sdk/client-dynamodb": "^3.700.0",
    "@aws-sdk/client-s3": "^3.700.0",
    "@aws-sdk/lib-dynamodb": "^3.700.0",
    "aws-jwt-verify": "^5.1.1",
    "uuid": "^11.0.0"
  }
}
```

---

## Your Tasks (4 things to do)

### Task 1: Add `getFromS3` to `lambda/shared/storage.ts`

Update the existing `storage.ts` to also export a `getFromS3` function. This means:
- Add `GetObjectCommand` to the import from `@aws-sdk/client-s3`
- Add this function:

```typescript
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

**Do not** change the existing `storeToS3` function or the S3Client initialization.

### Task 2: Create `lambda/surveillance/index.ts`

This is a new Lambda triggered by EventBridge (no API Gateway, no auth). It:

1. **Scans** the Ideas table for all items where `status` is "stasis" or "active"
2. **For each idea**, runs `surveilleIdea()` which:
   - Loads existing `analysis.json` from S3 via `getFromS3`
   - Extracts `searchQueries` from the existing analysis (fallback to generic queries based on the title if not found)
   - Re-runs `searchWithGemini(enrichedDesc, searchQueries)` to get fresh research
   - Stores versioned research snapshot to `ideas/{ideaId}/research-{ISO_TIMESTAMP}.json` AND overwrites `ideas/{ideaId}/research.json`
   - Calls a local `generateSWOTUpdate()` function that sends a diff-aware prompt to Bedrock comparing the new research against the existing SWOT, producing an updated SWOT with a `changeSummary`
   - Stores versioned SWOT markdown to `ideas/{ideaId}/swot-{ISO_TIMESTAMP}.md` AND overwrites `ideas/{ideaId}/swot.md`
   - Updates the DynamoDB idea record with new `swot`, `confidenceScore`, and `lastUpdatedAt`
   - Logs a surveillance event to the Updates table with `type: "surveillance"`, `summary` (the changeSummary), `confidenceDelta`, and `newSourceCount`
3. **Returns** `{ processed, failed, total }` counts

**The diff-aware SWOT update prompt** should be a template string constant called `SWOT_UPDATE_PROMPT` that:
- Receives the existing idea analysis, existing SWOT, existing confidence score, and new research
- Instructs the model to keep valid existing entries, add new ones, remove outdated ones
- Asks the model to adjust confidence up or down based on new research
- Requires a `changeSummary` field (2-3 sentences describing what's new)
- Returns JSON: `{ swot: { strengths, weaknesses, opportunities, threats }, confidenceScore, confidenceRationale, changeSummary, recommendedNextStep }`

Also include a `formatSWOTMarkdown()` helper that produces a readable markdown document from the SWOT update data, including sections for the confidence score, what changed, each SWOT quadrant, and the recommended next step.

**Import paths:**
- `../shared/ai` for `callBedrock`, `parseAIJson`
- `../gemini-research` for `searchWithGemini`
- `../shared/storage` for `storeToS3`, `getFromS3`

### Task 3: Create `lambda/idea-view/index.ts`

This handles `GET /ideas/{ideaId}` from API Gateway with Cognito auth. It:

1. **Authenticates** the user via `getUserFromEvent`
2. **Gets** the `ideaId` from `event.pathParameters.ideaId`
3. **Fetches** the idea from DynamoDB using `GetCommand` with key `{ userId, ideaId }`
4. **Calculates** hours/days since `lastViewedAt`
5. **If away ≥ 24 hours:**
   - Queries the Updates table for all events where `ideaId` matches and `timestamp > lastViewedAt`
   - Filters for `type === "surveillance"` events
   - If there are surveillance events, builds a return briefing prompt and sends it to Bedrock
   - If no surveillance events, returns a simple "no new intel" message
6. **Updates** `lastViewedAt` to now
7. **Logs** a "viewed" event to the Updates table
8. **Returns** `{ idea, briefing, daysAway, hasBriefing }`

**The return briefing prompt** should be a template string constant called `BRIEFING_PROMPT` that:
- Receives the idea title, current SWOT, current confidence score, and a formatted list of surveillance updates
- Instructs the model to write a concise 4-6 sentence briefing in a direct analyst tone
- Returns JSON: `{ headline, body, viabilityDirection ("up"|"down"|"stable"), recommendedAction }`

Include graceful error handling — if Bedrock fails to generate the briefing, fall back to returning the raw change summaries with a calculated viability direction based on the sum of `confidenceDelta` values.

Store each generated briefing to S3 at `ideas/{ideaId}/briefings/briefing-{ISO_TIMESTAMP}.json`.

**Import paths:**
- `../shared/auth` for `getUserFromEvent`
- `../shared/responses` for `success`, `error`
- `../shared/ai` for `callBedrock`, `parseAIJson`
- `../shared/storage` for `storeToS3`

### Task 4: Save prompt template files

Save the two new prompt template strings (just the template text, not the TypeScript code) to:
- `prompts/swot-update.txt` — the SWOT_UPDATE_PROMPT template
- `prompts/return-briefing.txt` — the BRIEFING_PROMPT template

---

## Important Constraints

- **Do NOT modify `lib/ledossier-stack.ts`** — CDK changes happen in a separate chunk.
- **Do NOT modify any existing Lambda files** other than `shared/storage.ts`.
- **Match the existing code style** — template strings with `{placeholder}` replacements, same error handling patterns, same console.log patterns.
- **No new npm dependencies** — everything you need is already in `package.json`.
- This is a hackathon project. `Scan` is acceptable for the surveillance Lambda at this scale.

---END---

---

## Chunk 2 Prompt (for later)

**Scope:** Update `lib/ledossier-stack.ts` to add the surveillance Lambda (with EventBridge schedule), the idea-view Lambda (with `GET /ideas/{ideaId}` API route), a manual `POST /surveillance/trigger` route for demos, and all necessary IAM permissions. Then deploy with `cdk deploy`.

## Chunk 3 Prompt (for later)

**Scope:** Update `screens/IdeaVault.tsx` to wire up the idea card tap handler to call `GET /ideas/{ideaId}`, add a return briefing modal, add a "Run Surveillance" demo button, update `GENAI_LOG.md`, and seed demo data into DynamoDB.
