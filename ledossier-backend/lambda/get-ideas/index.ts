import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { getUserFromEvent } from "../shared/auth";
import { success, error } from "../shared/responses";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const IDEAS_TABLE = process.env.IDEAS_TABLE!;

export async function handler(event: any) {
  try {
    const user = await getUserFromEvent(event);

    const result = await ddb.send(
      new QueryCommand({
        TableName: IDEAS_TABLE,
        KeyConditionExpression: "userId = :uid",
        ExpressionAttributeValues: {
          ":uid": user.userId,
        },
        ScanIndexForward: false,
      })
    );

    return success({ ideas: result.Items ?? [] });
  } catch (err: any) {
    console.error("Get ideas error:", err);
    return error(`Failed to fetch ideas: ${err.message}`, 500);
  }
}
