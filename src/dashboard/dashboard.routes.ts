import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.utils";
import { authenticate } from "../auth/auth.middleware";
import { getDashboardStatsController } from "./dashboard.controller";

const dashboardRouter = Router();

dashboardRouter.use(authenticate);

dashboardRouter.get("/stats", asyncHandler(getDashboardStatsController));

export default dashboardRouter;
