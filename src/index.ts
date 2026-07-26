import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env"
import { logger } from "./utils/logger.utils"
import { errorMiddleware } from "./middleware/error.middleware"
import githubRouter from "./github/webhook.routes"
import authRouter from "./auth/auth.routes"
import dotenv from "dotenv";
import { authenticate } from "./auth/auth.middleware"
dotenv.config();

const app = express();

app.use(cors({
    origin: env.CLIENT_URL,
    credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Public routes - no JWT required.
// /auth handles login/oauth/refresh/logout (the JWT itself doesn't exist yet or is being renewed here).
// /webhooks is called directly by GitHub, authenticated via signature verification, not user JWTs.
// /health is a public uptime check.
app.use("/auth", authRouter);
app.use("/webhooks", githubRouter);
app.get("/health", ( _req, res) => {
    res.send("yarupa nee")
});

// Everything registered below this line requires a valid access token.
app.use(authenticate);

app.use(errorMiddleware);

const PORT: number = Number(env.PORT) || 5000

app.listen(PORT, () => logger.info("Server listening at port ", PORT));
