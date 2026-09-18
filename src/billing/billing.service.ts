import { Prisma } from "@prisma/client";
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

    static async getLedgerSummary(userId: string, limit: number = 50, offset: number = 0) {
        const rawLedger = await prisma.creditLedger.findMany({
            where: {
                userId
            },
            include: {
                job: {
                    select: {
                        repository: {
                            select: {
                                full_name: true
                            }
                        }
                    }
                }
            },
            take: limit,
            skip: offset,
            orderBy: { createdAt: 'desc' }
        });

        return rawLedger.map(item => {
            const dateObj = new Date(item.createdAt);
            const transactionDate = dateObj.toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric"
            }); // "14/09/2026"
            const transactionTime = dateObj.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
                timeZone: "Asia/Kolkata"
            }) + " IST"; // "5:09 PM IST"

            let repoName = item.job?.repository?.full_name;
            if ((!repoName || repoName === "-") && item.description) {
                const match = item.description.match(/Deducted for (.+?) on/i) || item.description.match(/for (.+?)(?: on|$)/i);
                if (match && match[1]) {
                    repoName = match[1].trim();
                }
            }

            return {
                id: item.id,
                amount: item.amount,
                type: item.type,
                description: item.description,
                createdAt: item.createdAt,
                transactionDate,
                transactionTime,
                repoName: repoName || "-",
                jobId: item.jobId,
            };
        });
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
        const now = new Date();
        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);

        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        const ninetyDaysAgo = new Date(now);
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        ninetyDaysAgo.setHours(0, 0, 0, 0);

        const [requests, balanceRecord, ledger, usageTodayAgg, usage7dAgg, usageEntriesAllTime] = await Promise.all([
            this.getUserRequests(userId),
            this.getCurrentBalance(userId),
            this.getLedgerSummary(userId, 50, 0),
            prisma.creditLedger.aggregate({
                where: {
                    userId,
                    type: "USAGE_DEDUCTION",
                    createdAt: { gte: startOfToday },
                },
                _sum: { amount: true },
            }),
            prisma.creditLedger.aggregate({
                where: {
                    userId,
                    type: "USAGE_DEDUCTION",
                    createdAt: { gte: sevenDaysAgo },
                },
                _sum: { amount: true },
            }),
            prisma.creditLedger.findMany({
                where: {
                    userId,
                    type: "USAGE_DEDUCTION",
                    createdAt: { gte: ninetyDaysAgo },
                },
                select: {
                    amount: true,
                    createdAt: true,
                },
                orderBy: { createdAt: "asc" },
            }),
        ]);

        const currentBalance = balanceRecord?.balance || 0;
        const creditsUsedToday = Math.abs(usageTodayAgg._sum.amount || 0);
        const creditsUsed7d = Math.abs(usage7dAgg._sum.amount || 0);

        const buildSeries = (days: number) => {
            const series: Array<{ date: string; fullDate: string; credits: number }> = [];
            const dateMap: Record<string, number> = {};

            for (let i = days - 1; i >= 0; i--) {
                const d = new Date(now);
                d.setDate(d.getDate() - i);
                const isoDate = d.toISOString().split("T")[0];
                const displayDate = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                dateMap[isoDate] = 0;
                series.push({ date: displayDate, fullDate: isoDate, credits: 0 });
            }

            usageEntriesAllTime.forEach(e => {
                const isoDate = new Date(e.createdAt).toISOString().split("T")[0];
                if (dateMap[isoDate] !== undefined) {
                    dateMap[isoDate] += Math.abs(e.amount);
                }
            });

            return series.map(s => ({
                ...s,
                credits: dateMap[s.fullDate] || 0,
            }));
        };

        return {
            balance: {
                current: currentBalance,
                tier: "FREE",
                monthlyCap: 100,
                usedMonthly: Math.min(100, 100 - currentBalance),
                creditsUsedToday,
                creditsUsed7d,
                history7d: buildSeries(7),
                history28d: buildSeries(28),
                historyAllTime: buildSeries(90),
            },
            requests,
            ledger,
        };
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