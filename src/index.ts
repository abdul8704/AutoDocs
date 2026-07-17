import express from "express";
import { env } from "./config/env"
import { logger } from "./utils/logger.utils"
import { errorMiddleware } from "./middleware/error.middleware"
import githubRouter from "./routes/webhook.routes"
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json());

app.use("/webhooks", githubRouter);

app.get("/health", ( _req, res) => {
    res.send("yarupa nee")
});

app.use(errorMiddleware);

const PORT: number = Number(env.PORT) || 5000

app.listen(PORT, () => logger.info("Server listening at port ", PORT));