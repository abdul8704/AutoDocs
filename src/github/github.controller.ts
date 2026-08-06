import { Request, Response } from "express";
import * as githubService from "./github.service"
import { CodebaseChangeEvent } from "../types/repo.types"
import { verifyGitHubSignature } from "../utils/github.security.utils"
import * as githubAppService from "./github.app.service"
import { verifyAccessToken } from "../auth/jwt.service";
import crypto from "crypto";
import { z } from "zod";
import { env } from "../config/env"
import { HttpError } from "../utils/httpError.utils"

const WEBHOOK_SECRET = env.GITHUB_WEBHOOK_SECRET;

export const githubHandler = async (req: Request, res: Response) => {
    console.log("Request recieved !!", req.body);

    const signatureHeader = req.headers['x-hub-signature-256'] as string | undefined;

    // 2. Extract the raw body buffer attached by the middleware
    const rawBody = (req as any).rawBody as Buffer;
    if (!signatureHeader || !rawBody)
        return res.status(401).send("Invalid signature");
    
    // 3. Verify the signature
    const isValid = verifyGitHubSignature(rawBody, signatureHeader, WEBHOOK_SECRET);

    if (!isValid) {
        console.warn('[Security] Webhook signature verification failed!');
        return res.status(401).send('Invalid signature');
    }

    const event = req.headers["x-github-event"];
    const payload = req.body;

    if (event !== "push") // dont bother about anything other than push event
        return res.status(200)

    await githubService.githubWebhookHandlerService(payload);
    res.status(200).json({ success: true, message: "It works " });
}

// GitHub redirects here once the user finishes installing our App. We asked GitHub
// to echo back a `state` query param (the user's access token, set by the frontend
// before it redirected off to GitHub) so we know which user just installed - GitHub
// itself has no notion of our user accounts.
export const handleSetupCallback = async (req: Request, res: Response) => {
    const installationId = Number(req.query.installation_id);
    const state = req.query.state as string | undefined;

    if (!installationId) {
        return res.redirect(`${env.CLIENT_URL}/dashboard?github_error=missing_installation_id`);
    }

    if (!state) {
        return res.redirect(`${env.CLIENT_URL}/dashboard?github_error=missing_state`);
    }

    try {
        const { userId } = verifyAccessToken(state);
        await githubAppService.saveInstallationId(userId, installationId);
    } catch (err) {
        console.error("GitHub App setup callback failed:", err);
        return res.redirect(`${env.CLIENT_URL}/dashboard?github_error=invalid_state`);
    }

    // The installation is now persisted against the user, so the frontend can just
    // re-fetch installation status/accessible repos - no need to pass anything in the URL.
    res.redirect(`${env.CLIENT_URL}/dashboard?github_connected=1`);
}

// Tells the frontend whether this user has already installed the GitHub App, so it
// can render the "Connect GitHub" button exactly once.
export const getInstallationStatus = async (req: Request, res: Response) => {
    const userId = (req as any).user.id;

    const status = await githubAppService.getInstallationStatus(userId);
    res.status(200).json({ success: true, ...status });
}

export const getAllAccessibleRepos = async (req: Request, res: Response) => {
    const userId = (req as any).user.id;

    const repos = await githubAppService.getAllReposForUser(userId);
    res.status(200).json({ success: true, repos });
}

export const importRepo = async (req: Request, res: Response) => {
    const { githubRepoId, name, cloneUrl, installation_id } = req.body;
    const userId = (req as any).user.id;

    const importedRepo = await githubAppService.importThisRepo(userId, githubRepoId, name, cloneUrl, installation_id)
    res.status(201).json({ success: true, importedRepo });
}

export const getImportedRepos = async (req: Request, res: Response) => {
    const userId = (req as any).user.id;

    const repos = await githubAppService.getImportedRepos(userId);
    res.status(200).json({ success: true, repos });
}

export const deleteRepo = async (req: Request, res: Response) => {
    const repoId = req.params.repoId as string;
    const userId = (req as any).user.id;

    await githubService.deleteRepo(userId, repoId);
}

// Custom doc instructions. Both routes take the github_repo_id as :repoId, the
// same identifier DELETE /repo/:repoId already uses.
const repoPromptsSchema = z.object({
    archPrompt: z.string().nullable().optional(),
    modulePrompt: z.string().nullable().optional(),
}).refine(
    (body) => body.archPrompt !== undefined || body.modulePrompt !== undefined,
    { message: "Provide archPrompt and/or modulePrompt" },
);

export const getRepoPrompts = async (req: Request, res: Response) => {
    const repoId = req.params.repoId as string;
    const userId = (req as any).user.id;

    const prompts = await githubAppService.getRepoPrompts(userId, repoId);
    res.status(200).json({ success: true, prompts });
}

export const updateRepoPrompts = async (req: Request, res: Response) => {
    const repoId = req.params.repoId as string;
    const userId = (req as any).user.id;

    const parsed = repoPromptsSchema.safeParse(req.body);

    if (!parsed.success) {
        throw new HttpError(400, parsed.error.issues.map((i) => i.message).join("; "));
    }

    // setRepoPrompts scans each field for prompt injection before it writes, and
    // throws HttpError(400) with the matched rules if anything is rejected.
    const { prompts, flags } = await githubAppService.setRepoPrompts(userId, repoId, parsed.data);
    res.status(200).json({ success: true, prompts, flags });
}