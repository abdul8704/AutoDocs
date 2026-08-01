import { Router } from "express";
import { deleteRepo, handleSetupCallback, getAllAccessibleRepos, importRepo, getImportedRepos, getInstallationStatus } from "./github.controller"
import { asyncHandler } from "../utils/asyncHandler.utils"
import { authenticate } from "../auth/auth.middleware";

const githubAppRouter: Router = Router();

// Hit directly by GitHub's browser redirect after the user installs the App - not
// authenticated via the normal Bearer flow, see handleSetupCallback for how it
// identifies the user via the `state` query param instead.
githubAppRouter.get("/setup", asyncHandler(handleSetupCallback))
githubAppRouter.get("/installation-status", authenticate, asyncHandler(getInstallationStatus))
githubAppRouter.get("/accessible-repos", authenticate, asyncHandler(getAllAccessibleRepos))
githubAppRouter.get("/imported-repos", authenticate, asyncHandler(getImportedRepos));

githubAppRouter.post("/import-repo", authenticate, asyncHandler(importRepo));

githubAppRouter.delete("/repo/:repoId", authenticate, asyncHandler(deleteRepo))

export default githubAppRouter;