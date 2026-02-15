# LeDossier Phase 2 — Chunk 2 Prompt: CDK Infrastructure + Deploy

Copy everything between the `---START---` and `---END---` markers and paste it as your first message in a new Claude Code session, run from the `ledossier-backend/` directory.

---START---

# Task: LeDossier Phase 2, Chunk 2 — CDK Infrastructure + Deploy

You are working on **LeDossier**, a hackathon project — an AI-powered idea incubation platform. The backend is an AWS CDK project. In a previous step, we added new Lambda function code for two features:

1. **Surveillance Lambda** (`lambda/surveillance/index.ts`) — a background job that re-runs research and updates SWOT analyses for all active ideas. Triggered by EventBridge on a schedule, NOT by API Gateway. No auth needed.
2. **Idea View Lambda** (`lambda/idea-view/index.ts`) — handles `GET /ideas/{ideaId}`, authenticates the user, fetches the idea, optionally generates a return briefing if the user has been away >24 hours. Needs Cognito auth.

**Your job is to update the CDK stack to wire up these new Lambdas, then deploy.**

## Current CDK Stack

Here is the **complete, current** `lib/ledossier-stack.ts` — this is the only file you will modify:

```typescript
import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambdaRuntime from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";
import * as path from "path";

export class LeDossierStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // --- DynamoDB Tables ---

    const ideasTable = new dynamodb.Table(this, "IdeasTable", {
      tableName: "LeDossier-Ideas",
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "ideaId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const updatesTable = new dynamodb.Table(this, "UpdatesTable", {
      tableName: "LeDossier-Updates",
      partitionKey: { name: "ideaId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "timestamp", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // --- S3 Bucket ---

    const dossierBucket = new s3.Bucket(this, "DossierBucket", {
      bucketName: `ledossier-dossiers-${this.account}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // --- Lambda Function ---

    const geminiApiKey = process.env.GEMINI_API_KEY ?? "PLACEHOLDER";

    const ideaIntakeFn = new lambda.NodejsFunction(this, "IdeaIntakeFn", {
      entry: path.join(__dirname, "../lambda/idea-intake/index.ts"),
      handler: "handler",
      runtime: lambdaRuntime.Runtime.NODEJS_18_X,
      timeout: cdk.Duration.seconds(60),
      memorySize: 256,
      environment: {
        IDEAS_TABLE: ideasTable.tableName,
        UPDATES_TABLE: updatesTable.tableName,
        DOSSIER_BUCKET: dossierBucket.bucketName,
        GEMINI_API_KEY: geminiApiKey,
        USER_POOL_ID: "us-east-1_XSZEJwbSO",
        USER_POOL_CLIENT_ID: "1n389pqmf8khutobtkj23rpd8n",
      },
      bundling: {
        externalModules: [],
        minify: true,
        sourceMap: true,
      },
    });

    // --- IAM Permissions ---

    ideasTable.grantReadWriteData(ideaIntakeFn);
    updatesTable.grantReadWriteData(ideaIntakeFn);
    dossierBucket.grantReadWrite(ideaIntakeFn);

    ideaIntakeFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
          "bedrock:Converse",
        ],
        resources: ["*"],
      })
    );

    // --- API Gateway ---

    const api = new apigateway.RestApi(this, "LeDossierApi", {
      restApiName: "LeDossier API",
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          "Content-Type",
          "Authorization",
          "X-Amz-Date",
          "X-Api-Key",
        ],
      },
    });

    // --- Cognito Authorizer ---

    const userPool = cognito.UserPool.fromUserPoolId(
      this,
      "ExistingUserPool",
      "us-east-1_XSZEJwbSO"
    );

    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(
      this,
      "CognitoAuthorizer",
      { cognitoUserPools: [userPool] }
    );

    const ideasResource = api.root.addResource("ideas");
    ideasResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(ideaIntakeFn),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    ideasResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(ideaIntakeFn),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // --- Outputs ---

    new cdk.CfnOutput(this, "ApiUrl", {
      value: api.url,
      description: "LeDossier API Gateway URL",
    });

    new cdk.CfnOutput(this, "IdeasTableName", {
      value: ideasTable.tableName,
      description: "DynamoDB Ideas table name",
    });

    new cdk.CfnOutput(this, "BucketName", {
      value: dossierBucket.bucketName,
      description: "S3 Dossier bucket name",
    });
  }
}
```

## What You Need to Add

Add **all of the following** inside the constructor, **after** the existing `ideasResource.addMethod("GET", ...)` block and **before** the `// --- Outputs ---` section.

### 1. New imports at the top of the file

Add these two imports alongside the existing ones:

```typescript
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
```

### 2. Surveillance Lambda

```typescript
const surveillanceFn = new lambda.NodejsFunction(this, "SurveillanceFn", {
  entry: path.join(__dirname, "../lambda/surveillance/index.ts"),
  handler: "handler",
  runtime: lambdaRuntime.Runtime.NODEJS_18_X,
  timeout: cdk.Duration.minutes(5),  // longer — processes multiple ideas
  memorySize: 512,
  environment: {
    IDEAS_TABLE: ideasTable.tableName,
    UPDATES_TABLE: updatesTable.tableName,
    DOSSIER_BUCKET: dossierBucket.bucketName,
    GEMINI_API_KEY: geminiApiKey,
  },
  bundling: { externalModules: [], minify: true, sourceMap: true },
});
```

Key differences from the existing intake Lambda:
- **No `USER_POOL_ID` or `USER_POOL_CLIENT_ID`** — surveillance runs as a background job with no auth
- **5 minute timeout** instead of 60 seconds — it processes all ideas sequentially
- **512 MB memory** instead of 256 — more headroom for multiple AI calls

### 3. Surveillance Lambda IAM permissions

Grant it the same DynamoDB, S3, and Bedrock access as the intake function:

```typescript
ideasTable.grantReadWriteData(surveillanceFn);
updatesTable.grantReadWriteData(surveillanceFn);
dossierBucket.grantReadWrite(surveillanceFn);
surveillanceFn.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream", "bedrock:Converse"],
    resources: ["*"],
  })
);
```

### 4. EventBridge schedule rule

Triggers surveillance every 6 hours:

```typescript
const surveillanceRule = new events.Rule(this, "SurveillanceSchedule", {
  ruleName: "LeDossier-Surveillance",
  schedule: events.Schedule.rate(cdk.Duration.hours(6)),
  description: "Runs idea surveillance every 6 hours",
});
surveillanceRule.addTarget(new targets.LambdaFunction(surveillanceFn));
```

### 5. Idea View Lambda

```typescript
const ideaViewFn = new lambda.NodejsFunction(this, "IdeaViewFn", {
  entry: path.join(__dirname, "../lambda/idea-view/index.ts"),
  handler: "handler",
  runtime: lambdaRuntime.Runtime.NODEJS_18_X,
  timeout: cdk.Duration.seconds(60),
  memorySize: 256,
  environment: {
    IDEAS_TABLE: ideasTable.tableName,
    UPDATES_TABLE: updatesTable.tableName,
    DOSSIER_BUCKET: dossierBucket.bucketName,
    GEMINI_API_KEY: geminiApiKey,
    USER_POOL_ID: "us-east-1_XSZEJwbSO",
    USER_POOL_CLIENT_ID: "1n389pqmf8khutobtkj23rpd8n",
  },
  bundling: { externalModules: [], minify: true, sourceMap: true },
});
```

This one **does** need `USER_POOL_ID` and `USER_POOL_CLIENT_ID` because it authenticates the user via `getUserFromEvent`.

### 6. Idea View Lambda IAM permissions

```typescript
ideasTable.grantReadWriteData(ideaViewFn);
updatesTable.grantReadWriteData(ideaViewFn);
dossierBucket.grantReadWrite(ideaViewFn);
ideaViewFn.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream", "bedrock:Converse"],
    resources: ["*"],
  })
);
```

### 7. New API Gateway routes

Two new routes, both using the existing `authorizer` and `ideasResource`:

```typescript
// GET /ideas/{ideaId} → view single idea + trigger return briefing
const singleIdea = ideasResource.addResource("{ideaId}");
singleIdea.addMethod(
  "GET",
  new apigateway.LambdaIntegration(ideaViewFn),
  { authorizer, authorizationType: apigateway.AuthorizationType.COGNITO }
);

// POST /surveillance/trigger → manual trigger for demo
const surveillanceResource = api.root.addResource("surveillance");
const triggerResource = surveillanceResource.addResource("trigger");
triggerResource.addMethod(
  "POST",
  new apigateway.LambdaIntegration(surveillanceFn),
  { authorizer, authorizationType: apigateway.AuthorizationType.COGNITO }
);
```

Note: The manual trigger route still uses Cognito auth so random people can't invoke your surveillance cycle.

## After Editing

### Verify the file structure

Confirm these Lambda entry points exist before deploying:
- `lambda/surveillance/index.ts` (created in the previous chunk)
- `lambda/idea-view/index.ts` (created in the previous chunk)

If either is missing, stop and report — they should already be there from the previous step.

### Deploy

```bash
cd ledossier-backend
npx cdk deploy --require-approval never
```

Watch for errors. If the deploy succeeds, note the API URL output — it's needed for the frontend step.

## Important Constraints

- **Only modify `lib/ledossier-stack.ts`** — do not touch any Lambda code or other files.
- **Do not change any existing resources** — don't rename tables, change the existing Lambda config, or modify existing API routes. Only add new resources.
- **Keep the Cognito pool IDs hardcoded** as `us-east-1_XSZEJwbSO` and `1n389pqmf8khutobtkj23rpd8n` — this is a hackathon project using a pre-existing pool.
- The `GEMINI_API_KEY` is read from `process.env.GEMINI_API_KEY` at synth time (already in the file as `geminiApiKey`). Make sure the surveillance Lambda gets this env var too.

---END---
