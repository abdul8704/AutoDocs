import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.utils";
import { authenticate } from "../auth/auth.middleware";
import { getRepoDetailsController, triggerDocGenController, getRepoGeneratedDocsController } from "./repo.controller";

const repoRouter = Router();

repoRouter.use(authenticate);

repoRouter.get("/:repoId", asyncHandler(getRepoDetailsController));
repoRouter.post("/:repoId/trigger", asyncHandler(triggerDocGenController));
repoRouter.post("/:repoId/generate", asyncHandler(triggerDocGenController));
repoRouter.get("/:repoId/docs", asyncHandler(getRepoGeneratedDocsController));

export default repoRouter;
