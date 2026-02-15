import { CognitoJwtVerifier } from "aws-jwt-verify";

export interface AuthUser {
  userId: string; // Cognito `sub`
  email: string;
  name: string;
}

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.USER_POOL_ID!,
  tokenUse: "id",
  clientId: process.env.USER_POOL_CLIENT_ID!,
});

export async function authenticateRequest(
  authHeader?: string
): Promise<AuthUser> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }

  const token = authHeader.replace("Bearer ", "");
  const payload = await verifier.verify(token);

  return {
    userId: payload.sub,
    email: (payload.email as string) ?? "",
    name: (payload.name as string) ?? (payload.email as string) ?? "",
  };
}

export async function getUserFromEvent(event: any): Promise<AuthUser> {
  const authHeader =
    event.headers?.Authorization || event.headers?.authorization;
  return authenticateRequest(authHeader);
}
