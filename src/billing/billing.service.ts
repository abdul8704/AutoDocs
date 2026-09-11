import { Prisma } from "../generated/prisma/client";
import prisma from "../prisma/prisma"
import { LedgerType, RequestStatus } from "./billing.types";


export class BillingService {
    private static readonly CREDIT_UNIT_USD = 0.01; // $0.01 per credit
    private static readonly DEFAULT_MARGIN_MULTIPLIER = 1.30; // 30% markup

    static usdToCredits(usdAmount: number): number {
        if (usdAmount <= 0) return 0;
        // Scale to integer cents first to avoid JS floating-point inaccuracies
        const cents = Math.round(usdAmount * 100);
        const unitCents = Math.round(this.CREDIT_UNIT_USD * 100);
        return Math.floor(cents / unitCents);
    }

    static creditsToUsd(credits: number): number {
        if (credits <= 0) return 0.0;
        return Number((credits * this.CREDIT_UNIT_USD).toFixed(2));
    }
    private static async createLedgerEntry(
        tx: Prisma.TransactionClient,
        userId: string,
        amount: number,
        type: LedgerType,
        description?: string,
        jobId?: string,
    ) {
        let validJobId: string | null = null;
        if (jobId) {
            const jobExists = await tx.docsUpdateJob.findUnique({
                where: { id: jobId },
                select: { id: true }
            });
            if (jobExists) {
                validJobId = jobId;
            }
        }

        // update wallet
        const wallet = await tx.creditBalance.upsert({
            where: {
                userId
            },
            update: {
                balance: { increment: amount }
            },
            create: {
                userId,
                balance: Math.max(0, amount)
            }
        });
        // write to ledger
        await tx.creditLedger.create({
            data: {
                userId: userId,
                amount,
                type,
                jobId: validJobId,
                description: description || ""
            }
        });

        return wallet;
    };

    static async checkAndGiveSignupGrant(
        userId: string,
        githubId: string,
        grantAmount = 20
    ) {
        try {
            return await prisma.$transaction(async (tx) => {
                await tx.signupGrantClaim.create({
                    data: {
                        githubId
                    }
                });

                const wallet = await BillingService.createLedgerEntry(tx, userId, grantAmount, "SIGNUP_GRANT", "Signup grant", undefined);
                return { granted: true, balance: wallet.balance };
            })
        } catch (error) {
            // P2002: Unique constraint violation (already claimed)
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                const wallet = await prisma.creditBalance.upsert({
                    where: { userId },
                    create: { userId, balance: 0 },
                    update: {},
                });
                return { granted: false, balance: wallet.balance };
            }
            throw error;
        }
    }

    static async hasSufficientBalance(userId: string, minRequired = 1): Promise<boolean> {
        const wallet = await prisma.creditBalance.findUnique({
            where: {
                userId
            }
        });

        return (wallet?.balance ?? 0) >= minRequired;
    }

    static async deductCredit(userId: string, amount: number, jobId: string, description: string) {
        return await prisma.$transaction(async (tx) => {
            await this.createLedgerEntry(
                tx,
                userId,
                -Math.abs(amount),
                "USAGE_DEDUCTION",
                description,
                jobId
            );
        })
    }

    static async increaseCredit(
        userId: string,
        amount: number,
        type: LedgerType,
        description: string
    ) {
        return await prisma.$transaction(async (tx) => {
            await this.createLedgerEntry(
                tx,
                userId,
                amount,
                type,
                description,
                undefined
            );
        })
    };

    static async requestManualGrant(
        userId: string,
        amount: number,
        description: string,
    ) {
        const existing = await prisma.creditRequest.findFirst({
            where: {
                userId,
                status: "PENDING"
            }
        })

        if (existing)
            return { success: false, data: "A request is already pending" }
        const result = await prisma.creditRequest.create({
            data: {
                userId,
                amountRequested: amount,
                userReason: description,
                status: "PENDING"
            }
        })
        return { success: true, data: result }
    }

    static async acceptGrantRequest(
        requestId: string,
        amount: number,
        description?: string
    ) {
        await prisma.$transaction(async (tx) => {
            const request = await tx.creditRequest.findUnique({
                where: { id: requestId },
            });

            if (!request || request.status !== 'PENDING') {
                throw new Error('Request not found or already resolved.');
            }

            const wallet = await this.createLedgerEntry(
                tx,
                request.userId,
                amount,
                "ADMIN_TOP_UP",
                description || "Admin top up"
            );

            await tx.creditRequest.update({
                where: { id: requestId },
                data: {
                    status: "APPROVED",
                    amountGranted: amount, // Overwrite with actual approved amount
                },
            });

            return wallet;
        })
    }
    // admin only
    static async rejectGrant(requestId: string, description?: string) {
        const existing = await prisma.creditRequest.findFirst({
            where: {
                id: requestId,
                status: "PENDING"
            }
        })

        if (!existing)
            throw new Error("Request not found or already resolved.");

        await prisma.creditRequest.update({
            where: {
                id: requestId
            },
            data: {
                status: "REJECTED",
                amountGranted: 0,
                adminReason: description ? description : "Rejected"
            }
        })
    };

    static async getLedgerSummary(userId: string, limit: number = 10, offset: number = 0) {
        return await prisma.creditLedger.findMany({
            where: {
                userId
            },
            take: limit,
            skip: offset,
            orderBy: { createdAt: 'desc' }
        })
    }

    static async getCurrentBalance(userId: string) {
        return await prisma.creditBalance.findUnique({
            where: {
                userId
            }
        })
    }

    static async getUserRequests(userId: string) {
        return await prisma.creditRequest.findMany({
            where: {
                userId
            },
            include: {
                user: {
                    select: { id: true, name: true, email: true, githubId: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        })
    }

    // admin only
    static async getAllRequests(status?: RequestStatus) {
        return prisma.creditRequest.findMany({
            where: status ? { status } : undefined,
            include: {
                user: {
                    select: { id: true, name: true, email: true, githubId: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    static async getDashboardSummary(userId: string) {
        const [requests, balance, ledger] = await Promise.all([
            this.getUserRequests(userId),
            this.getCurrentBalance(userId),
            this.getLedgerSummary(userId)
        ])
        return { requests, balance, ledger }
    }

    static providerCostToCredits(
        generationCostUsd: number,
        marginMultiplier: number = this.DEFAULT_MARGIN_MULTIPLIER
    ): number {
        if (generationCostUsd <= 0) return 0;

        const retailCostUsd = generationCostUsd * marginMultiplier;
        // Round UP so fractional cents cover compute overhead
        return Math.max(1, Math.ceil(retailCostUsd / this.CREDIT_UNIT_USD));
    }

    static creditsToProviderSpendCapacity(
        credits: number,
        marginMultiplier: number = this.DEFAULT_MARGIN_MULTIPLIER
    ): number {
        if (credits <= 0) return 0.0;
        const retailDollars = credits * this.CREDIT_UNIT_USD;
        return Number((retailDollars / marginMultiplier).toFixed(4));
    }
}