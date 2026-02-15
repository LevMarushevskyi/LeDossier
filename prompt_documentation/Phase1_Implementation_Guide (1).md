# LeDossier Phase 1 — Idea Intake Pipeline Implementation Guide

> This guide walks through every step of implementing the Phase 1 idea intake flow, from setting up a stub authentication user through to a fully working pipeline that accepts an idea, researches it via Gemini, generates a SWOT analysis via Bedrock, and stores everything in DynamoDB and S3.

---

## Overview of the Phase 1 Flow

```
User Input (idea name + description)
    │
    ├──► Store raw idea in DynamoDB
    │
    ▼
Bedrock Idea Analysis (Lambda)
    • Completes/enriches the idea details
    • Generates structured keywords + search queries for Gemini
    • Stores enriched idea analysis in S3
    │
    ├──► Sends: idea description, keywords ──►  Gemini API
    │                                              • Searches for relevant recent news
    │                                              • Filters to only relevant results
    │                                              • Returns list of news source summaries
    │
    ◄── Receives: news summaries ◄──────────────┘
    │
    ▼
Bedrock SWOT Analysis (Lambda)
    • Takes enriched idea + news summaries
    • Generates full SWOT (Strengths, Weaknesses, Opportunities, Threats)
    • Calculates initial confidence score
    • Stores SWOT in S3
    • Updates DynamoDB idea record with SWOT data
```

---

## Prerequisites

Before starting, make sure you have:

- AWS account with Bedrock model access enabled (request access to Claude models in the Bedrock console — this can take a few minutes)
- AWS CLI configured with credentials (`aws configure`)
- Node.js 18+ installed
- A Google AI Studio API key for Gemini (get one at https://aistudio.google.com/apikey)
- AWS CDK installed globally (`npm install -g aws-cdk`)

---

## Step 0: Project Scaffolding

### 0.1 — Initialize the project

```bash
mkdir ledossier-backend
cd ledossier-backend
npm init -y
npm install aws-cdk-lib constructs
npm install -D typescript ts-node @types/node
npx tsc --init
```

### 0.2 — Create the folder structure

```
ledossier-backend/
├── bin/
│   └── app.ts                  # CDK app entry point
├── lib/
│   └── ledossier-stack.ts      # CDK stack definition
├── lambda/
│   ├── shared/
│   │   ├── auth.ts             # Stub auth helper
│   │   ├── valkey.ts           # Valkey client helper (stub for now)
│   │   └── responses.ts        # API response helpers
│   ├── idea-intake/
│   │   └── index.ts            # Idea submission handler
│   ├── idea-analysis/
│   │   └── index.ts            # Bedrock idea enrichment
│   ├── gemini-research/
│   │   └── index.ts            # Gemini news search
│   └── swot-generation/
│       └── index.ts            # Bedrock SWOT analysis
├── prompts/
│   ├── idea-analysis.txt       # Bedrock prompt for idea enrichment
│   ├── gemini-research.txt     # Gemini prompt for news search
│   └── swot-generation.txt     # Bedrock prompt for SWOT
├── cdk.json
├── tsconfig.json
└── package.json
```

Create all these directories now:

```bash
mkdir -p bin lib lambda/{shared,idea-intake,idea-analysis,gemini-research,swot-generation} prompts
```

---

## Step 1: Stub Authentication

The goal here is to create a mock auth layer that behaves exactly like Cognito will behave later, so you can swap it in without changing any Lambda code.

### 1.1 — Create the stub auth helper

Create `lambda/shared/auth.ts`:

```typescript
// Stub authentication module
// This simulates what Cognito will eventually provide.
// When you plug in Cognito later, replace this file's implementation
// but keep the same exported interface.

export interface AuthUser {
  userId: string;
  email: string;
  name: string;
}

// Hardcoded test user — replace with Cognito JWT validation later
const TEST_USER: AuthUser = {
  userId: "test-user-001",
  email: "demo@ledossier.tech",
  name: "Demo Detective",
};

/**
 * Validates the request and returns the authenticated user.
 *
 * CURRENT: Returns the hardcoded test user regardless of input.
 * FUTURE: Will extract the JWT from the Authorization header,
 *         validate it against Cognito, and return the real user.
 *
 * @param authHeader - The Authorization header value (ignored for now)
 * @returns The authenticated user object
 */
export function authenticateRequest(authHeader?: string): AuthUser {
  // TODO: Replace with real Cognito validation
  // const token = authHeader?.replace("Bearer ", "");
  // const decoded = await cognitoVerifier.verify(token);
  // return { userId: decoded.sub, email: decoded.email, name: decoded.name };

  return TEST_USER;
}

/**
 * Extracts the user from an API Gateway event.
 * Handles both REST API (v1) and HTTP API (v2) event formats.
 */
export function getUserFromEvent(event: any): AuthUser {
  const authHeader =
    event.headers?.Authorization ||
    event.headers?.authorization;
  return authenticateRequest(authHeader);
}
```

### 1.2 — Create the API response helper

Create `lambda/shared/responses.ts`:

```typescript
export function success(body: any) {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(body),
  };
}

export function error(statusCode: number, message: string) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({ error: message }),
  };
}
```

### 1.3 — Why this approach works

When you're ready to add real Cognito auth, you only need to:

1. Set up a Cognito User Pool (via CDK)
2. Add a Cognito authorizer to API Gateway
3. Replace the body of `authenticateRequest()` to decode the real JWT
4. Everything downstream (Lambda handlers, DynamoDB queries filtered by `userId`) stays unchanged because they all use the same `AuthUser` interface

---

## Step 2: DynamoDB Table + S3 Bucket Setup (CDK)

### 2.1 — Create the CDK stack

Create `lib/ledossier-stack.ts`:

```typescript
import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export class LeDossierStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ─── DynamoDB Tables ───

    const ideasTable = new dynamodb.Table(this, "IdeasTable", {
      tableName: "LeDossier-Ideas",
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "ideaId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For hackathon only
    });

    const updatesTable = new dynamodb.Table(this, "UpdatesTable", {
      tableName: "LeDossier-Updates",
      partitionKey: { name: "ideaId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "timestamp", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ─── S3 Bucket ───

    const dossierBucket = new s3.Bucket(this, "DossierBucket", {
      bucketName: `ledossier-dossiers-${this.account}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true, // For hackathon only
    });

    // ─── IAM Policy for Bedrock Access ───

    const bedrockPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream",
      ],
      resources: ["*"], // Scope down to specific model ARNs in production
    });

    // ─── Lambda: Idea Intake ───

    const ideaIntakeFn = new lambdaNode.NodejsFunction(this, "IdeaIntakeFn", {
      entry: "lambda/idea-intake/index.ts",
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_18_X,
      timeout: cdk.Duration.seconds(60),
      memorySize: 256,
      environment: {
        IDEAS_TABLE: ideasTable.tableName,
        DOSSIER_BUCKET: dossierBucket.bucketName,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY || "PLACEHOLDER",
      },
    });

    ideasTable.grantReadWriteData(ideaIntakeFn);
    updatesTable.grantReadWriteData(ideaIntakeFn);
    dossierBucket.grantReadWrite(ideaIntakeFn);
    ideaIntakeFn.addToRolePolicy(bedrockPolicy);

    // ─── API Gateway ───

    const api = new apigateway.RestApi(this, "LeDossierApi", {
      restApiName: "LeDossier API",
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    const ideas = api.root.addResource("ideas");
    ideas.addMethod("POST", new apigateway.LambdaIntegration(ideaIntakeFn));

    // ─── Outputs ───

    new cdk.CfnOutput(this, "ApiUrl", { value: api.url });
    new cdk.CfnOutput(this, "IdeasTableName", { value: ideasTable.tableName });
    new cdk.CfnOutput(this, "BucketName", { value: dossierBucket.bucketName });
  }
}
```

### 2.2 — Create the CDK app entry point

Create `bin/app.ts`:

```typescript
#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { LeDossierStack } from "../lib/ledossier-stack";

const app = new cdk.App();
new LeDossierStack(app, "LeDossierStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || "us-east-1",
  },
});
```

### 2.3 — Create `cdk.json`

```json
{
  "app": "npx ts-node bin/app.ts"
}
```

### 2.4 — Bootstrap and deploy

```bash
# Bootstrap CDK (first time only)
cdk bootstrap

# Deploy the stack
GEMINI_API_KEY=your_actual_key_here cdk deploy
```

Note the API Gateway URL from the output — you'll need it for testing.

---

## Step 3: Idea Intake Lambda

This is the single entry point that orchestrates the entire Phase 1 flow. When a user POSTs an idea, this Lambda handles the full pipeline synchronously (for the hackathon — you'd make this async via Step Functions later).

### 3.1 — Install Lambda dependencies

```bash
cd lambda
npm init -y
npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb @aws-sdk/client-s3 @aws-sdk/client-bedrock-runtime uuid
npm install -D @types/uuid
```

### 3.2 — Create the idea intake handler

Create `lambda/idea-intake/index.ts`:

```typescript
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { v4 as uuid } from "uuid";
import { getUserFromEvent } from "../shared/auth";
import { success, error } from "../shared/responses";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const bedrock = new BedrockRuntimeClient({});

const IDEAS_TABLE = process.env.IDEAS_TABLE!;
const DOSSIER_BUCKET = process.env.DOSSIER_BUCKET!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

export async function handler(event: any) {
  try {
    // ── Auth ──
    const user = getUserFromEvent(event);

    // ── Parse input ──
    const body = JSON.parse(event.body || "{}");
    const { name, description } = body;

    if (!name || !description) {
      return error(400, "Both 'name' and 'description' are required.");
    }

    const ideaId = uuid();
    const createdAt = new Date().toISOString();

    // ── Step 1: Store raw idea in DynamoDB ──
    await ddb.send(
      new PutCommand({
        TableName: IDEAS_TABLE,
        Item: {
          userId: user.userId,
          ideaId,
          title: name,
          rawInput: description,
          status: "stasis",
          createdAt,
          lastViewedAt: createdAt,
          lastUpdatedAt: createdAt,
          alertSensitivity: "balanced",
          tags: [],
          confidenceScore: 0,
          swot: null, // Will be populated after analysis
        },
      })
    );

    // ── Step 2: Bedrock Idea Analysis ──
    // Enriches the raw idea and generates search queries for Gemini
    const ideaAnalysis = await analyzeIdea(name, description);

    // Store the enriched analysis in S3
    await s3.send(
      new PutObjectCommand({
        Bucket: DOSSIER_BUCKET,
        Key: `ideas/${ideaId}/analysis.json`,
        Body: JSON.stringify(ideaAnalysis),
        ContentType: "application/json",
      })
    );

    // ── Step 3: Gemini Research ──
    // Search the web for relevant news using the keywords from Bedrock
    const researchResults = await searchWithGemini(
      ideaAnalysis.enrichedDescription,
      ideaAnalysis.searchQueries
    );

    // Store raw research in S3
    await s3.send(
      new PutObjectCommand({
        Bucket: DOSSIER_BUCKET,
        Key: `ideas/${ideaId}/research.json`,
        Body: JSON.stringify(researchResults),
        ContentType: "application/json",
      })
    );

    // ── Step 4: Bedrock SWOT Generation ──
    // Takes enriched idea + news summaries and generates the full SWOT
    const swotAnalysis = await generateSWOT(ideaAnalysis, researchResults);

    // Store SWOT as markdown in S3
    await s3.send(
      new PutObjectCommand({
        Bucket: DOSSIER_BUCKET,
        Key: `ideas/${ideaId}/swot.md`,
        Body: swotAnalysis.markdown,
        ContentType: "text/markdown",
      })
    );

    // ── Step 5: Update DynamoDB with SWOT results ──
    // Using a new PutCommand with all fields (simpler than UpdateCommand for hackathon)
    await ddb.send(
      new PutCommand({
        TableName: IDEAS_TABLE,
        Item: {
          userId: user.userId,
          ideaId,
          title: name,
          rawInput: description,
          status: "stasis",
          createdAt,
          lastViewedAt: createdAt,
          lastUpdatedAt: new Date().toISOString(),
          alertSensitivity: "balanced",
          tags: ideaAnalysis.tags,
          confidenceScore: swotAnalysis.confidenceScore,
          swot: swotAnalysis.swot,
        },
      })
    );

    // ── Return the complete dossier to the client ──
    return success({
      ideaId,
      title: name,
      status: "stasis",
      confidenceScore: swotAnalysis.confidenceScore,
      tags: ideaAnalysis.tags,
      swot: swotAnalysis.swot,
      researchSources: researchResults.sources,
      createdAt,
    });
  } catch (err: any) {
    console.error("Idea intake failed:", err);
    return error(500, `Idea intake failed: ${err.message}`);
  }
}

// ════════════════════════════════════════════════
//  BEDROCK: Idea Analysis
// ════════════════════════════════════════════════

async function analyzeIdea(name: string, description: string) {
  const prompt = `You are an expert business analyst and idea evaluator for LeDossier, an idea incubation platform.

A user has submitted the following raw idea:

<idea>
<name>${name}</name>
<description>${description}</description>
</idea>

Your job is to analyze this idea and produce a structured output. Even if the idea is vague or brief, do your best to infer the domain, target market, and key aspects.

Return your response as JSON with exactly this structure:
{
  "enrichedDescription": "A 2-3 sentence clear, professional articulation of what this idea is and what problem it solves",
  "domain": "The primary industry/domain (e.g., 'restaurant technology', 'fintech', 'edtech')",
  "targetMarket": "Who would use this product",
  "tags": ["array", "of", "3-5", "relevant", "keyword", "tags"],
  "searchQueries": [
    "A specific search query to find competitors in this space",
    "A specific search query to find enabling technologies",
    "A specific search query to find market trends or regulatory news",
    "A specific search query to find adjacent innovations"
  ],
  "keyAssumptions": ["2-3 key assumptions this idea relies on being true"]
}

Return ONLY the JSON object, no markdown formatting, no backticks, no explanation.`;

  const response = await bedrock.send(
    new InvokeModelCommand({
      modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    })
  );

  const result = JSON.parse(new TextDecoder().decode(response.body));
  const analysisText = result.content[0].text;

  // Parse the JSON response — strip any accidental markdown fencing
  const cleaned = analysisText.replace(/```json\n?|```\n?/g, "").trim();
  return JSON.parse(cleaned);
}

// ════════════════════════════════════════════════
//  GEMINI: Web Research
// ════════════════════════════════════════════════

async function searchWithGemini(
  enrichedDescription: string,
  searchQueries: string[]
) {
  const prompt = `You are a research analyst conducting competitive intelligence research.

<context>
An entrepreneur is exploring the following idea:
${enrichedDescription}
</context>

<task>
Search the web for the most recent and relevant information using these research angles:
${searchQueries.map((q, i) => `${i + 1}. ${q}`).join("\n")}

For each angle, find the most relevant recent developments (prioritize news from the last 6 months).

Return your findings as JSON with this exact structure:
{
  "sources": [
    {
      "title": "Title of the article or source",
      "url": "URL if available, otherwise 'N/A'",
      "date": "Publication date if available, otherwise 'recent'",
      "category": "competitor | technology | market | adjacent",
      "summary": "2-3 sentence summary of why this is relevant to the idea",
      "relevanceScore": 0.0-1.0
    }
  ],
  "landscapeSummary": "A 3-4 sentence overall summary of what the competitive landscape looks like for this idea right now"
}

Include 5-10 sources total. Only include sources with relevanceScore > 0.5.
Return ONLY the JSON object, no markdown formatting, no backticks.
</task>`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ googleSearch: {} }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4096,
        },
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `Gemini API error: ${response.status} ${JSON.stringify(data)}`
    );
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  const cleaned = text.replace(/```json\n?|```\n?/g, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // If Gemini doesn't return valid JSON, wrap the text response
    return {
      sources: [],
      landscapeSummary: text,
    };
  }
}

// ════════════════════════════════════════════════
//  BEDROCK: SWOT Generation
// ════════════════════════════════════════════════

async function generateSWOT(ideaAnalysis: any, researchResults: any) {
  const prompt = `You are a senior strategic analyst for LeDossier, a platform that builds living intelligence dossiers for entrepreneurial ideas.

<idea_analysis>
${JSON.stringify(ideaAnalysis, null, 2)}
</idea_analysis>

<research_results>
${JSON.stringify(researchResults, null, 2)}
</research_results>

Based on the enriched idea analysis and the web research results, generate a comprehensive SWOT analysis.

Requirements:
- Each SWOT entry should be specific and actionable, not generic MBA-speak
- Reference specific findings from the research where applicable
- Each entry should be 1-2 sentences
- Include 3-5 entries per SWOT category
- Calculate a confidence score (0.0 to 1.0) representing how viable this idea appears based on the current landscape. Be calibrated: 0.3-0.4 means questionable, 0.5-0.6 means plausible with challenges, 0.7-0.8 means strong opportunity, 0.9+ is rare and means overwhelming evidence of viability.

Return your response as JSON with exactly this structure:
{
  "swot": {
    "strengths": ["specific strength 1", "specific strength 2", ...],
    "weaknesses": ["specific weakness 1", "specific weakness 2", ...],
    "opportunities": ["specific opportunity 1", "specific opportunity 2", ...],
    "threats": ["specific threat 1", "specific threat 2", ...]
  },
  "confidenceScore": 0.0-1.0,
  "confidenceRationale": "2-3 sentences explaining why you assigned this confidence score",
  "recommendedNextStep": "One concrete next step the entrepreneur should take if they want to pursue this idea"
}

Return ONLY the JSON object, no markdown formatting, no backticks.`;

  const response = await bedrock.send(
    new InvokeModelCommand({
      modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      }),
    })
  );

  const result = JSON.parse(new TextDecoder().decode(response.body));
  const swotText = result.content[0].text;
  const cleaned = swotText.replace(/```json\n?|```\n?/g, "").trim();
  const swotData = JSON.parse(cleaned);

  // Generate a markdown version for S3 storage
  const markdown = generateSWOTMarkdown(swotData);

  return { ...swotData, markdown };
}

function generateSWOTMarkdown(swotData: any): string {
  const { swot, confidenceScore, confidenceRationale, recommendedNextStep } =
    swotData;

  return `# SWOT Analysis — ${new Date().toISOString().split("T")[0]}

## Confidence Score: ${(confidenceScore * 100).toFixed(0)}%
${confidenceRationale}

---

## Strengths
${swot.strengths.map((s: string) => `- ${s}`).join("\n")}

## Weaknesses
${swot.weaknesses.map((w: string) => `- ${w}`).join("\n")}

## Opportunities
${swot.opportunities.map((o: string) => `- ${o}`).join("\n")}

## Threats
${swot.threats.map((t: string) => `- ${t}`).join("\n")}

---

## Recommended Next Step
${recommendedNextStep}
`;
}
```

---

## Step 4: Write the Prompts to Disk (Documentation)

You need to document every prompt for the GenAI track. Save the prompts as standalone files in the `prompts/` directory so they're easy to reference in your `GENAI_LOG.md`.

### 4.1 — Create `prompts/idea-analysis.txt`

Copy the exact prompt string from the `analyzeIdea()` function into this file. This is the Bedrock prompt that enriches a raw idea and generates Gemini search queries.

### 4.2 — Create `prompts/gemini-research.txt`

Copy the exact prompt string from the `searchWithGemini()` function. This is the Gemini prompt that searches for relevant news.

### 4.3 — Create `prompts/swot-generation.txt`

Copy the exact prompt string from the `generateSWOT()` function. This is the Bedrock prompt that takes the enriched idea + research and generates the SWOT.

### 4.4 — Log your first GENAI_LOG entry

Create `GENAI_LOG.md` in the repo root:

```markdown
# LeDossier — GenAI Usage Log

## [Hour 0] — Project Scaffolding
**Tool**: Amazon Q Developer
**Prompt**: [paste whatever you used Q for during setup]
**Result**: [describe quality]
**Iteration**: [note any changes]

## [Hour X] — Idea Analysis Prompt (Bedrock)
**Tool**: AWS Bedrock (Claude 3.5 Sonnet)
**Prompt**: See prompts/idea-analysis.txt
**Result**: Successfully generates enriched idea with search queries from raw 1-sentence input
**Iteration**: v1 — initial draft

## [Hour X] — Gemini Research Prompt
**Tool**: Gemini 2.0 Flash
**Prompt**: See prompts/gemini-research.txt
**Result**: Returns 5-10 relevant sources with summaries
**Iteration**: v1 — initial draft. Using googleSearch tool for grounding.

## [Hour X] — SWOT Generation Prompt (Bedrock)
**Tool**: AWS Bedrock (Claude 3.5 Sonnet)
**Prompt**: See prompts/swot-generation.txt
**Result**: Generates specific, actionable SWOT with calibrated confidence score
**Iteration**: v1 — initial draft
```

---

## Step 5: Deploy and Test

### 5.1 — Deploy the stack

```bash
GEMINI_API_KEY=your_key_here cdk deploy
```

Note the `ApiUrl` output value.

### 5.2 — Test with curl

```bash
# Replace YOUR_API_URL with the actual API Gateway URL from cdk deploy output
curl -X POST YOUR_API_URL/ideas \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer stub-token" \
  -d '{
    "name": "RestaurantSafe",
    "description": "A platform that helps small restaurants automate health inspection prep using AI to scan their kitchen, flag violations, and generate compliance checklists"
  }'
```

You should get back a full JSON response with the idea ID, SWOT analysis, confidence score, research sources, and tags.

### 5.3 — Verify storage

```bash
# Check DynamoDB
aws dynamodb scan --table-name LeDossier-Ideas

# Check S3 (replace bucket name from CDK output)
aws s3 ls s3://ledossier-dossiers-ACCOUNT_ID/ideas/ --recursive
```

### 5.4 — Test with a minimal idea

Try the vaguest possible input to make sure the prompts handle it gracefully:

```bash
curl -X POST YOUR_API_URL/ideas \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Dog app",
    "description": "An app for dogs"
  }'
```

The SWOT should still be reasonable (not hallucinated garbage) and the confidence score should be lower, reflecting the vagueness.

---

## Step 6: Validate the End-to-End Flow

Walk through this checklist to confirm everything is working:

| # | Check | How to Verify |
|---|-------|---------------|
| 1 | Raw idea stored in DynamoDB | `aws dynamodb scan` — you should see the record with `status: "stasis"` |
| 2 | Enriched analysis stored in S3 | `aws s3 cp s3://BUCKET/ideas/IDEA_ID/analysis.json -` — should show enriched description, tags, search queries |
| 3 | Gemini research stored in S3 | `aws s3 cp s3://BUCKET/ideas/IDEA_ID/research.json -` — should show sources with summaries |
| 4 | SWOT markdown stored in S3 | `aws s3 cp s3://BUCKET/ideas/IDEA_ID/swot.md -` — should be a readable markdown dossier |
| 5 | DynamoDB updated with SWOT | `aws dynamodb scan` — the record should now have `swot` populated and `confidenceScore` > 0 |
| 6 | Auth user ID is consistent | The `userId` field in DynamoDB should be `test-user-001` |
| 7 | API returns full response | The curl response should contain `ideaId`, `swot`, `confidenceScore`, `tags`, and `researchSources` |

---

## Step 7: Common Issues and Fixes

### "Bedrock model access denied"
You need to request model access in the Bedrock console. Go to AWS Console → Bedrock → Model access → Request access to Claude 3.5 Sonnet. This takes a few minutes to propagate.

### "Gemini returns empty or malformed JSON"
The `googleSearch` tool in Gemini may not be available on all model versions. If it fails, fall back to `gemini-2.0-flash` without the `tools` parameter — you'll lose grounding but still get reasonable results based on Gemini's training data.

### "Lambda timeout"
The full pipeline (Bedrock → Gemini → Bedrock) can take 15-30 seconds. Make sure your Lambda timeout is at least 60 seconds in the CDK stack. If it's still timing out, check CloudWatch logs to see which step is slow.

### "Cannot find module" errors in Lambda
Make sure your Lambda's `bundling` options include the node_modules. If using `NodejsFunction` from CDK, it handles this automatically via esbuild. If you're packaging manually, ensure dependencies are included.

---

## Note on Nemotron Nano 12B v2

I noticed this noted on your whiteboard. If you're considering using NVIDIA Nemotron Nano 12B as a local/cheaper alternative to Bedrock for any of these steps, be aware that:

- It would need to be self-hosted (EC2 GPU instance or similar) — this adds infrastructure complexity during a hackathon
- It's not available through Bedrock, so it wouldn't count toward your AWS integration
- The SWOT generation quality will likely be significantly lower than Claude via Bedrock

My recommendation: stick with Bedrock (Claude) for all the analysis steps in the demo. If you want to showcase Nemotron, consider using it for a secondary feature like generating the idea tags or doing a quick relevance filter, where quality differences are less visible. But for the hackathon, optimizing for demo quality trumps everything.

---

## What's Next (Phase 2 Hooks)

This Phase 1 implementation leaves clean hooks for everything coming next:

- **Valkey integration**: After the DynamoDB write in Step 5, add Valkey writes (cache the idea state, store the embedding in VSS, add to the sorted set). The function structure already supports this — just add calls after each DynamoDB operation.
- **Real auth**: Swap `lambda/shared/auth.ts` implementation. Nothing else changes.
- **Step Functions**: Extract the three internal functions (`analyzeIdea`, `searchWithGemini`, `generateSWOT`) into separate Lambda functions and wire them through a Step Functions state machine. The logic stays identical.
- **Push notifications**: After the SWOT is generated, publish to SNS. The alert evaluation logic can be added as a post-SWOT step.
- **Surveillance pipeline**: The `searchWithGemini` and `generateSWOT` functions are reusable as-is for the scheduled surveillance runs — they just need to be called with the existing SWOT as additional context.
