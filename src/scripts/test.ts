import { LLMService } from "../LLM/llm.service"

const testRun = () => {
    const test = async () => {
        const llmService = new LLMService();
        await 
        console.log(await llmService.testLLM());
    }
    test();
}

testRun();