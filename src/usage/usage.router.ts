import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.utils";
import { authenticate } from "../auth/auth.middleware";
import { getUsageOfRepoHandler, getUsageByUserHandler } from "./usage.controller";

const usageRouter = Router();

usageRouter.get("/repo/:repoId", authenticate, asyncHandler(getUsageOfRepoHandler));
usageRouter.get("/user/:userId", authenticate, asyncHandler(getUsageByUserHandler));

export default usageRouter;