import express from "express";
import { env } from "./config/env"
import { asyncHandler } from "./utils/asyncHandler.utils"
import { logger } from "./utils/logger.utils"

const app = express();

app.use(asyncHandler)

app.get("/health", ( _req, res) => {
    res.status(200).json({ message: "server running" })
});

const PORT: number = Number(env.PORT) || 5000

app.listen(PORT, () => logger.info("Server listening at port ", PORT));