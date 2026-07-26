import { randomUUID } from "crypto";
import bcrypt from "bcrypt";
import prisma from "../prisma/prisma";
import {
    generateAccessToken,
    generateRefreshToken,
    verifyRefreshToken,
} from "./jwt.service";
import { OAuthProfile } from "./providers/provider.types";
import { HttpError } from "../utils/httpError.utils";

const BCRYPT_ROUNDS = 10;

// Finds an existing GitHub-linked user or creates one. This is the one piece that's
// tied to the `githubId` column in the schema - a future Google provider would need
// its own equivalent (e.g. a `googleId` column) and lookup/creation function.
export const findOrCreateGithubUser = async (profile: OAuthProfile) => {
    const existing = await prisma.user.findUnique({
        where: { githubId: profile.providerId },
    });

    if (existing) {
        return existing;
    }

    return prisma.user.create({
        data: {
            name: profile.name,
            githubId: profile.providerId,
            email: profile.email,
        },
    });
};

// Issues a fresh access token + refresh token pair for a user and persists a
// RefreshSession row (keyed by the same id embedded in the refresh JWT) so the
// refresh token can be looked up and revoked later without scanning every session.
export const setUpJwt = async (userId: string) => {
    const accessToken = generateAccessToken(userId);

    const sessionId = randomUUID();
    const { refreshJWT: refreshToken, expiresAt } = generateRefreshToken(userId, sessionId);
    const hashedRefreshToken = await bcrypt.hash(refreshToken, BCRYPT_ROUNDS);

    await prisma.refreshSession.create({
        data: {
            id: sessionId,
            userId,
            hashedRefreshToken,
            expiresAt,
        },
    });

    return { accessToken, refreshToken, expiresAt };
};

// Verifies a refresh token against its stored, hashed session and - if it's valid,
// not revoked, and not expired - issues a brand new access token.
export const refreshAccessToken = async (rawRefreshToken: string): Promise<string> => {
    // `verifyRefreshToken` throws a raw jsonwebtoken error (not an HttpError) when the
    // token is malformed/expired/signed with a different secret. This is the one
    // unavoidable translation boundary to our typed HttpError - everything else below
    // throws HttpError directly and needs no local catch.
    let payload;
    try {
        payload = verifyRefreshToken(rawRefreshToken);
    } catch {
        throw new HttpError(401, "Invalid or expired refresh token");
    }

    const session = await prisma.refreshSession.findUnique({
        where: { id: payload.sessionId },
    });

    if (!session || session.userId !== payload.userId) {
        throw new HttpError(401, "Refresh session not found");
    }

    if (session.revokedAt) {
        throw new HttpError(401, "Refresh token has been revoked");
    }

    if (session.expiresAt < new Date()) {
        throw new HttpError(401, "Refresh token has expired");
    }

    const isValid = await bcrypt.compare(rawRefreshToken, session.hashedRefreshToken);
    if (!isValid) {
        throw new HttpError(401, "Refresh token does not match stored session");
    }

    return generateAccessToken(payload.userId);
};

// Revokes the refresh session tied to this token, e.g. on logout. Best-effort: if the
// token is already invalid/expired there's nothing left to revoke, so it silently no-ops.
export const revokeRefreshToken = async (rawRefreshToken: string): Promise<void> => {
    let payload;
    try {
        payload = verifyRefreshToken(rawRefreshToken);
    } catch {
        return;
    }

    await prisma.refreshSession.updateMany({
        where: {
            id: payload.sessionId,
            userId: payload.userId,
            revokedAt: null,
        },
        data: {
            revokedAt: new Date(),
        },
    });
};
