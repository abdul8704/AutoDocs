import router from "express";
import { githubLogin, githubCallback } from "./auth.controller";

const authRouter = router.Router();

authRouter.get("/github", githubLogin);
authRouter.get("/github/callback", githubCallback);

export default authRouter;