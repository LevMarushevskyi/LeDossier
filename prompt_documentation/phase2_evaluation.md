# LeDossier Phase 2 — Evaluation & Prompt Calibration Fix

## Part 1: Evaluation

### What's Well Done

**The surveillance Lambda is genuinely clever.** The fresh/stack dual-mode design is smart — if the user hasn't read their last report, new intel gets consolidated into the unread report instead of generating a brand new SWOT update. This saves Bedrock calls and prevents the "inbox overload" problem where the user returns to find 8 stale reports. The `reportViewed` flag driving this is clean.

**Bounded concurrency.** Processing ideas 3 at a time instead of sequentially or all-at-once is the right call for a Lambda with a 5-minute timeout.

**Fire-and-forget with polling** in the frontend. The surveillance trigger wisely doesn't `await` the API response (which would timeout at API Gateway's 29s limit), and instead polls `GET /ideas` every 5 seconds to pick up changes as they land. The pre-sweep timestamp tracking to detect when "all ideas are done" is a nice touch.

**The idea-view Lambda is simple and correct.** No unnecessary Bedrock calls — it just reads `latestReport` from DynamoDB and marks it viewed. The briefing generation moved into surveillance (where it belongs) rather than being generated on-the-fly at view time.

**The report modal UI** with discoveries + action plan is much richer than the original "briefing" spec. Showing finding/impact pairs and a strategy memo is a real product feature.

**Small details that matter**: green dot on unread report cards, confidence delta badges, `formatTimeAgo`, and the memo comparison in `DraggableIdeaCard` to avoid unnecessary re-renders.

---

### Bugs & Quick Fixes

#### 1. Mixed DynamoDB SDK imports in surveillance Lambda (will work, but fragile)

The surveillance Lambda imports `ScanCommand` from `@aws-sdk/client-dynamodb` (raw SDK) but sends it through `DynamoDBDocumentClient`. It then manually `unmarshall()`s results. Meanwhile, `UpdateCommand` and `PutCommand` come from `@aws-sdk/lib-dynamodb` (document SDK) and use plain JS objects.

This works because DocumentClient can dispatch both raw and document commands, but it's confusing and fragile. If someone later changes the scan to use document-style filter values without realizing ScanCommand is raw, it'll silently produce wrong results.

**Fix:** Switch to the document client's ScanCommand.

```typescript
// CHANGE these imports:
import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";

// TO:
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

// THEN update the scan call — remove the marshalled {S: "..."} wrappers:
const scanResult = await ddb.send(
  new ScanCommand({
    TableName: IDEAS_TABLE,
    FilterExpression: "#status IN (:active, :stasis)",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: {
      ":active": "active",    // plain strings, not { S: "active" }
      ":stasis": "stasis",
    },
  })
);

const ideas = scanResult.Items ?? [];  // already unmarshalled by DocumentClient
// DELETE the unmarshall import and the .map(item => unmarshall(item)) call
```

#### 2. `callBedrock` default behavior changed for existing pipelines

The updated `ai.ts` now sends `inferenceConfig: { maxTokens: 4096, temperature: 0.4, topP: 0.9 }` on every Bedrock call. Previously there was no `inferenceConfig` at all, meaning the model used its own defaults. This changes the behavior of `idea-analysis`, `swot-generation`, and `gemini-research` (fallback) — all the existing Phase 1 prompts.

This probably isn't causing problems right now, but it's a silent behavior change. If you notice the initial intake pipeline producing different results, this is why.

**Fix (optional):** Only send `inferenceConfig` when config is explicitly passed:

```typescript
export async function callBedrock(
  prompt: string,
  config?: { maxTokens?: number; temperature?: number }
): Promise<string> {
  const response = await bedrock.send(
    new ConverseCommand({
      modelId: "nvidia.nemotron-nano-12b-v2",
      messages: [{ role: "user", content: [{ text: prompt }] }],
      ...(config && {
        inferenceConfig: {
          maxTokens: config.maxTokens ?? 4096,
          temperature: config.temperature ?? 0.4,
          topP: 0.9,
        },
      }),
    })
  );
  return response.output?.message?.content?.[0]?.text ?? "";
}
```

#### 3. `return-briefing.txt` prompt is orphaned

The `return-briefing.txt` prompt file describes a briefing generation flow, but `idea-view/index.ts` no longer calls Bedrock at all — it just reads `latestReport` from DynamoDB. The prompt is dead code in file form. Not a bug, but misleading for the GENAI_LOG.

**Fix:** Either delete `return-briefing.txt` and its GENAI_LOG entry, or add a note in the log that this prompt was superseded by the surveillance-generated reports.

#### 4. Surveillance button doesn't disable during idea intake loading

The `RUN SURVEILLANCE` button checks `surveillanceLoading` but not `loading` (the intake loading state). If a user taps IDEATE and then immediately taps RUN SURVEILLANCE while the intake pipeline is running, both will fire.

**Fix:**

```tsx
<TouchableOpacity
  style={[styles.testButton, (surveillanceLoading || loading) && styles.actionButtonDisabled]}
  onPress={handleRunSurveillance}
  disabled={surveillanceLoading || loading}
>
```

---

## Part 2: The 60-70% Confidence Problem

### Why It Happens

There are three compounding causes:

**1. Example anchoring.** Both the SWOT generation and surveillance update prompts include `"confidenceScore": 0.65` in their example JSON. LLMs treat example values as strong signals. When the model sees 0.65 in the template, it gravitates toward that value regardless of the actual analysis. This is the single biggest cause.

**2. Vague calibration criteria.** The current guidance is one line: `"0.3-0.4 = questionable, 0.5-0.6 = plausible, 0.7-0.8 = strong evidence, 0.9+ = exceptionally rare"`. This doesn't give the model enough information to distinguish a 0.25 idea from a 0.55 idea. What makes something "questionable"? The model defaults to the safe middle.

**3. LLM politeness bias.** Models are trained to be helpful and encouraging. Telling a user their idea scores 0.28 feels mean, so the model unconsciously avoids it. The prompt needs to explicitly override this tendency by framing honest low scores as the *helpful* thing to do.

**For surveillance specifically**, there's a fourth problem: the prompt says "adjust the confidence score up or down" which frames changes as incremental adjustments from the baseline. A ±3% tweak is the model's safe default. The prompt needs to tell the model that real-world evidence should produce *meaningful* swings.

### The Fix

Replace the confidence calibration section in **three prompts**: `swot-generation/index.ts`, the `SWOT_UPDATE_PROMPT` in `surveillance/index.ts`, and the `STACK_REPORT_PROMPT` in `surveillance/index.ts`.

#### New calibration block (use in all three prompts)

Replace the `"confidenceScore": 0.65` example value and the one-line calibration note with this:

```
CONFIDENCE SCORING RUBRIC — Follow this precisely:

0.00-0.15: DEAD ON ARRIVAL. Fatal flaw found: the core problem is already solved, the market doesn't exist, the idea violates physics/regulations in a way that can't be worked around, or there is a dominant entrenched competitor with no realistic path to differentiation.

0.15-0.30: SEVERELY CHALLENGED. Multiple critical weaknesses: the target market is tiny or shrinking, unit economics are clearly unworkable, key technology doesn't exist yet, or 3+ well-funded competitors already own this space with strong moats.

0.30-0.45: QUESTIONABLE. The idea has a kernel of validity but faces serious headwinds: crowded market with unclear differentiation, regulatory uncertainty that could kill it, or depends on assumptions that research suggests are wrong.

0.45-0.60: PLAUSIBLE BUT UNPROVEN. Reasonable concept with real market need, but significant unknowns remain. Typical for ideas that could work if key assumptions hold — but those assumptions haven't been validated. This is where MOST ideas should land on first analysis.

0.60-0.75: PROMISING. Research supports the core thesis. Identifiable market gap, manageable competition, feasible technology. Still has risks, but the path forward is visible. Reserve this for ideas where research actively confirms viability.

0.75-0.85: STRONG. Multiple data points support viability. Clear market demand, achievable differentiation, favorable timing. Only assign this when research evidence is compelling across multiple dimensions.

0.85-1.00: EXCEPTIONAL. Near-perfect market conditions. Almost never appropriate — use only when research reveals overwhelming evidence of product-market fit, wide-open market, and strong tailwinds. If you're assigning this, something is probably wrong with your analysis.

CRITICAL INSTRUCTIONS:
- Use the FULL range. A score of 0.20 for a bad idea is MORE helpful than a polite 0.55.
- Do NOT default to the 0.55-0.65 range. If you find yourself there, re-examine whether you're being genuinely analytical or just hedging.
- The example value in the JSON schema below is a PLACEHOLDER, not a target. Replace it with your actual assessment.
- Your job is to be an honest analyst, not an encouraging friend. Low scores protect the user from wasting time and money on doomed ideas. That is the most helpful thing you can do.
```

And change the example JSON value from `"confidenceScore": 0.65` to `"confidenceScore": "<REPLACE: use rubric above>"` to break the anchoring.

#### Additional changes for the surveillance SWOT_UPDATE_PROMPT

Replace `"Adjust the confidence score up or down based on whether new research strengthens or weakens the idea's viability"` with:

```
- RE-SCORE the confidence from scratch using the rubric and ALL available evidence (existing analysis + new research). Do NOT just nudge the previous score by a small amount. If new research reveals a fatal competitor or a market collapse, the score should DROP significantly (e.g., 0.60 → 0.30). If research reveals strong validation, the score should RISE significantly (e.g., 0.45 → 0.70). Small ±2-3% changes are a sign you're not actually processing the new information.
```

#### Changes for the initial SWOT generation prompt (`swot-generation/index.ts`)

Also add this line before the rubric:

```
Before scoring, explicitly ask yourself: "Would I invest my own money in this idea based on what the research shows?" If the answer is "absolutely not," the score should be below 0.30. If "maybe, with significant caveats," score 0.40-0.55. If "yes, this looks viable," score 0.60-0.75.
```

### Implementation

Here are the exact edits to make in each file:

#### `swot-generation/index.ts` — Replace the PROMPT constant

The key changes are: (a) replace the example `0.65` with a placeholder, (b) replace the one-line calibration with the full rubric, (c) add the "would I invest" gut-check.

In the existing prompt, find and replace:
```
  "confidenceScore": 0.65,
  "confidenceRationale": "Explanation of why this confidence level was assigned. 0.3-0.4 = questionable, 0.5-0.6 = plausible, 0.7-0.8 = strong evidence, 0.9+ = exceptionally rare",
```

With:
```
  "confidenceScore": "<REPLACE: use rubric>",
  "confidenceRationale": "Explanation referencing specific rubric tier and evidence that places the idea there",
```

And replace the final line:
```
Be specific, not generic. Reference actual findings from the research. Calibrate the confidence score carefully — most ideas should score 0.4-0.7.
```

With:
```
Be specific, not generic. Reference actual findings from the research.

Before scoring, ask yourself: "Would I invest my own money in this idea based on what the research shows?" If the answer is "absolutely not," score below 0.30. If "maybe, with caveats," score 0.40-0.55. If "yes, this looks viable," score 0.60-0.75.

CONFIDENCE SCORING RUBRIC — Follow this precisely:
0.00-0.15: DEAD ON ARRIVAL. Fatal flaw: problem already solved, market doesn't exist, or dominant competitor with unassailable moat.
0.15-0.30: SEVERELY CHALLENGED. Multiple critical weaknesses: tiny/shrinking market, broken unit economics, or 3+ well-funded competitors.
0.30-0.45: QUESTIONABLE. Kernel of validity but serious headwinds: crowded market, regulatory risk, or key assumptions contradicted by research.
0.45-0.60: PLAUSIBLE BUT UNPROVEN. Real market need, significant unknowns. This is where MOST ideas land on first analysis.
0.60-0.75: PROMISING. Research actively confirms viability. Clear market gap, manageable competition. Reserve for research-backed ideas.
0.75-0.85: STRONG. Multiple data points confirm viability across dimensions. Only when evidence is compelling.
0.85-1.00: EXCEPTIONAL. Almost never appropriate.

CRITICAL: Use the FULL range. A score of 0.20 for a bad idea is MORE helpful than a polite 0.55. Do NOT default to 0.55-0.65. Your job is honest analysis, not encouragement. Low scores protect users from wasting time on doomed ideas.
```

#### `surveillance/index.ts` — SWOT_UPDATE_PROMPT

Same pattern: replace the `0.65` example value with `"<REPLACE: use rubric>"`, replace the one-line calibration note at the bottom with the full rubric, and replace the adjustment instruction with the re-score instruction.

Find:
```
Calibrate the confidence score carefully — most ideas should score 0.4-0.7.
```

Replace with the full rubric block above, plus this additional surveillance-specific instruction:

```
SURVEILLANCE-SPECIFIC: RE-SCORE confidence from scratch using ALL evidence. Do NOT just nudge the previous score ±2-3%. If research reveals a fatal competitor, DROP the score hard (e.g., 0.60→0.30). If research validates a key assumption, RAISE it meaningfully (e.g., 0.45→0.70). Small deltas mean you aren't processing the new information.
```

Also find and replace:
```
  "confidenceScore": 0.65,
```
With:
```
  "confidenceScore": "<REPLACE: use rubric>",
```

#### `surveillance/index.ts` — STACK_REPORT_PROMPT

Find:
```
  "confidenceDelta": 0.05
```
Replace with:
```
  "confidenceDelta": "<REPLACE: meaningful delta reflecting new intel, e.g. -0.15 for bad news, +0.12 for good news>"
```

---

## Part 3: Quick Wins Summary

| # | Fix | Effort | Impact |
|---|-----|--------|--------|
| 1 | Switch surveillance ScanCommand to lib-dynamodb | 5 min | Prevents future bugs |
| 2 | Guard callBedrock inferenceConfig behind explicit config | 5 min | Prevents silent behavior changes |
| 3 | Clean up orphaned return-briefing.txt reference | 2 min | Accuracy |
| 4 | Disable surveillance button during intake loading | 1 min | UX correctness |
| **5** | **Prompt calibration overhaul (all 3 prompts)** | **20 min** | **Core product quality — this is the big one** |

Fix #5 is what transforms the product from "every idea gets a participation trophy" to "the tool that told me my idea was a 0.22 and saved me six months."
