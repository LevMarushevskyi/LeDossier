import { handleGetIdeas } from "../shared/ideas";
import { error } from "../shared/responses";

export async function handler(event: any) {
  try {
    return await handleGetIdeas(event);
  } catch (err: any) {
    console.error("Get ideas error:", err);
    return error(`Failed to fetch ideas: ${err.message}`, 500);
  }
}
