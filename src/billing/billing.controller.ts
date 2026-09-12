import { Request, Response } from "express";
import { BillingService } from "./billing.service";
import { HttpError } from "../utils/httpError.utils";
import { RequestStatus } from "./billing.types";

/** User Endpoint: Get billing summary (balance, recent requests, and ledger entries) */
export const getBillingSummaryController = async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw new HttpError(401, "Unauthorized");

    const summary = await BillingService.getDashboardSummary(userId);
    return res.status(200).json({ success: true, ...summary });
};

/** User Endpoint: Get current credit balance */
export const getCurrentBalanceController = async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw new HttpError(401, "Unauthorized");

    const balance = await BillingService.getCurrentBalance(userId);
    return res.status(200).json({ success: true, balance: balance?.balance || 0 });
};

/** User Endpoint: Get paginated ledger entries */
export const getLedgerSummaryController = async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw new HttpError(401, "Unauthorized");

    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    const ledger = await BillingService.getLedgerSummary(userId, limit, offset);
    return res.status(200).json({ success: true, ledger });
};

/** User Endpoint: Get user's credit grant requests */
export const getUserRequestsController = async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw new HttpError(401, "Unauthorized");

    const requests = await BillingService.getUserRequests(userId);
    return res.status(200).json({ success: true, requests });
};

/** User Endpoint: Submit a manual credit request */
export const requestManualGrantController = async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw new HttpError(401, "Unauthorized");

    const { amount, description } = req.body;
    const parsedAmount = Number(amount);

    if (!parsedAmount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
        throw new HttpError(400, "Amount must be a positive integer.");
    }

    const result = await BillingService.requestManualGrant(userId, parsedAmount, description || "");

    if (!result.success) {
        throw new HttpError(400, String(result.data));
    }

    return res.status(201).json({ success: true, request: result.data });
};

/** Admin Endpoint: Get all credit grant requests */
export const getAllRequestsAdminController = async (req: Request, res: Response) => {
    const statusParam = req.query.status as RequestStatus | undefined;
    const requests = await BillingService.getAllRequests(statusParam);
    return res.status(200).json({ success: true, requests });
};

/** Admin Endpoint: Approve a credit grant request with custom amount and admin reason */
export const approveGrantRequestAdminController = async (req: Request, res: Response) => {
    const requestId = String(req.params.requestId);
    const { amount, description } = req.body;

    const parsedAmount = Number(amount);
    if (!parsedAmount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
        throw new HttpError(400, "Approved amount must be a positive integer.");
    }

    await BillingService.acceptGrantRequest(requestId, parsedAmount, description);
    return res.status(200).json({ success: true, message: "Credit grant request approved successfully." });
};

/** Admin Endpoint: Reject a credit grant request with admin reason */
export const rejectGrantRequestAdminController = async (req: Request, res: Response) => {
    const requestId = String(req.params.requestId);
    const { description } = req.body;

    await BillingService.rejectGrant(requestId, description);
    return res.status(200).json({ success: true, message: "Credit grant request rejected." });
};

/** Admin Endpoint: Direct spontaneous top-up grant to any user */
export const directGrantAdminController = async (req: Request, res: Response) => {
    const { targetUserId, amount, description } = req.body;

    if (!targetUserId || typeof targetUserId !== "string") {
        throw new HttpError(400, "Target user ID is required.");
    }

    const parsedAmount = Number(amount);
    if (!parsedAmount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
        throw new HttpError(400, "Grant amount must be a positive integer.");
    }

    await BillingService.increaseCredit(
        targetUserId,
        parsedAmount,
        "ADMIN_TOP_UP",
        description || "Direct Admin Top Up"
    );

    return res.status(200).json({ success: true, message: "Direct credit grant applied successfully." });
};
