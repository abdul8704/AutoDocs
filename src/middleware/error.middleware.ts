import { Request, Response, NextFunction } from "express";
import { HttpError } from "../utils/httpError.utils";

export const errorMiddleware = (
    err: Error,
    req: Request,
    res: Response,
    _next: NextFunction
) => {
    void _next;
    console.error(err);

    const statusCode = err instanceof HttpError ? err.statusCode : 500;

    res.status(statusCode).json({
        success: false,
        message: err.message,
    });
};
