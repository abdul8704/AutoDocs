import { Router } from "express";
import { authenticate } from "../../auth/auth.middleware";
import { requireAdmin } from "../../middleware/rbac.middleware";
import { asyncHandler } from "../../utils/asyncHandler.utils";
import {
  getAllModelController,
  getModelByIdController,
  addNewModelController,
  deleteModelController,
  updateModelController,
} from "./models.controller";

const router = Router();

router.use(authenticate, requireAdmin);

router.get("/", asyncHandler(getAllModelController));
router.get("/:modelId", asyncHandler(getModelByIdController));
router.post("/", asyncHandler(addNewModelController));
router.put("/:modelId", asyncHandler(updateModelController));
router.put("/", asyncHandler(updateModelController));
router.patch("/:modelId", asyncHandler(updateModelController));
router.patch("/", asyncHandler(updateModelController));
router.delete("/:modelId", asyncHandler(deleteModelController));
router.delete("/", asyncHandler(deleteModelController));

export default router;