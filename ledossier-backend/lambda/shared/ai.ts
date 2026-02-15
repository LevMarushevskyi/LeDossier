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
