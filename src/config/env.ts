import { z } from "zod";
import dotenv from "dotenv";
dotenv.config();

const envSchema = z.object({
    PORT: z.coerce.number().default(5000)
});

export const env = envSchema.parse(process.env);