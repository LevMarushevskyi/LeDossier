# Migrate Le Dossier Auth: Flask OAuth → AWS Amplify (Native In-App Auth)

## Goal

Remove the Flask OAuth server entirely. Replace it with AWS Amplify Auth so users authenticate natively inside the React Native app (email/password fields, no browser redirect). Use the **Cognito `sub`** as the `userId` throughout the system.

## Existing Cognito Details

- **User Pool ID**: `us-east-1_XSZEJwbSO`
- **App Client ID**: `54lian7roa16c4rc4uou9mvu2v`
- **Region**: `us-east-1`

## Current Architecture (What to Remove)

- `flask/main.py` — Flask OAuth server that redirects to Cognito Hosted UI, handles callback, sends deep link back to app
- `screens/SignIn.tsx` — Uses `expo-web-browser` to open Flask `/login` in a browser, listens for deep link or `postMessage` callback
- `screens/IdeaVault.tsx` lines 122-144 — `handleSignOut` calls Flask `/logout` endpoint
- `ledossier-backend/lambda/shared/auth.ts` — Returns hardcoded `TEST_USER` instead of validating JWT

## Target Architecture

```
React Native App (Amplify Auth SDK)
  → User signs in with email/password (native UI, never leaves app)
  → Gets JWT tokens from Cognito directly
  → Sends JWT in Authorization header with API requests
  → Lambda validates JWT and extracts Cognito `sub` as userId
```

---

## Step-by-Step Instructions

### Step 1: Install Dependencies

In the project root (`/Users/del/LeGS/`):

```bash
npx expo install aws-amplify @aws-amplify/react-native @react-native-async-storage/async-storage @react-native-community/netinfo
```

These are required for Amplify Auth v6 to work with Expo/React Native.

### Step 2: Create Amplify Configuration

Create a new file `amplify-config.ts` in the project root:

```typescript
const amplifyConfig = {
  Auth: {
    Cognito: {
      userPoolId: 'us-east-1_XSZEJwbSO',
      userPoolClientId: '54lian7roa16c4rc4uou9mvu2v',
      signUpVerificationMethod: 'code' as const,
    },
  },
};

export default amplifyConfig;
```

**Important**: The existing Cognito app client (`54lian7roa16c4rc4uou9mvu2v`) is currently configured with a **client secret** (`oiktgi9sb0514gj0o324shmitmt7g3d1ca2bkn5sf4vh93n99jr` — visible in `flask/main.py` line 27). Amplify Auth for React Native **cannot use a client secret**. You need to either:
- Go to AWS Console → Cognito → User Pool `us-east-1_XSZEJwbSO` → App Integration → App clients → Edit the existing client and **uncheck "Generate client secret"** (this may require creating a new client), OR
- Create a **new app client** without a client secret and use that client ID in the config above.

If you create a new app client, update `userPoolClientId` in the config.

### Step 3: Initialize Amplify in App.tsx

Edit `App.tsx`. Add at the very top (before any component code):

```typescript
import { Amplify } from 'aws-amplify';
import amplifyConfig from './amplify-config';

Amplify.configure(amplifyConfig);
```

This must be called before any auth operations. Put it at the module level, above the `Stack` creation and `DoorTransition` component.

### Step 4: Create an Auth Context

Create a new file `contexts/AuthContext.tsx`:

```typescript
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getCurrentUser, fetchAuthSession, signIn, signOut, signUp, confirmSignUp, AuthUser } from 'aws-amplify/auth';

interface AuthContextType {
  user: { userId: string; email: string } | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (email: string, password: string) => Promise<{ isSignUpComplete: boolean; nextStep: any }>;
  confirmRegistration: (email: string, code: string) => Promise<void>;
  getAuthToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<{ userId: string; email: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkCurrentUser();
  }, []);

  async function checkCurrentUser() {
    try {
      const currentUser = await getCurrentUser();
      const session = await fetchAuthSession();
      const email = session.tokens?.idToken?.payload?.email as string ?? '';
      // Use the Cognito `sub` as the userId
      setUser({ userId: currentUser.userId, email });
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }

  async function login(email: string, password: string) {
    const result = await signIn({ username: email, password });
    if (result.isSignedIn) {
      await checkCurrentUser();
    }
  }

  async function logout() {
    await signOut();
    setUser(null);
  }

  async function register(email: string, password: string) {
    const result = await signUp({
      username: email,
      password,
      options: { userAttributes: { email } },
    });
    return { isSignUpComplete: result.isSignUpComplete, nextStep: result.nextStep };
  }

  async function confirmRegistration(email: string, code: string) {
    await confirmSignUp({ username: email, confirmationCode: code });
  }

  async function getAuthToken(): Promise<string | null> {
    try {
      const session = await fetchAuthSession();
      return session.tokens?.idToken?.toString() ?? null;
    } catch {
      return null;
    }
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, register, confirmRegistration, getAuthToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
```

**Key detail**: `currentUser.userId` is the Cognito `sub` (UUID). This is what gets used as the DynamoDB partition key.

### Step 5: Wrap App.tsx with AuthProvider

In `App.tsx`, wrap the `NavigationContainer` with `AuthProvider`:

```tsx
import { AuthProvider } from './contexts/AuthContext';

// Inside the App component's return:
return (
  <>
    <AuthProvider>
      <NavigationContainer onStateChange={handleNavigationStateChange}>
        {/* ... existing Stack.Navigator ... */}
      </NavigationContainer>
    </AuthProvider>
    <DoorTransition isActive={showTransition} />
  </>
);
```

### Step 6: Rewrite SignIn.tsx

Replace the entire contents of `screens/SignIn.tsx`. The new version should:

- Have email and password `TextInput` fields (styled to match the app: background `#0C001A`, text/accent `#FFFDEE`)
- Have a "SIGN IN" button that calls `useAuth().login(email, password)`
- Have a "CREATE ACCOUNT" toggle that shows a registration form (email + password + confirmation code)
- On successful sign-in, navigate to `IdeaVault`
- Show inline error messages on failure
- **Remove all imports**: `expo-web-browser`, `expo-linking` — they are no longer needed
- **Remove all deep link handling**, `postMessage` listeners, `localStorage` polling
- **Remove** the `FLASK_URL` constant

The sign-in flow becomes:
1. User enters email + password
2. Tap "SIGN IN" → calls `login(email, password)` from AuthContext
3. On success → `navigation.navigate('IdeaVault')`

The registration flow:
1. User enters email + password
2. Tap "CREATE ACCOUNT" → calls `register(email, password)`
3. Cognito sends a verification code to their email
4. User enters the code → calls `confirmRegistration(email, code)`
5. Then sign in normally

### Step 7: Update IdeaVault.tsx

Two changes needed:

**7a. Fix sign-out** (replace lines 122-144):

```typescript
import { useAuth } from '../contexts/AuthContext';

// Inside the component:
const { logout, getAuthToken } = useAuth();

const handleSignOut = async () => {
  await logout();
  navigation.navigate('Home');
};
```

Remove the Flask `/logout` fetch call and the `localStorage.removeItem` code.

**7b. Send JWT with API requests** (update the `handleConfirm` function around line 80):

```typescript
const token = await getAuthToken();

const response = await fetch(`${API_URL}/ideas`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  },
  body: JSON.stringify({ name: name.trim(), description: description.trim() }),
});
```

### Step 8: Add Auth Guard to Navigation

In `App.tsx`, optionally add auto-redirect logic: if the user is already signed in (from a previous session), skip Home/SignIn and go directly to IdeaVault. Use `useAuth().user` and `useAuth().isLoading` to determine this. Show a loading spinner while `isLoading` is true.

### Step 9: Update Lambda Auth — Validate JWT and Extract `sub`

Replace the contents of `ledossier-backend/lambda/shared/auth.ts` with real Cognito JWT validation:

```typescript
import { CognitoJwtVerifier } from "aws-jwt-verify";

export interface AuthUser {
  userId: string;  // This is the Cognito `sub`
  email: string;
  name: string;
}

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.USER_POOL_ID!,
  tokenUse: "id",
  clientId: process.env.USER_POOL_CLIENT_ID!,
});

export async function authenticateRequest(authHeader?: string): Promise<AuthUser> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }

  const token = authHeader.replace("Bearer ", "");
  const payload = await verifier.verify(token);

  return {
    userId: payload.sub,  // Cognito sub = userId = DynamoDB partition key
    email: (payload.email as string) ?? "",
    name: (payload.name as string) ?? (payload.email as string) ?? "",
  };
}

export async function getUserFromEvent(event: any): Promise<AuthUser> {
  const authHeader = event.headers?.Authorization || event.headers?.authorization;
  return authenticateRequest(authHeader);
}
```

**Note**: `getUserFromEvent` is now **async** (returns `Promise<AuthUser>`). You must update the call site in `lambda/idea-intake/index.ts` line 278:

```typescript
// Change from:
const user = getUserFromEvent(event);
// To:
const user = await getUserFromEvent(event);
```

### Step 10: Add `aws-jwt-verify` to the Lambda

```bash
cd ledossier-backend
npm install aws-jwt-verify
```

### Step 11: Update CDK Stack — Pass Cognito Config to Lambda

In `ledossier-backend/lib/ledossier-stack.ts`, add environment variables to the Lambda function (around line 51 in the `environment` block):

```typescript
environment: {
  IDEAS_TABLE: ideasTable.tableName,
  UPDATES_TABLE: updatesTable.tableName,
  DOSSIER_BUCKET: dossierBucket.bucketName,
  GEMINI_API_KEY: geminiApiKey,
  USER_POOL_ID: 'us-east-1_XSZEJwbSO',
  USER_POOL_CLIENT_ID: '54lian7roa16c4rc4uou9mvu2v',  // or the new client ID without secret
},
```

### Step 12: Add Cognito Authorizer to API Gateway (Optional but Recommended)

In the CDK stack, you can add a Cognito authorizer to API Gateway so that unauthenticated requests are rejected before they even reach your Lambda. This is optional since the Lambda now validates JWTs itself, but it adds a defense-in-depth layer:

```typescript
import * as cognito from 'aws-cdk-lib/aws-cognito';

// Reference existing user pool
const userPool = cognito.UserPool.fromUserPoolId(this, 'ExistingUserPool', 'us-east-1_XSZEJwbSO');

const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
  cognitoUserPools: [userPool],
});

ideasResource.addMethod(
  'POST',
  new apigateway.LambdaIntegration(ideaIntakeFn),
  {
    authorizer,
    authorizationType: apigateway.AuthorizationType.COGNITO,
  }
);
```

### Step 13: Deploy and Test

1. Deploy the backend changes:
   ```bash
   cd ledossier-backend
   npx cdk deploy
   ```

2. Start the Expo app:
   ```bash
   cd /Users/del/LeGS
   npx expo start
   ```

3. Test the flow:
   - Create an account (email + password)
   - Check email for verification code
   - Enter code to confirm
   - Sign in
   - Submit an idea — it should now be stored with your Cognito `sub` as the `userId` in DynamoDB
   - Sign out and sign back in to verify session persistence

### Step 14: Clean Up

After confirming everything works:

1. **Delete** `flask/main.py` (and the entire `flask/` directory)
2. **Remove** unused packages from the frontend `package.json`:
   - `expo-web-browser` — no longer needed (remove from `app.json` plugins too)
   - `expo-auth-session` — no longer needed
   - `react-native-webview` — no longer needed (unless used elsewhere)
3. Remove `expo-linking` **only if** it's not used for anything else (check other files first)
4. Remove the `"expo-web-browser"` entry from the `plugins` array in `app.json`

---

## Summary of Files Changed

| File | Action |
|---|---|
| `amplify-config.ts` | **Create** — Amplify configuration |
| `contexts/AuthContext.tsx` | **Create** — Auth state management |
| `App.tsx` | **Edit** — Add Amplify.configure(), wrap with AuthProvider |
| `screens/SignIn.tsx` | **Rewrite** — Native email/password form, remove all browser/deep-link code |
| `screens/IdeaVault.tsx` | **Edit** — Use AuthContext for sign-out, send JWT with API calls |
| `ledossier-backend/lambda/shared/auth.ts` | **Rewrite** — Cognito JWT validation, extract `sub` as userId |
| `ledossier-backend/lambda/idea-intake/index.ts` | **Edit** — `await getUserFromEvent(event)` (add await) |
| `ledossier-backend/lib/ledossier-stack.ts` | **Edit** — Add USER_POOL_ID and USER_POOL_CLIENT_ID env vars, optionally add Cognito authorizer |
| `ledossier-backend/package.json` | **Edit** — Add `aws-jwt-verify` dependency |
| `flask/` | **Delete** — No longer needed |
| `app.json` | **Edit** — Remove `expo-web-browser` from plugins |
| `package.json` | **Edit** — Remove unused browser/auth packages |

## Critical Detail: Cognito `sub` as userId

The Cognito `sub` is a UUID (e.g., `a1b2c3d4-e5f6-7890-abcd-ef1234567890`) that is immutable and unique per user. It is extracted from the JWT `sub` claim in the Lambda and used as the `userId` partition key in the `LeDossier-Ideas` DynamoDB table. This means:

- All existing test data (stored under `test-user-001`) will NOT be visible to real users — this is expected
- Each authenticated user gets their own isolated set of ideas
- The `sub` never changes even if the user changes their email
