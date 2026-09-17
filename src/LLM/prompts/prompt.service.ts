import prisma from "../../prisma/prisma";
import { HttpError } from "../../utils/httpError.utils";

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



export const addPrompt = async (promptKey: string, version: string, content: string, promptTitle?: string) => {
    return await prisma.prompt.create({
        data: {
            prompt_key: promptKey,
            version,
            content,
            promptTitle: promptTitle || promptKey,
        }
    });
}

export const deletePrompt = async (promptId: string) => {
    const associatedConfigs = await prisma.lLMTaskConfig.findMany({
        where: { promptId: promptId },
        select: { taskKey: true },
    });

    if (associatedConfigs.length > 0) {
        const taskKeys = associatedConfigs.map((c) => c.taskKey).join(", ");
        throw new HttpError(
            400,
            `Cannot delete prompt template because it is associated with active task config(s): ${taskKeys}. Rebind or remove these task configs first.`
        );
    }

    return await prisma.prompt.delete({
        where: {
            id: promptId
        }
    });
}

export const updatePrompt = async (promptId: string, version: string, content: string, promptTitle?: string) => {
    return await prisma.prompt.update({
        where: {
            id: promptId
        },
        data: {
            version,
            content,
            ...(promptTitle !== undefined && { promptTitle }),
        }
    });
}
