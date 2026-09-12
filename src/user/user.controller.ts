import { Request, Response } from "express";
import * as userService from "./user.service";

export const getMeController = async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const user = await userService.getUserById(userId);
    res.status(200).json({ success: true, user });
};

export const updateMeController = async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { name } = req.body;
    const user = await userService.updateUserProfile(userId, { name });
    res.status(200).json({ success: true, user });
};
