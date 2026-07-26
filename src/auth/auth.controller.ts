import { env } from "../config/env"
import { Request, Response } from "express";
import * as authService from "./auth.service"


export const githubLogin = async (req: Request, res: Response) => {
    const url: string = authService.getGithubAuthUrl(); 
    res.redirect(url)
}

export const githubCallback = async (req: Request, res: Response) => {
    const code = req.query.code;
    if (typeof code !== "string") {
        return res.status(400).json({
            message: "Invalid authorization code"
        });
    }
    const token: string = await authService.exchangeCodeForToken(code);

    const userData = await authService.getUserData(token);

    res.status(200).json("success");
}

