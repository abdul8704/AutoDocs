import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "../config/env";

type JwtPayload = {
    userId: string;
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

export const generateRefreshToken = (userId: string) => {
    return jwt.sign(
        { userId },
        env.JWT_REFRESH_SECRET,
        {
            expiresIn: env.REFRESH_TOKEN_EXPIRY as SignOptions["expiresIn"]
        }
    );
};

export const verifyAccessToken = (token: string): JwtPayload => {
    return jwt.verify(
        token,
        env.JWT_ACCESS_SECRET
    ) as JwtPayload;
};

export const verifyRefreshToken = (token: string): JwtPayload => {
    return jwt.verify(
        token,
        env.JWT_REFRESH_SECRET
    ) as JwtPayload;
};