export interface AuthUser {
  userId: string;
  email: string;
  name: string;
}

const TEST_USER: AuthUser = {
  userId: "test-user-001",
  email: "demo@ledossier.tech",
  name: "Demo Detective",
};

export function authenticateRequest(authHeader?: string): AuthUser {
  // TODO: Replace with Cognito JWT validation
  return TEST_USER;
}

export function getUserFromEvent(event: any): AuthUser {
  const authHeader =
    event.headers?.Authorization || event.headers?.authorization;
  return authenticateRequest(authHeader);
}
