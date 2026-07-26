import { Router } from "express";
import githubHandler from "./github.controller"
import { asyncHandler } from "../utils/asyncHandler.utils"

const router: Router = Router();

router.post("/github", asyncHandler(githubHandler))

export default router;