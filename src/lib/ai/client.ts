// Phase 13 — DeepSeek client singleton, extracted so debate.ts can use it
// without circular-importing ai.ts (which itself depends on prisma + this
// client). All AI modules — coach, plan, conclusion, debate, review — go
// through this single entry point.

import OpenAI from "openai";

let _client: OpenAI | null = null;

export function getDeepseekClient(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error(
      "DEEPSEEK_API_KEY is not set. Configure it in .env.local for dev or in /root/ai-quant-copilot/.env on prod.",
    );
  }
  _client = new OpenAI({
    apiKey,
    baseURL: "https://api.deepseek.com",
  });
  return _client;
}

// `deepseek-chat` is V3-0324; `deepseek-reasoner` (R1) is also acceptable but
// slower and pricier. Allow override so deployments can pin a model.
export const DEEPSEEK_MODEL = process.env.AI_MODEL || "deepseek-chat";
