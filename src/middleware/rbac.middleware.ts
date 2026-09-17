import { Request, Response, NextFunction } from "express";
import prisma from "../prisma/prisma";

export const requireAdmin = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { role: true },
        });

        if (!user || user.role !== "ADMIN") {
            return res.status(403).json({ message: "Access denied. Admin role required." });
        }

        next();
    } catch {
        return res.status(500).json({ message: "Internal server error verifying role" });
    }
};
