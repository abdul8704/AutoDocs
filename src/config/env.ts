import { z } from "zod";
import dotenv from "dotenv";
dotenv.config();

const envSchema = z.object({
    PORT: z.coerce.number().default(5000),
    GITHUB_WEBHOOK_SECRET: z.string(),
    GITHUB_CLIENT_ID: z.string(),
    GITHUB_CLIENT_SECRET: z.string(),
    GITHUB_APP_PRIVATE_KEY: z
        .string()
        .min(1)
        .transform((key) => key.replace(/\\n/g, "\n")),

    GITHUB_APP_ID: z.string(),
    GITHUB_APP_CLIENT_ID: z.string(),
    GITHUB_APP_CLIENT_SECRET: z.string(),
    GITHUB_APP_SLUG: z.string(),

    DATABASE_URL: z.string(),
    GOOGLE_CLIENT_ID: z.string(),
    GOOGLE_CLIENT_SECRET: z.string(),
    GOOGLE_CALLBACK_URL: z.string(),
    JWT_ACCESS_SECRET: z.string(),
    JWT_REFRESH_SECRET: z.string(),
    ACCESS_TOKEN_EXPIRY: z.string(),
    REFRESH_TOKEN_EXPIRY: z.string(),
    SERVER_URL: z.url(),
    CLIENT_URL: z.url()
});

export const env = envSchema.parse(process.env);