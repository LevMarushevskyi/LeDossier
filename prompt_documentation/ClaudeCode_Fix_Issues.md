# LeDossier — Fix Issues & Complete API Integration

> Paste this into a fresh Claude Code instance from the root of your `LeDossier-master` repo.

---

## Prompt

```
Read the codebase thoroughly before making any changes. This is a hackathon project — speed matters, but don't break what's working.

## Project Overview

LeDossier is a noir-themed AI-powered idea incubation platform. Users submit business ideas, which get analyzed through a multi-model AI pipeline that produces enriched descriptions, competitive research, and SWOT analyses.

### Architecture

**Frontend**: React Native (Expo) app with:
- `App.tsx` — Root component, Amplify config, AuthProvider, navigation stack (Home → SignIn → IdeaVault), door transition animation
- `screens/Home.tsx` — Landing page with "SIGN IN" button
- `screens/SignIn.tsx` — Native email/password auth via Amplify (sign in, register, confirm code flows)
- `screens/IdeaVault.tsx` — Main app screen. Submits ideas via POST /ideas, fetches saved ideas via GET /ideas, renders SWOT/analysis results, has physics-based draggable idea cards using matter-js
- `contexts/AuthContext.tsx` — React context wrapping aws-amplify/auth (getCurrentUser, fetchAuthSession, signIn, signOut, signUp, confirmSignUp)
- `components/DraggableIdeaCard.tsx` — Reanimated + Gesture Handler card with physics
- `components/BackgroundNoise.tsx` — SVG Bayer dithering visual effect
- `utils/PhysicsEngine.ts` — matter-js wrapper for card physics

**Backend** (`ledossier-backend/`): AWS CDK-deployed serverless stack with:
- **API Gateway** REST API with Cognito authorizer
- **Lambda** (`lambda/idea-intake/index.ts`) — Single handler that orchestrates the full pipeline:
  1. Validates JWT via aws-jwt-verify against Cognito
  2. Stores raw idea in DynamoDB
  3. Calls Bedrock (Nemotron Nano 12B v2, Converse API) for idea enrichment
  4. Calls Gemini 2.0 Flash (REST API with googleSearch grounding) for web research
  5. Calls Bedrock again for SWOT generation
  6. Stores artifacts in S3, updates DynamoDB, returns full dossier JSON
- **DynamoDB tables**: `LeDossier-Ideas` (PK: userId, SK: ideaId), `LeDossier-Updates` (PK: ideaId, SK: timestamp)
- **S3 bucket**: `ledossier-dossiers-{ACCOUNT_ID}`
- **CDK stack**: `ledossier-backend/lib/ledossier-stack.ts`

**Auth flow**:
- Frontend uses aws-amplify SDK to authenticate against Cognito User Pool `us-east-1_XSZEJwbSO`
- Amplify client ID: `1n389pqmf8khutobtkj23rpd8n` (public client, no secret)
- JWT (id token) is sent in `Authorization: Bearer <token>` header on all API calls
- Lambda validates the JWT using `aws-jwt-verify` and extracts `sub` as userId
- API Gateway has a CognitoUserPoolsAuthorizer that also validates the token

**AI Pipeline**:
- Bedrock calls use `ConverseCommand` with model `nvidia.nemotron-nano-12b-v2` (NOT InvokeModel)
- Gemini calls use REST API: `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`
- All AI responses are parsed with `parseAIJson()` which strips markdown fencing and extracts JSON objects from prose

**Key files to understand before making changes**:
- `ledossier-backend/lib/ledossier-stack.ts` — CDK infrastructure
- `ledossier-backend/lambda/idea-intake/index.ts` — Pipeline handler
- `ledossier-backend/lambda/shared/auth.ts` — JWT verification
- `screens/IdeaVault.tsx` — Frontend API integration
- `contexts/AuthContext.tsx` — Auth state management

### Deployed API URL
The API is deployed at: `https://dhqrasy77i.execute-api.us-east-1.amazonaws.com/prod`

### Color palette
- Dark: #0C001A
- Cream: #FFFDEE

### Fonts
- Titles: PetitFormalScript_400Regular
- Body: NotoSerif_400Regular

---

## ISSUES TO FIX (in order of priority)

### Issue 1: CRITICAL — `aws-jwt-verify` missing from Lambda dependencies

`lambda/shared/auth.ts` imports `CognitoJwtVerifier` from `aws-jwt-verify`, but `ledossier-backend/lambda/package.json` does NOT list this dependency. The Lambda will crash on every single request with a module-not-found error.

**Fix**:
```bash
cd ledossier-backend/lambda
npm install aws-jwt-verify
```

Then verify that `aws-jwt-verify` appears in `ledossier-backend/lambda/package.json` under dependencies.

### Issue 2: CRITICAL — No GET /ideas endpoint exists

`screens/IdeaVault.tsx` calls `fetch(\`${API_URL}/ideas\`)` on mount (the `useEffect` with `fetchIdeas`) to load previously saved ideas. But the CDK stack (`ledossier-backend/lib/ledossier-stack.ts`) only defines `POST /ideas`. There is no GET method. This means the fetch silently fails and users never see their saved ideas when they reopen the app.

**Fix**: Add a GET method to the existing `/ideas` resource in the CDK stack, handled by the same Lambda. Then add GET handling to the Lambda.

In `ledossier-backend/lib/ledossier-stack.ts`, add a GET method on the `ideasResource`:
```typescript
ideasResource.addMethod(
  "GET",
  new apigateway.LambdaIntegration(ideaIntakeFn),
  {
    authorizer,
    authorizationType: apigateway.AuthorizationType.COGNITO,
  }
);
```

In `ledossier-backend/lambda/idea-intake/index.ts`, the handler currently assumes every request is a POST. Modify the handler to check the HTTP method:

```typescript
export async function handler(event: any) {
  try {
    const method = event.httpMethod || event.requestContext?.http?.method || "POST";

    if (method === "GET") {
      return handleGetIdeas(event);
    }

    // ... existing POST logic stays here unchanged ...
  } catch (err: any) {
    console.error("Pipeline error:", err);
    return error(`Pipeline failed: ${err.message}`, 500);
  }
}
```

Add a new `handleGetIdeas` function that queries DynamoDB for all ideas belonging to the authenticated user:

```typescript
import { DynamoDBDocumentClient, PutCommand, UpdateCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

async function handleGetIdeas(event: any) {
  const user = await getUserFromEvent(event);

  const result = await ddb.send(
    new QueryCommand({
      TableName: IDEAS_TABLE,
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: {
        ":uid": user.userId,
      },
      ScanIndexForward: false, // newest first
    })
  );

  return success({
    ideas: result.Items ?? [],
    count: result.Count ?? 0,
  });
}
```

Make sure `QueryCommand` is added to the import from `@aws-sdk/lib-dynamodb`.

### Issue 3: MINOR — Notification screen removed from nav but file still exists

`App.tsx` no longer includes Notification in the Stack.Navigator, but `screens/Notification.tsx` still exists on disk. The file also has an import for a `Button` component and navigates to 'IdeaVault' which may not work with the current nav stack.

**Fix**: Delete `screens/Notification.tsx` since it's dead code. If you want to keep the route available for later, that's fine too — but at minimum remove any imports of it from other files. Check that nothing else references the Notification screen.

### Issue 4: MINOR — `flask/` directory is dead code

The Flask OAuth server (`flask/main.py`) was replaced by the Amplify Auth migration. It's dead code now and contains hardcoded Cognito client secrets.

**Fix**: Delete the entire `flask/` directory. The `FLASK_TO_AMPLIFY_MIGRATION.md` can stay as documentation of the migration if desired, or delete it too.

---

## AFTER MAKING CHANGES

1. Verify `ledossier-backend/lambda/package.json` now includes `aws-jwt-verify`
2. Verify `ledossier-backend/lib/ledossier-stack.ts` has both GET and POST methods on `/ideas`
3. Verify `ledossier-backend/lambda/idea-intake/index.ts` has the GET handler with QueryCommand
4. Verify the QueryCommand import is added
5. Tell me to redeploy with:
```bash
cd ledossier-backend
GEMINI_API_KEY=<my_key> cdk deploy
```

Or if using the CloudFormation deploy script:
```bash
cd ledossier-backend
GEMINI_API_KEY=<my_key> bash deploy/deploy.sh
```

6. After deploy, give me a curl command to test both endpoints:
   - POST /ideas (create a new idea)
   - GET /ideas (list all ideas for the user)

Both curl commands should include an `Authorization: Bearer <token>` header placeholder.
```
