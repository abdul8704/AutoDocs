import prisma from "../../prisma/prisma"

export const getAllprompts = async () => {
    const prompts = await prisma.prompt.findMany({});
    return prompts;
}

export const getTaskPrompt = async (promptKey: string) => {
    return prisma.prompt.findMany({
        where: {
            prompt_key: promptKey
        }
    })
};



export const addPrompt = async (promptKey: string, version: string, content: string) => {
    return await prisma.prompt.create({
        data: {
            prompt_key: promptKey,
            version,
            content
        }
    });
}

export const deletePrompt = async (promptId: string) => {
    return await prisma.prompt.delete({
        where: {
            id: promptId
        }
    });
}

export const updatePrompt = async (promptId: string, version: string, content: string) => {
    return await prisma.prompt.update({
        where: {
            id: promptId
        },
        data: {
            version,
            content
        }
    });
}
