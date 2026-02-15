import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { getUserFromEvent } from "./auth";
import { success } from "./responses";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export async function handleGetIdeas(event: any) {
  const user = await getUserFromEvent(event);

  const result = await ddb.send(
    new QueryCommand({
      TableName: process.env.IDEAS_TABLE!,
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: {
        ":uid": user.userId,
      },
      ScanIndexForward: false,
    })
  );

  return success({
    ideas: result.Items ?? [],
    count: result.Count ?? 0,
  });
}
