import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

const bedrock = new BedrockRuntimeClient({});

export async function callBedrock(
  prompt: string,
  config?: { maxTokens?: number; temperature?: number }
): Promise<string> {
  const response = await bedrock.send(
    new ConverseCommand({
      modelId: "nvidia.nemotron-nano-12b-v2",
      messages: [{ role: "user", content: [{ text: prompt }] }],
      inferenceConfig: {
        maxTokens: config?.maxTokens ?? 4096,
        temperature: config?.temperature ?? 0.4,
        topP: 0.9,
      },
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

export function parseAIJson(raw: string, label: string = "AI", requiredFields?: string[]): any {
  console.log(`[${label}] Raw response (${raw.length} chars):`, raw.substring(0, 500));

  // Strip markdown fencing
  let cleaned = raw.replace(/```json\n?|```\n?/g, "").trim();

  let parsed: any;
  // Try direct parse first
  try {
    parsed = JSON.parse(cleaned);
  } catch (_) {
    // Try to extract JSON object from surrounding text
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch (e: any) {
        console.error(`[${label}] Failed to parse extracted JSON:`, e.message);
        console.error(`[${label}] Full raw response:`, raw);
        throw new Error(`${label}: Could not parse AI response as JSON`);
      }
    } else {
      console.error(`[${label}] No JSON object found in response:`, raw);
      throw new Error(`${label}: No JSON found in AI response`);
    }
  }

  // Validate required fields if specified
  if (requiredFields) {
    const missing = requiredFields.filter((field) => {
      const parts = field.split(".");
      let obj = parsed;
      for (const part of parts) {
        if (obj == null || typeof obj !== "object") return true;
        obj = obj[part];
      }
      return obj === undefined || obj === null;
    });
    if (missing.length > 0) {
      console.warn(`[${label}] Missing required fields: ${missing.join(", ")}. Keys present: ${Object.keys(parsed).join(", ")}`);
    }
  }

  return parsed;
}
