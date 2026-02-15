import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";
import { getUserFromEvent } from "../shared/auth";
import { success, error } from "../shared/responses";
import { handleGetIdeas } from "../shared/ideas";
import { storeToS3 } from "../shared/storage";
import { analyzeIdea } from "../idea-analysis";
import { searchWithGemini } from "../gemini-research";
import { generateSWOT } from "../swot-generation";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const IDEAS_TABLE = process.env.IDEAS_TABLE!;
const UPDATES_TABLE = process.env.UPDATES_TABLE!;

export async function handler(event: any) {
  try {
    const method = event.httpMethod || event.requestContext?.http?.method || "POST";

    if (method === "GET") {
      return handleGetIdeas(event);
    }

    // 1. Parse input
    const body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    const { title, rawInput } = body || {};

    if (!title || !rawInput) {
      return error("Both 'title' and 'rawInput' are required", 400);
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
          title,
          rawInput,
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
    const ideaAnalysis = await analyzeIdea(title, rawInput);
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
          summary: `Idea "${title}" created and analyzed`,
        },
      })
    );

    // 10. Return full dossier
    return success({
      ideaId,
      title,
      rawInput,
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
