# LeDossier Backend Scaffold — Claude Code Prompt

> Paste this into Claude Code from the root of your `LeDossier-master` repo.

---

## Prompt

```
I need you to build the backend for LeDossier, an idea incubation platform. Read the existing codebase first to understand what we have.

## What already exists (DO NOT modify these)

- **React Native Expo frontend** with 4 screens: Home.tsx, IdeaVault.tsx, Notification.tsx, Setting.tsx
- **IdeaVault.tsx** already has a working "IDEATE" button that opens a modal capturing `name` and `description` — these are stored in local React state via `handleConfirm()`. This is the input that will eventually POST to our backend.
- **agents/** directory has Python stubs showing our intended AI providers:
  - `agents/bedrock_agent.py` — uses `boto3` Converse API with `nvidia.nemotron-nano-12b-v2`
  - `agents/gemini_agent.py` — uses `google.genai` with Gemini
- **Color palette**: #0C001A (dark), #FFFDEE (cream)
- **Fonts**: Petit Formal Script (titles), Noto Serif (body)

## What I need you to build

A new `ledossier-backend/` directory (sibling to App.tsx, screens/, etc.) containing a CDK-deployed serverless backend. The flow is:

```
POST /ideas { name, description }
    │
    ├──► Store raw idea in DynamoDB
    │
    ▼
Bedrock (Nemotron Nano 12B v2) — Idea Analysis
    • Enriches the idea description
    • Generates structured keywords + search queries
    • Stores enriched analysis in S3
    │
    ├──► Sends enriched description + keywords to Gemini 2.0 Flash
    │    • Uses googleSearch grounding for real web results
    │    • Filters to relevant recent news
    │    • Returns list of source summaries
    │
    ◄── Receives news summaries
    │
    ▼
Bedrock (Nemotron Nano 12B v2) — SWOT Generation
    • Takes enriched idea + news summaries
    • Generates full SWOT analysis
    • Calculates confidence score (0.0-1.0)
    • Stores SWOT markdown in S3
    • Updates DynamoDB with results
    │
    ▼
Returns full dossier as JSON response
```

## STOP AND ASK ME for these values before writing any code:

1. **AWS Region** — which region should I deploy to? (default: us-east-1)
2. **Gemini API Key** — I need your Google AI Studio API key for Gemini. If you don't have one, get it at https://aistudio.google.com/apikey
3. **AWS CLI configured?** — Confirm you have run `aws configure` and have valid credentials
4. **CDK bootstrapped?** — Have you run `cdk bootstrap` in this AWS account/region before?
5. **Bedrock model access** — Have you enabled access to NVIDIA Nemotron Nano 12B v2 in the Bedrock console? (AWS Console → Bedrock → Model access → Request access)

## Directory structure to create

```
ledossier-backend/
├── bin/
│   └── app.ts                  # CDK app entry point
├── lib/
│   └── ledossier-stack.ts      # CDK stack definition
├── lambda/
│   ├── shared/
│   │   ├── auth.ts             # Stub auth (hardcoded test user)
│   │   ├── responses.ts        # API Gateway response helpers
│   │   └── valkey.ts           # Empty stub for future Valkey integration
│   ├── idea-intake/
│   │   └── index.ts            # Main handler: orchestrates full pipeline
│   ├── idea-analysis/
│   │   └── index.ts            # Placeholder — logic in idea-intake for now
│   ├── gemini-research/
│   │   └── index.ts            # Placeholder — logic in idea-intake for now
│   └── swot-generation/
│       └── index.ts            # Placeholder — logic in idea-intake for now
├── prompts/
│   ├── idea-analysis.txt       # Bedrock prompt for idea enrichment
│   ├── gemini-research.txt     # Gemini prompt for news search
│   └── swot-generation.txt     # Bedrock prompt for SWOT generation
├── cdk.json
├── tsconfig.json
└── package.json
```

Also create `GENAI_LOG.md` in the REPO ROOT (next to App.tsx, not inside ledossier-backend/).

## Implementation details

### Stub Authentication (lambda/shared/auth.ts)

Create a mock auth layer with the same interface that real Cognito will use later. When we swap in Cognito, only this file changes — everything downstream stays the same.

```typescript
export interface AuthUser {
  userId: string;
  email: string;
  name: string;
}

const TEST_USER: AuthUser = {
  userId: "test-user-001",
  email: "demo@ledossier.tech",
  name: "Demo Detective",
};

export function authenticateRequest(authHeader?: string): AuthUser {
  // TODO: Replace with Cognito JWT validation
  return TEST_USER;
}

export function getUserFromEvent(event: any): AuthUser {
  const authHeader =
    event.headers?.Authorization || event.headers?.authorization;
  return authenticateRequest(authHeader);
}
```

### Response helpers (lambda/shared/responses.ts)

Standard success/error wrappers with CORS headers (`Access-Control-Allow-Origin: *`).

### CDK Stack (lib/ledossier-stack.ts)

Infrastructure:
- **DynamoDB table**: `LeDossier-Ideas` — partition key `userId` (String), sort key `ideaId` (String), PAY_PER_REQUEST, DESTROY removal policy
- **DynamoDB table**: `LeDossier-Updates` — partition key `ideaId` (String), sort key `timestamp` (String), PAY_PER_REQUEST, DESTROY removal policy
- **S3 bucket**: `ledossier-dossiers-{ACCOUNT_ID}` — DESTROY removal, autoDeleteObjects true
- **Lambda**: `IdeaIntakeFn` using `NodejsFunction` pointing at `lambda/idea-intake/index.ts`
  - Runtime: Node.js 18, Timeout: 60s, Memory: 256MB
  - Environment: IDEAS_TABLE, DOSSIER_BUCKET, GEMINI_API_KEY
- **IAM**: Lambda gets read/write on both DynamoDB tables, read/write on S3, and Bedrock permissions: `bedrock:InvokeModel`, `bedrock:InvokeModelWithResponseStream`, `bedrock:Converse`
- **API Gateway**: REST API, CORS enabled, `POST /ideas` → Lambda integration
- **Outputs**: ApiUrl, IdeasTableName, BucketName

### Idea Intake Handler (lambda/idea-intake/index.ts)

This is the main orchestrator. It runs the full pipeline synchronously:

1. Parse event body for `name` and `description` (return 400 if missing)
2. `getUserFromEvent(event)` to get authenticated user
3. Generate UUID for ideaId
4. Store raw idea in DynamoDB: userId, ideaId, title, rawInput, status "stasis", createdAt, lastViewedAt, lastUpdatedAt, alertSensitivity "balanced", tags [], confidenceScore 0, swot null
5. `analyzeIdea(name, description)` → store result in S3 at `ideas/{ideaId}/analysis.json`
6. `searchWithGemini(enrichedDescription, searchQueries)` → store in S3 at `ideas/{ideaId}/research.json`
7. `generateSWOT(ideaAnalysis, researchResults)` → store markdown in S3 at `ideas/{ideaId}/swot.md`
8. Update DynamoDB record with SWOT, confidence score, tags
9. Return full dossier JSON

### CRITICAL: Bedrock API format

Nemotron Nano 12B uses the **Converse API**, NOT InvokeModel. Match the pattern from our existing `agents/bedrock_agent.py`. Use `ConverseCommand`:

```typescript
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

const bedrock = new BedrockRuntimeClient({});

async function callBedrock(prompt: string): Promise<string> {
  const response = await bedrock.send(
    new ConverseCommand({
      modelId: "nvidia.nemotron-nano-12b-v2",
      messages: [{ role: "user", content: [{ text: prompt }] }],
    })
  );
  return response.output?.message?.content?.[0]?.text ?? "";
}
```

Do NOT use `InvokeModelCommand` or the Anthropic message format for Bedrock calls.

### Gemini API format

Match the pattern from our existing `agents/gemini_agent.py`, but use the REST API (not the Python SDK) since our Lambda is Node.js. Call Gemini 2.0 Flash with googleSearch grounding:

```
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}

Body:
{
  "contents": [{ "parts": [{ "text": prompt }] }],
  "tools": [{ "googleSearch": {} }],
  "generationConfig": { "temperature": 0.3, "maxOutputTokens": 4096 }
}
```

### Prompts

All three AI functions should return structured JSON. Save the exact prompt text from each function to the corresponding file in `prompts/` for documentation.

**Idea Analysis prompt** should take the raw name + description and return:
- enrichedDescription, domain, targetMarket, tags (3-5), searchQueries (4 specific queries), keyAssumptions (2-3)

**Gemini Research prompt** should take the enriched description + search queries and return:
- sources array (title, url, date, category, summary, relevanceScore), landscapeSummary

**SWOT Generation prompt** should take the enriched analysis + research results and return:
- swot (strengths, weaknesses, opportunities, threats — 3-5 entries each, specific not generic)
- confidenceScore (0.0-1.0, calibrated: 0.3-0.4 questionable, 0.5-0.6 plausible, 0.7-0.8 strong, 0.9+ rare)
- confidenceRationale, recommendedNextStep
- Also generate a markdown version for S3 storage

All JSON parsing from AI responses should strip markdown fencing first: `.replace(/```json\n?|```\n?/g, "").trim()`

### GENAI_LOG.md (repo root)

```markdown
# LeDossier — GenAI Usage Log

## [Hour 0] — Project Scaffolding
**Tool**: Claude Code
**Prompt**: Backend scaffold generation
**Result**: [to be filled]
**Iteration**: v1

## [Hour X] — Idea Analysis Prompt (Bedrock)
**Tool**: AWS Bedrock (NVIDIA Nemotron Nano 12B v2)
**Prompt**: See ledossier-backend/prompts/idea-analysis.txt
**Result**: Generates enriched idea with search queries
**Iteration**: v1

## [Hour X] — Gemini Research Prompt
**Tool**: Gemini 2.0 Flash
**Prompt**: See ledossier-backend/prompts/gemini-research.txt
**Result**: Returns 5-10 relevant sources with summaries
**Iteration**: v1

## [Hour X] — SWOT Generation Prompt (Bedrock)
**Tool**: AWS Bedrock (NVIDIA Nemotron Nano 12B v2)
**Prompt**: See ledossier-backend/prompts/swot-generation.txt
**Result**: Generates SWOT with calibrated confidence score
**Iteration**: v1
```

### Lambda dependencies

Inside `ledossier-backend/lambda/`, create a separate package.json:
```bash
cd lambda
npm init -y
npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb @aws-sdk/client-s3 @aws-sdk/client-bedrock-runtime uuid
npm install -D @types/uuid
```

## Important notes

- Do NOT modify any existing files (App.tsx, screens/, agents/, etc.)
- Use `NodejsFunction` from `aws-cdk-lib/aws-lambda-nodejs` for automatic esbuild bundling
- Nemotron Nano 12B v2 uses the **Converse API** (`ConverseCommand`), NOT `InvokeModelCommand`. Do not use the Anthropic message format — use the Bedrock Converse format with `content: [{ text: prompt }]`
- Gemini API key passed via env var during deploy: `GEMINI_API_KEY=xxx cdk deploy`
- CORS headers on every response (success AND error)
- Do NOT create Cognito resources — I already have a User Pool manually. Stub auth is sufficient for now.

After creating all files, tell me to run:
```bash
cd ledossier-backend
npm install
cd lambda && npm install && cd ..
GEMINI_API_KEY=<my_key> cdk deploy
```

Then give me the curl command to test with a sample idea submission.
```
