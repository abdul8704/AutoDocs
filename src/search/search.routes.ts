import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.utils";
import { authenticate } from "../auth/auth.middleware";
import { globalSearchController } from "./search.controller";

const searchRouter = Router();

searchRouter.use(authenticate);
searchRouter.get("/", asyncHandler(globalSearchController));

export default searchRouter;
