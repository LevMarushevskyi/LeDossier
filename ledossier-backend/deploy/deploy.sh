#!/bin/bash
set -e

REGION="us-east-1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
STACK_NAME="LeDossierStack"
CODE_BUCKET="ledossier-lambda-code-${ACCOUNT_ID}"

if [ -z "$GEMINI_API_KEY" ]; then
  echo "ERROR: GEMINI_API_KEY is required."
  echo "Usage: GEMINI_API_KEY=<your_key> bash deploy/deploy.sh"
  exit 1
fi

echo "==> Bundling Lambda with esbuild..."
cd "$(dirname "$0")/.."
npx esbuild lambda/idea-intake/index.ts \
  --bundle \
  --platform=node \
  --target=node18 \
  --outfile=deploy/dist/index.js \
  --minify \
  --sourcemap

echo "==> Creating zip..."
cd deploy/dist
zip -j ../idea-intake.zip index.js index.js.map
cd ../..

echo "==> Ensuring S3 code bucket exists..."
aws s3 mb "s3://${CODE_BUCKET}" --region "${REGION}" 2>/dev/null || true

echo "==> Uploading Lambda zip to S3..."
aws s3 cp deploy/idea-intake.zip "s3://${CODE_BUCKET}/idea-intake.zip"

echo "==> Deploying CloudFormation stack..."
aws cloudformation deploy \
  --template-file deploy/template.yaml \
  --stack-name "${STACK_NAME}" \
  --parameter-overrides "GeminiApiKey=${GEMINI_API_KEY}" \
  --capabilities CAPABILITY_NAMED_IAM \
  --region "${REGION}" \
  --no-fail-on-empty-changeset

echo ""
echo "==> Stack outputs:"
aws cloudformation describe-stacks \
  --stack-name "${STACK_NAME}" \
  --region "${REGION}" \
  --query 'Stacks[0].Outputs' \
  --output table

echo ""
echo "Done! Use the ApiUrl above to test with:"
echo "curl -X POST <ApiUrl>ideas -H 'Content-Type: application/json' -d '{\"title\":\"Test Idea\",\"rawInput\":\"A test idea\"}'"
