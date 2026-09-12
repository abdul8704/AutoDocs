import prisma from "../prisma/prisma";

export const globalSearchService = async (query: string, userId: string, isAdmin = false) => {
    if (!query || query.trim().length === 0) {
        return { repositories: [], jobs: [], users: [] };
    }

    const searchTerm = query.trim();

    const [repositories, jobs, users] = await Promise.all([
        prisma.repo.findMany({
            where: {
                user_id: userId,
                OR: [
                    { full_name: { contains: searchTerm, mode: "insensitive" } },
                    { clone_url: { contains: searchTerm, mode: "insensitive" } },
                ],
            },
            take: 10,
            select: {
                id: true,
                full_name: true,
                clone_url: true,
                created_at: true,
            },
        }),
        prisma.docsUpdateJob.findMany({
            where: {
                repository: { user_id: userId },
                OR: [
                    { triggerCommit: { contains: searchTerm, mode: "insensitive" } },
                    { branchName: { contains: searchTerm, mode: "insensitive" } },
                    { id: { contains: searchTerm, mode: "insensitive" } },
                ],
            },
            take: 10,
            include: {
                repository: {
                    select: {
                        id: true,
                        full_name: true,
                    },
                },
            },
            orderBy: { createdAt: "desc" },
        }),
        isAdmin
            ? prisma.user.findMany({
                  where: {
                      OR: [
                          { name: { contains: searchTerm, mode: "insensitive" } },
                          { email: { contains: searchTerm, mode: "insensitive" } },
                          { id: { contains: searchTerm, mode: "insensitive" } },
                      ],
                  },
                  take: 10,
                  select: {
                      id: true,
                      name: true,
                      email: true,
                      planType: true,
                  },
              })
            : Promise.resolve([]),
    ]);

    return {
        repositories,
        jobs,
        users,
    };
};
