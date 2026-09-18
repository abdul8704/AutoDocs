import { z } from "zod";
import dotenv from "dotenv";
dotenv.config();

const envSchema = z.object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().default(5000),

    // GitHub OAuth & App Configuration
    GITHUB_CLIENT_ID: z.string().optional().default(""),
    GITHUB_CLIENT_SECRET: z.string().optional().default(""),
    GITHUB_APP_SLUG: z.string(),
    GITHUB_APP_ID: z.string(),
    GITHUB_APP_CLIENT_ID: z.string(),
    GITHUB_APP_CLIENT_SECRET: z.string(),
    GITHUB_APP_PRIVATE_KEY: z
        .string()
        .min(1)
        .transform((key) => key.replace(/\\n/g, "\n")),
    GITHUB_WEBHOOK_SECRET: z.string(),

    // Google Auth Configuration
    GOOGLE_CLIENT_SECRET: z.string().optional(),

    // Application URLs
    SERVER_URL: z.string().url(),
    CLIENT_URL: z.string().url(),

    // JWT Configuration
    JWT_ACCESS_SECRET: z.string(),
    JWT_REFRESH_SECRET: z.string(),
    ACCESS_TOKEN_EXPIRY: z.string().default("15m"),
    REFRESH_TOKEN_EXPIRY: z.string().default("30d"),

    // Database & Storage
    DATABASE_URL: z.string(),
    POSTGRES_PORT: z.coerce.number().default(5432),
    POSTGRES_USER: z.string().optional(),
    POSTGRES_PASSWORD: z.string().optional(),
    POSTGRES_DB: z.string().optional(),

    // Redis Configuration
    REDIS_HOST: z.string().default("localhost"),
    REDIS_PORT: z.coerce.number().default(6379),
    REDIS_PASSWORD: z.string().optional().default(""),
    PUSH_DEBOUNCE_MS: z.coerce.number().default(5000),

    // Admin Configuration
    ADMIN_EMAIL: z.string().optional(),
    ADMIN_EMAILS: z.string().optional(),

    // AI & LLM Configuration
    GEMINI_API_KEY: z.string(),
    DEFAULT_LLM_PROVIDER: z.string().optional().default("gemini"),
    TINY_REPO_PROVIDER: z.string().optional(),
    TINY_REPO_MODEL: z.string().optional(),
    JUDGE_PROVIDER: z.string().optional(),
    JUDGE_MODEL: z.string().optional(),
    DOCS_GENERATOR_PROVIDER: z.string().optional(),
    DOCS_GENERATOR_MODEL: z.string().optional(),
});

export const env = envSchema.parse(process.env);