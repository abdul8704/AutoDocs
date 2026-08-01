import { Router, json } from "express";
import { githubHandler } from "./github.controller"
import { asyncHandler } from "../utils/asyncHandler.utils"

const router: Router = Router();

router.post("/github",
     json({
        verify: (req: any, _res, buf) => {
            req.rawBody = buf;
        },
     }),
     asyncHandler(githubHandler))

export default router;