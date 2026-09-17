import { Router } from "express";
import {
    getAllpromtsController,
    getTaskPromptController,
    addPromptController,
    deletePromptController,
    updatePromptController
} from "./prompt.controller"
import { authenticate } from "../../auth/auth.middleware";
import { requireAdmin } from "../../middleware/rbac.middleware";
import { asyncHandler } from "../../utils/asyncHandler.utils";

const router = Router();

router.use(authenticate, requireAdmin);

router.get("/", asyncHandler(getAllpromtsController));
router.get("/:promptKey", asyncHandler(getTaskPromptController));
router.post("/", asyncHandler(addPromptController));
router.put("/:promptId", asyncHandler(updatePromptController));
router.delete("/:promptId", asyncHandler(deletePromptController));

export default router;
