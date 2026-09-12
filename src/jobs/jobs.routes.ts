import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.utils";
import { authenticate } from "../auth/auth.middleware";
import { getJobsController, getJobsByUserIdController, getJobByIdController, retryJobController, streamJobsTelemetryController } from "./jobs.controller";

const jobsRouter = Router();

jobsRouter.use(authenticate);

jobsRouter.get("/stream", streamJobsTelemetryController);
jobsRouter.get("/", asyncHandler(getJobsController));
jobsRouter.get("/user/:userId", asyncHandler(getJobsByUserIdController));
jobsRouter.get("/:jobId", asyncHandler(getJobByIdController));
jobsRouter.post("/:jobId/retry", asyncHandler(retryJobController));

export default jobsRouter;
