import prisma from "../prisma/prisma";
import { HttpError } from "../utils/httpError.utils";

export const getUserById = async (userId: string) => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            name: true,
            email: true,
            githubId: true,
            profileUrl: true,
            githubInstallationId: true,
            planType: true,
            usedDocsQuota: true,
            created_at: true,
            updated_at: true,
        },
    });

    if (!user) {
        throw new HttpError(404, "User not found");
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
            usedDocsQuota: true,
            created_at: true,
            updated_at: true,
        },
    });

    return updatedUser;
};
