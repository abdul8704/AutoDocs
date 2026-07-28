import { Request, Response } from "express";
import { githubWebhookHandlerService}  from "./github.service"
import { CodebaseChangeEvent } from "../types/repo.types"
import * as githubAppService from "./github.app.service"
import crypto from "crypto";
import { env } from "../config/env"

const WEBHOOK_SECRET = env.GITHUB_WEBHOOK_SECRET;

export const githubHandler = async (req: Request, res: Response) => {
    console.log("Request recieved !!", req.body);

    const signature = req.headers["x-hub-signature-256"] as string;
    const hmac = crypto.createHmac("sha256", WEBHOOK_SECRET);
    const digest = "sha256=" + hmac.update(JSON.stringify(req.body)).digest("hex");

    if (signature !== digest) {
        return res.status(401).send("Invalid signature");
    }

    const event = req.headers["x-github-event"];
    const payload = req.body;

    if(event !== "push") // dont bother about anything other than push event
        return res.status(200)

    await githubWebhookHandlerService(payload);
    res.status(200).json({ success: true, message: "It works "});
}

export const handleSetupCallback = async (req: Request, res: Response) => {
    const installationId = Number(req.query.installation_id);

    if (!installationId) {
        return res.status(400).json({ error: "Missing installation_id" });
    }

    // Redirect user back to your frontend dashboard with the installation_id in query params
    res.redirect(`http://localhost:5173/dashboard?installation_id=${installationId}`);
}

export const getAllAccessibleRepos = async (req: Request, res: Response) => {
    const installationId = Number(req.query.installation_id);

    if(!installationId)
        return res.status(400).json({message: "instllation_id not found"});

    const repos = await githubAppService.getAllRepos(installationId);
    res.status(200).json({ success: true, repos });
}

export const importRepo = async (req: Request, res: Response) => {
    const { githubRepoId, name, cloneUrl, installationId } = req.body;
    const userId = (req as any).user.id; 

    const importedRepo = await githubAppService.importThisRepo(userId, githubRepoId, name, cloneUrl, installationId)
    res.status(201).json({ success: true, importedRepo });
}