import Router from "express";
import {
    getAllpromtsController,
    getTaskPromptController,
    addPromptController,
    deletePromptController,
    updatePromptController
} from "./prompt.controller"
import { authenticate } from "../../auth/auth.middleware";
import { asyncHandler } from "../../utils/asyncHandler.utils";

const router = Router();

router.get("/", authenticate, asyncHandler(getAllpromtsController));
router.get("/:promptKey", authenticate, asyncHandler(getTaskPromptController));
router.post("/", authenticate, asyncHandler(addPromptController));
router.put("/:promptId", authenticate, asyncHandler(updatePromptController));
router.delete("/:promptId", authenticate, asyncHandler(deletePromptController));

export default router;
