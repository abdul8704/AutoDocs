import { Request, Response } from 'express';
import { updateTaskConfig, getLLMtaskConfig } from './llm.config.service';

export const updateLLMConfig = async (req: Request, res: Response) => {
    const { taskKey, provider, model, temperature, systemInstruction } = req.body;

    // 1. Update the database and clear the cache
    await updateTaskConfig(taskKey, {
      provider,
      model,
      temperature,
      systemInstruction,
    });

    // 2. The next time the 'judge' or 'tinyRepo' task fires, 
    // it will use the newly selected provider/model.
    return res.status(200).json({ message: 'Configuration updated successfully' });

}

export const getLLMConfig = async (req: Request, res: Response) => {
    const { taskKey } = req.params as { taskKey: string };

    if(typeof taskKey !== "string")
        res.status(400).json({ message: "Bad Request. taskKey should be string"})

    const config = await getLLMtaskConfig(taskKey);

    res.status(200).json({ success: true, config })
}