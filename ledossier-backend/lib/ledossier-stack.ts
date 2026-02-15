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
