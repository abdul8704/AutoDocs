import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.utils";
import { authenticate } from "../auth/auth.middleware";
import { getMeController, updateMeController } from "./user.controller";

const userRouter = Router();

userRouter.use(authenticate);

userRouter.get("/me", asyncHandler(getMeController));
userRouter.patch("/me", asyncHandler(updateMeController));

export default userRouter;
