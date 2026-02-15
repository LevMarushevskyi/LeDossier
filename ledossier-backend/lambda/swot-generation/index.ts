import { callBedrock, parseAIJson } from "../shared/ai";

const PROMPT = `You are a strategic business analyst. Generate a SWOT analysis based on the idea analysis and research below. Return ONLY valid JSON (no markdown fencing, no explanation).

IDEA ANALYSIS:
{ideaAnalysis}

RESEARCH RESULTS:
{researchResults}

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
  "confidenceScore": "<REPLACE: use rubric>",
  "confidenceRationale": "Explanation referencing specific rubric tier and evidence that places the idea there",
  "recommendedNextStep": "The single most impactful next step the founder should take"
}

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

CRITICAL: Use the FULL range. A score of 0.20 for a bad idea is MORE helpful than a polite 0.55. Do NOT default to 0.55-0.65. Your job is honest analysis, not encouragement. Low scores protect users from wasting time on doomed ideas.`;

export async function generateSWOT(
  ideaAnalysis: any,
  researchResults: any
): Promise<{ swotJson: any; swotMarkdown: string }> {
  const prompt = PROMPT
    .replace("{ideaAnalysis}", JSON.stringify(ideaAnalysis, null, 2))
    .replace("{researchResults}", JSON.stringify(researchResults, null, 2));

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
