import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.utils";
import { authenticate } from "../auth/auth.middleware";
import { getJobsController, getJobByIdController, retryJobController } from "./jobs.controller";

const jobsRouter = Router();

jobsRouter.use(authenticate);

jobsRouter.get("/", asyncHandler(getJobsController));
jobsRouter.get("/:jobId", asyncHandler(getJobByIdController));
jobsRouter.post("/:jobId/retry", asyncHandler(retryJobController));

export default jobsRouter;
