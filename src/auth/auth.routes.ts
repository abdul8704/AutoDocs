import router from "express";
import { asyncHandler } from "../utils/asyncHandler.utils"
import {
    githubLogin,
    githubCallback,
    googleLogin,
    googleCallback,
    refresh,
    deleteUser,
    logout,
} from "./auth.controller";
import { authenticate } from "./auth.middleware";

const authRouter = router.Router();

authRouter.get("/github", asyncHandler(githubLogin));
authRouter.get("/github/callback", asyncHandler(githubCallback));

authRouter.get("/google", asyncHandler(googleLogin));
authRouter.get("/google/callback", asyncHandler(googleCallback));

authRouter.post("/refresh", asyncHandler(refresh));
authRouter.post("/logout", asyncHandler(logout));

authRouter.delete("/user", authenticate, asyncHandler(deleteUser));

export default authRouter;
