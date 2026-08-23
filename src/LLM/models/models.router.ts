import { Router } from "express";

import { authenticate } from "../../auth/auth.middleware";
import { asyncHandler } from "../../utils/asyncHandler.utils";
import { getAllModelController, addNewModelController, deleteModelController, updateModelController } from "./models.controller";
const router = Router();

router.get("/", authenticate, asyncHandler(getAllModelController));
router.post("/", authenticate, asyncHandler(addNewModelController));
router.put("/", authenticate, asyncHandler(updateModelController));
router.delete("/", authenticate, asyncHandler(deleteModelController));

export default router;