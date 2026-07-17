import { Request, Response } from "express";
import githubHandlerService  from "../services/git.service"

const githubHandler = async (req: Request, res: Response) => {
    console.log("Request recieved !! ");
    await githubHandlerService(req, res);
    res.status(200).json({ success: true, message: "It works "});
}

export default githubHandler;