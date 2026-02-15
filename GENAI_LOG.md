# LeDossier — GenAI Usage Log

## [Hour 0] — Project Scaffolding
**Tool**: Claude Code
**Prompt**: Backend scaffold generation
**Result**: Created CDK-deployed serverless backend with API Gateway, Lambda, DynamoDB, S3
**Iteration**: v1

## [Hour X] — Idea Analysis Prompt (Bedrock)
**Tool**: AWS Bedrock (NVIDIA Nemotron Nano 12B v2)
**Prompt**: See ledossier-backend/prompts/idea-analysis.txt
**Result**: Generates enriched idea with search queries
**Iteration**: v1

## [Hour X] — Gemini Research Prompt
**Tool**: Gemini 2.0 Flash
**Prompt**: See ledossier-backend/prompts/gemini-research.txt
**Result**: Returns 5-10 relevant sources with summaries
**Iteration**: v1

## [Hour X] — SWOT Generation Prompt (Bedrock)
**Tool**: AWS Bedrock (NVIDIA Nemotron Nano 12B v2)
**Prompt**: See ledossier-backend/prompts/swot-generation.txt
**Result**: Generates SWOT with calibrated confidence score
**Iteration**: v1

## [Hour X] — SWOT Update / Surveillance Prompt (Bedrock)
**Tool**: AWS Bedrock (NVIDIA Nemotron Nano 12B v2)
**Prompt**: See ledossier-backend/prompts/swot-update.txt
**Result**: Diff-aware SWOT update comparing new research against existing analysis, adjusts confidence score, produces changeSummary
**Iteration**: v1

## [Hour X] — Return Briefing Prompt (Bedrock) — SUPERSEDED
**Tool**: AWS Bedrock (NVIDIA Nemotron Nano 12B v2)
**Prompt**: See ledossier-backend/prompts/return-briefing.txt
**Result**: Originally generated concise intelligence briefing for users returning after 24+ hours. Superseded by surveillance-generated reports in Phase 2 — idea-view Lambda now reads latestReport from DynamoDB instead of calling Bedrock. Prompt file is orphaned.
**Iteration**: v1 (deprecated)
