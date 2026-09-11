import prisma from "../../prisma/prisma"


export const addNewModel = async (
    modelName: string, 
    provider: string, 
    contextWindow: number, 
    inputCost: number, 
    outputCost: number, 
    cacheRead: number,
    cacheWrite: number
) => {
    const model = await prisma.modelRoster.create({
        data: {
            modelName,
            provider,
            contextWindow,
            inputPrice: inputCost,
            outputPrice: outputCost,
            cacheRead,
            cacheWrite
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

export const updateModel = async (
    id: string, 
    modelName: string, 
    provider: string, 
    contextWindow: number,
    inputCost?: number,
    outputCost?: number,
    cacheRead?: number,
    cacheWrite?: number
) => {
    await prisma.modelRoster.update({
        where: {
            id
        },
        data: {
            modelName,
            provider,
            contextWindow,
            ...(inputCost !== undefined && { inputPrice: inputCost }),
            ...(outputCost !== undefined && { outputPrice: outputCost }),
            ...(cacheRead !== undefined && { cacheRead }),
            ...(cacheWrite !== undefined && { cacheWrite }),
        }
    })
}

