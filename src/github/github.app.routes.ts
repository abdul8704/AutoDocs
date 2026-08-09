import { Router } from "express";
import { deleteRepo, handleSetupCallback, getAllAccessibleRepos, importRepo, getImportedRepos, getInstallationStatus, getRepoPrompts, updateRepoPrompts, getRepoStatus } from "./github.controller"
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

// Live pipeline progress, polled by the repository page while a run is active.
// Registered under both spellings because the rest of this router uses /repo/
// while the frontend's api layer calls /repos/.
githubAppRouter.get("/repos/:repoId/status", authenticate, asyncHandler(getRepoStatus))
githubAppRouter.get("/repo/:repoId/status", authenticate, asyncHandler(getRepoStatus))

// Custom doc instructions, editable at any time — POST overwrites. Registered
// under both /repo/ and /repos/ for the same reason the status route is.
githubAppRouter.get("/repo/:repoId/prompts", authenticate, asyncHandler(getRepoPrompts))
githubAppRouter.post("/repo/:repoId/prompts", authenticate, asyncHandler(updateRepoPrompts))
githubAppRouter.get("/repos/:repoId/prompts", authenticate, asyncHandler(getRepoPrompts))
githubAppRouter.post("/repos/:repoId/prompts", authenticate, asyncHandler(updateRepoPrompts))

export default githubAppRouter;