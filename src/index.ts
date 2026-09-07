import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import { env } from "./config/env"
import { logger } from "./utils/logger.utils"

import { errorMiddleware } from "./middleware/error.middleware"
import { authenticate } from "./auth/auth.middleware"

import githubRouter from "./github/webhook.routes"
import githubAppRouter from "./github/github.app.routes"
import authRouter from "./auth/auth.routes"
import llmConfigRouter from "./LLM/config/llm.config.router"
import promptRouter from "./LLM/prompts/prompt.router";
import modelRouter from "./LLM/models/models.router"
import taskConfigRouter from "./LLM/config/llm.config.router"

import userRouter from "./user/user.routes";
import jobsRouter from "./jobs/jobs.routes";
import repoRouter from "./repo/repo.routes";
import dashboardRouter from "./dashboard/dashboard.routes";
import adminRouter from "./admin/admin.routes";

import "./worker/storage.worker"
import "./worker/webhook.worker"
const app = express();

app.use("/api/webhooks", githubRouter);

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


app.get("/health", (_req, res) => {
    res.send("yarupa nee")
});

// Everything registered below this line requires a valid access token.
app.use(authenticate);

app.use("/api/user", userRouter);
app.use("/api/jobs", jobsRouter);
app.use("/api/repos", repoRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/admin", adminRouter);
app.use("/api/github", githubAppRouter);
app.use("/api/llm-config", llmConfigRouter);
app.use("/api/prompts", promptRouter);
app.use("/api/models", modelRouter);
app.use("/api/task-config", taskConfigRouter);

app.use(errorMiddleware);

const PORT: number = Number(env.PORT) || 5000

app.listen(PORT, () => logger.info("Server listening at port ", PORT));
