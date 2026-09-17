import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.utils";
import { authenticate } from "../auth/auth.middleware";
import { requireAdmin } from "../middleware/rbac.middleware";
import {
    getAllUsersAdminController,
    getUserDetailsAdminController,
    updateUserPlanAdminController,
    getAllReposAdminController,
    getAllJobsAdminController,
    getLLMLogsAdminController,
    getLLMStatsAdminController,
    getAdminMasterStatsController,
    promoteUserToAdminController,
} from "./admin.controller";

const adminRouter = Router();

// All admin routes require JWT authentication and ADMIN role
adminRouter.use(authenticate, requireAdmin);

// User Insights & Management
adminRouter.get("/users", asyncHandler(getAllUsersAdminController));
adminRouter.get("/users/:userId", asyncHandler(getUserDetailsAdminController));
adminRouter.patch("/users/:userId/plan", asyncHandler(updateUserPlanAdminController));
adminRouter.post("/users/:userId/promote", asyncHandler(promoteUserToAdminController));

// Repos & Jobs Audit
adminRouter.get("/repos", asyncHandler(getAllReposAdminController));
adminRouter.get("/jobs", asyncHandler(getAllJobsAdminController));

// LLM Telemetry & Logs
adminRouter.get("/llm-logs", asyncHandler(getLLMLogsAdminController));
adminRouter.get("/llm-logs/stats", asyncHandler(getLLMStatsAdminController));

// Master Analytics & Queue Health
adminRouter.get("/stats", asyncHandler(getAdminMasterStatsController));

export default adminRouter;
