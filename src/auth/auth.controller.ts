import { randomUUID } from "crypto";
import { Request, Response } from "express";
import { env } from "../config/env"
import * as authService from "./auth.service"
import * as githubProvider from "./providers/github.provider"
import * as googleProvider from "./providers/google.provider"
import { HttpError } from "../utils/httpError.utils"

const REFRESH_COOKIE_NAME = "refreshToken";
const STATE_COOKIE_NAME = "oauth_state";
const STATE_COOKIE_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

const refreshCookieOptions = (expires: Date) => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/auth",
    expires,
});

const stateCookieOptions = () => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/auth",
    maxAge: STATE_COOKIE_MAX_AGE_MS,
});

const clearCookieOptions = () => ({
    path: "/auth",
});

export const githubLogin = async (_req: Request, res: Response) => {
    // A random, single-use state value guards the redirect against CSRF: we stash it
    // in a short-lived cookie and check it matches what GitHub sends back on callback.
    const state = randomUUID();
    res.cookie(STATE_COOKIE_NAME, state, stateCookieOptions());

    const url = githubProvider.getGithubAuthUrl(state);
    res.redirect(url);
}

export const githubCallback = async (req: Request, res: Response) => {
    const { code, state, error } = req.query;

    const expectedState = req.cookies?.[STATE_COOKIE_NAME];
    res.clearCookie(STATE_COOKIE_NAME, clearCookieOptions());

    // The user may have denied access on GitHub's consent screen.
    if (error) {
        return res.redirect(`${env.CLIENT_URL}/login?error=${encodeURIComponent(String(error))}`);
    }

    if (!state || !expectedState || state !== expectedState) {
        return res.redirect(`${env.CLIENT_URL}/login?error=invalid_state`);
    }

    if (typeof code !== "string") {
        return res.redirect(`${env.CLIENT_URL}/login?error=missing_code`);
    }

    try {
        const token = await githubProvider.exchangeGithubCode(code);
        const profile = await githubProvider.fetchGithubProfile(token);
        const user = await authService.findOrCreateGithubUser(profile);
        const { refreshToken, expiresAt } = await authService.setUpJwt(user.id);

        res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions(expiresAt));

        // The access token is deliberately NOT sent here. The frontend lands on
        // /dashboard and silently calls POST /auth/refresh (using the httpOnly
        // cookie we just set) to obtain it, keeping it out of the URL entirely.
        return res.redirect(`${env.CLIENT_URL}/dashboard`);
    } catch (err) {
        console.error("GitHub OAuth callback failed:", err);
        return res.redirect(`${env.CLIENT_URL}/login?error=oauth_failed`);
    }
}

// Scaffolding for Google login - mirrors the GitHub flow's shape so swapping in the
// real implementation later only means filling in google.provider.ts. The stub
// functions throw HttpError(501, ...), which asyncHandler forwards to errorMiddleware.
export const googleLogin = async (_req: Request, res: Response) => {
    const state = randomUUID();
    const url = googleProvider.getGoogleAuthUrl(state);
    res.cookie(STATE_COOKIE_NAME, state, stateCookieOptions());
    return res.redirect(url);
}

export const googleCallback = async (req: Request, res: Response) => {
    const code = req.query.code;
    await googleProvider.exchangeGoogleCode(typeof code === "string" ? code : "");
    return res.redirect(`${env.CLIENT_URL}/dashboard`);
}

export const refresh = async (req: Request, res: Response) => {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];

    if (!refreshToken) {
        throw new HttpError(401, "No refresh token provided");
    }

    // authService.refreshAccessToken throws HttpError(401, ...) on any failure,
    // which asyncHandler forwards to errorMiddleware - no local catch needed.
    const accessToken = await authService.refreshAccessToken(refreshToken);
    return res.json({
        success: true,
        data: { accessToken },
    });
}

export const logout = async (req: Request, res: Response) => {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];

    if (refreshToken) {
        await authService.revokeRefreshToken(refreshToken);
    }

    res.clearCookie(REFRESH_COOKIE_NAME, clearCookieOptions());
    return res.json({ success: true });
}

export const deleteUser = async (req: Request, res: Response) => {
    const userId = (req as any).user.id;

    await authService.deleteUser(userId);
    res.status(204).json({ success: true });
}