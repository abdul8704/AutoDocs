import { Request, Response } from "express";
import { githubHandlerService}  from "../services/git.service"
import { CodebaseChangeEvent } from "../types/repo.types"

const githubHandler = async (req: Request, res: Response) => {
    console.log("Request recieved !! ");
    const event: CodebaseChangeEvent = req.body; 
    await githubHandlerService(event);
    res.status(200).json({ success: true, message: "It works "});
}

export default githubHandler;