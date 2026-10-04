import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.string().default("3001"),
  LLM_API_KEY: z
    .string({
      error: "LLM_API_KEY is required. Please provide a valid LLM API key.",
    })
    .min(1, "LLM_API_KEY cannot be empty."),
  DATABASE_URL: z
    .string({
      error:
        "DATABASE_URL is required. Please provide a PostgreSQL connection string.",
    })
    .min(1, "DATABASE_URL cannot be empty."),
  GITHUB_WEBHOOK_SECRET: z
    .string({
      error:
        "GITHUB_WEBHOOK_SECRET is required. Please provide a GitHub webhook secret.",
    })
    .min(1, "GITHUB_WEBHOOK_SECRET cannot be empty."),
  LLM_MODEL: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

/**
 * Validates environment variables against the Zod schema.
 * Throws a human-readable error detailing all missing or invalid variables.
 */
export function validateEnv(
  rawEnv: Record<string, string | undefined> = process.env,
): Env {
  const result = envSchema.safeParse(rawEnv);

  if (!result.success) {
    const issues = result.error.issues;
    const formattedErrors = issues
      .map((issue) => {
        const field = issue.path.join(".") || "unknown";
        return `  • [${field}]: ${issue.message}`;
      })
      .join("\n");

    const message = [
      "❌ Configuration Error: Missing or invalid environment variables.",
      "The following variables failed validation:",
      formattedErrors,
      "",
      "Ensure these variables are defined in your .env.local file or Vercel project settings.",
      "Refer to .env.example for required variable definitions.",
    ].join("\n");

    throw new Error(message);
  }

  return result.data;
}

/**
 * Returns validated environment variables, caching the result in memory.
 */
export function getEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = validateEnv(process.env);
  }
  return cachedEnv;
}

/**
 * Reset cached environment variables (useful for unit testing).
 */
export function resetEnvCache(): void {
  cachedEnv = null;
}

/**
 * Proxy object providing access to validated environment variables on demand.
 */
export const env: Env = new Proxy({} as Env, {
  get(_target, prop: string) {
    return getEnv()[prop as keyof Env];
  },
});
