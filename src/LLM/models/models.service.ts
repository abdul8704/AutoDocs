import prisma from "../../prisma/prisma"


export const addNewModel = async (modelName: string, provider: string, contextWindow: number) => {
    const model = await prisma.modelRoster.create({
        data: {
            modelName,
            provider,
            contextWindow
        }
    })
    return model;
}

export const getAllModels = async () => {
    const models = await prisma.modelRoster.findMany();
    return models;
}

export const deleteModel = async (id: string) => {
    const model = await prisma.modelRoster.delete({
        where: {
            id
        }
    })
    return model;
}

export const updateModel = async (id: string, modelName: string, provider: string, contextWindow: number) => {
    await prisma.modelRoster.update({
        where: {
            id
        },
        data: {
            modelName,
            provider,
            contextWindow
        }
    })
}

