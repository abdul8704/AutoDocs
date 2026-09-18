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
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
});

const stateCookieOptions = () => ({
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: STATE_COOKIE_MAX_AGE_MS,
});

const clearAllRefreshCookies = (res: Response) => {
    res.clearCookie(REFRESH_COOKIE_NAME, { path: "/" });
    res.clearCookie(REFRESH_COOKIE_NAME, { path: "/auth" });
};

const getRefreshTokenCandidates = (req: Request): string[] => {
    const rawHeader = req.headers.cookie || "";
    const candidates: string[] = [];

    // Match all `refreshToken=...` occurrences in raw Cookie header
    const matches = Array.from(rawHeader.matchAll(/refreshToken=([^;]+)/g));
    for (const match of matches) {
        if (match[1]) {
            const token = decodeURIComponent(match[1].trim());
            if (token && !candidates.includes(token)) {
                candidates.push(token);
            }
        }
    }

    // Also check req.cookies
    const cookieVal = req.cookies?.[REFRESH_COOKIE_NAME];
    if (cookieVal && typeof cookieVal === "string" && !candidates.includes(cookieVal)) {
        candidates.push(cookieVal);
    } else if (Array.isArray(cookieVal)) {
        for (const v of cookieVal) {
            if (typeof v === "string" && !candidates.includes(v)) {
                candidates.push(v);
            }
        }
    }

    return candidates;
};

export const githubLogin = async (_req: Request, res: Response) => {
    // A random, single-use state value guards the redirect against CSRF: we stash it
    // in a short-lived cookie and check it matches what GitHub sends back on callback.
    const state = randomUUID();
    res.cookie(STATE_COOKIE_NAME, state, stateCookieOptions());
    clearAllRefreshCookies(res);

    const url = githubProvider.getGithubAuthUrl(state);
    res.redirect(url);
}

export const githubCallback = async (req: Request, res: Response) => {
    const { code, state, error } = req.query;

    const expectedState = req.cookies?.[STATE_COOKIE_NAME];
    res.clearCookie(STATE_COOKIE_NAME, { path: "/" });

    // The user may have denied access on GitHub's consent screen.
    if (error) {
        clearAllRefreshCookies(res);
        return res.redirect(`${env.CLIENT_URL}/?error=${encodeURIComponent(String(error))}`);
    }

    if (!state || !expectedState || state !== expectedState) {
        clearAllRefreshCookies(res);
        return res.redirect(`${env.CLIENT_URL}/?error=invalid_state`);
    }

    if (typeof code !== "string") {
        clearAllRefreshCookies(res);
        return res.redirect(`${env.CLIENT_URL}/?error=missing_code`);
    }

    try {
        const token = await githubProvider.exchangeGithubCode(code);
        const profile = await githubProvider.fetchGithubProfile(token);
        const user = await authService.findOrCreateGithubUser(profile);
        const { refreshToken, expiresAt } = await authService.setUpJwt(user.id);
        clearAllRefreshCookies(res);
        res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions(expiresAt));

        // The access token is deliberately NOT sent here. The frontend lands on
        // the client URL and silently calls POST /auth/refresh (using the httpOnly
        // cookie we just set) to obtain it, keeping it out of the URL entirely.
        return res.redirect(`${env.CLIENT_URL}/`);
    } catch (err) {
        console.error("GitHub OAuth callback failed:", err);
        clearAllRefreshCookies(res);
        return res.redirect(`${env.CLIENT_URL}/?error=oauth_failed`);
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
    const candidates = getRefreshTokenCandidates(req);

    if (candidates.length === 0) {
        throw new HttpError(401, "No refresh token provided");
    }

    let lastError: unknown = null;

    // Try candidate tokens in reverse order (newest tokens are usually appended later in standard cookie strings)
    for (let i = candidates.length - 1; i >= 0; i--) {
        const candidateToken = candidates[i];
        try {
            const accessToken = await authService.refreshAccessToken(candidateToken);
            // On success, clear any stale Path=/auth cookie to keep the browser headers clean
            res.clearCookie(REFRESH_COOKIE_NAME, { path: "/auth" });
            return res.json({
                success: true,
                data: { accessToken },
            });
        } catch (err) {
            lastError = err;
        }
    }

    // If all candidate refresh tokens failed, clear cookies on all paths
    clearAllRefreshCookies(res);
    throw lastError || new HttpError(401, "Invalid refresh token");
}

export const logout = async (req: Request, res: Response) => {
    const candidates = getRefreshTokenCandidates(req);

    for (const token of candidates) {
        await authService.revokeRefreshToken(token);
    }

    clearAllRefreshCookies(res);
    return res.json({ success: true });
}

export const deleteUser = async (req: Request, res: Response) => {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    const userId = req.user.id;

    await authService.deleteUser(userId);
    res.status(204).json({ success: true });
}