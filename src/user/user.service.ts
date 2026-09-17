import prisma from "../prisma/prisma";
import { HttpError } from "../utils/httpError.utils";
import { BillingService } from "../billing/billing.service";

export const getUserById = async (userId: string) => {
    let user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            name: true,
            email: true,
            githubId: true,
            profileUrl: true,
            githubInstallationId: true,
            planType: true,
            role: true,
            usedDocsQuota: true,
            created_at: true,
            updated_at: true,
            creditBalance: { select: { balance: true } },
        },
    });

    if (!user) {
        throw new HttpError(404, "User not found");
    }

    if (!user.creditBalance) {
        await BillingService.checkAndGiveSignupGrant(userId, user.githubId || user.email || userId);
        const wallet = await prisma.creditBalance.findUnique({ where: { userId } });
        return {
            ...user,
            creditBalance: wallet ? { balance: wallet.balance } : { balance: 100 },
        };
    }

    return user;
};

export const updateUserProfile = async (userId: string, data: { name?: string }) => {
    const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
            ...(data.name && { name: data.name }),
        },
        select: {
            id: true,
            name: true,
            email: true,
            githubId: true,
            profileUrl: true,
            githubInstallationId: true,
            planType: true,
            role: true,
            usedDocsQuota: true,
            created_at: true,
            updated_at: true,
            creditBalance: { select: { balance: true } },
        },
    });

    return updatedUser;
};
