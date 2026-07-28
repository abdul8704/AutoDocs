import { Router } from "express";
import { handleSetupCallback, getAllAccessibleRepos, importRepo } from "./github.controller"
import { asyncHandler } from "../utils/asyncHandler.utils"
import { authenticate } from "../auth/auth.middleware";

const githubAppRouter: Router = Router();

githubAppRouter.get("/setup", asyncHandler(handleSetupCallback))
githubAppRouter.get("/accessible-repos", authenticate, asyncHandler(getAllAccessibleRepos))
githubAppRouter.post("/import-repo", authenticate, asyncHandler(importRepo));

export default githubAppRouter;