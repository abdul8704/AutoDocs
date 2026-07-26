import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../auth/jwt.service";

export const authenticate = (
    req: Request,
    res: Response,
    next: NextFunction
) => {

    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({
            message: "Unauthorized"
        });
    }

    const token = authHeader.split(" ")[1];

    try {

        const payload = verifyAccessToken(token);

        req.user = {
            id: payload.userId
        };

        next();

    } catch {

        return res.status(401).json({
            message: "Invalid token"
        });

    }

};