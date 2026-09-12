import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.utils";
import { authenticate } from "../auth/auth.middleware";
import {
    getBillingSummaryController,
    getCurrentBalanceController,
    getLedgerSummaryController,
    getUserRequestsController,
    requestManualGrantController,
    getAllRequestsAdminController,
    approveGrantRequestAdminController,
    rejectGrantRequestAdminController,
    directGrantAdminController,
} from "./billing.controller";

const billingRouter = Router();

// All billing routes require JWT authentication
billingRouter.use(authenticate);

// User Billing & Requests Routes
billingRouter.get("/summary", asyncHandler(getBillingSummaryController));
billingRouter.get("/balance", asyncHandler(getCurrentBalanceController));
billingRouter.get("/ledger", asyncHandler(getLedgerSummaryController));
billingRouter.get("/requests", asyncHandler(getUserRequestsController));
billingRouter.post("/request", asyncHandler(requestManualGrantController));

// Admin Credit Management Routes
billingRouter.get("/admin/requests", asyncHandler(getAllRequestsAdminController));
billingRouter.post("/admin/requests/:requestId/approve", asyncHandler(approveGrantRequestAdminController));
billingRouter.post("/admin/requests/:requestId/reject", asyncHandler(rejectGrantRequestAdminController));
billingRouter.post("/admin/grant-direct", asyncHandler(directGrantAdminController));

export default billingRouter;
