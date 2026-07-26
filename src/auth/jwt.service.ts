import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "../config/env";
import ms from "ms";

type AccessTokenPayload = {
    userId: string;
};

type RefreshTokenPayload = {
    userId: string;
    sessionId: string;
};

export const generateAccessToken = (userId: string) => {
    return jwt.sign(
        { userId },
        env.JWT_ACCESS_SECRET,
        {
            expiresIn: env.ACCESS_TOKEN_EXPIRY as SignOptions["expiresIn"]
        }
    );
};

export const generateRefreshToken = (userId: string, sessionId: string) => {
    const expiresIn = env.REFRESH_TOKEN_EXPIRY as ms.StringValue;

    const refreshJWT = jwt.sign(
        { userId, sessionId },
        env.JWT_REFRESH_SECRET,
        { expiresIn }
    );

    const expiresAt = new Date(Date.now() + ms(expiresIn));

    return {
        refreshJWT,
        expiresAt,
    };
};

export const verifyAccessToken = (token: string): AccessTokenPayload => {
    return jwt.verify(
        token,
        env.JWT_ACCESS_SECRET
    ) as AccessTokenPayload;
};

export const verifyRefreshToken = (token: string): RefreshTokenPayload => {
    return jwt.verify(
        token,
        env.JWT_REFRESH_SECRET
    ) as RefreshTokenPayload;
};
