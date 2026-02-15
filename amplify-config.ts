const amplifyConfig = {
  Auth: {
    Cognito: {
      userPoolId: 'us-east-1_XSZEJwbSO',
      userPoolClientId: '1n389pqmf8khutobtkj23rpd8n',
      signUpVerificationMethod: 'code' as const,
    },
  },
};

export default amplifyConfig;
