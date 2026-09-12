import { Request, Response } from "express";
import { globalSearchService } from "./search.service";

export const globalSearchController = async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const query = (req.query.q as string) || "";
    const isAdmin = (req.user as { planType?: string })?.planType === "ADMIN";

    const results = await globalSearchService(query, userId, isAdmin);
    return res.status(200).json({ success: true, data: results });
};
