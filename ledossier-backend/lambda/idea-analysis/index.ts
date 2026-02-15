// Placeholder — idea analysis logic is currently in idea-intake/index.ts
// This will be extracted into its own Lambda when the pipeline moves to async Step Functions

export async function handler(event: any) {
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: "Idea analysis placeholder. Logic lives in idea-intake for now.",
    }),
  };
}
