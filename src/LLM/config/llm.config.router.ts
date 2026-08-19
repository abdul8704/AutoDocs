import { Router } from 'express';
import { authenticate } from '../../auth/auth.middleware';
import { getLLMConfig, updateLLMConfig } from './llm.config.controller';
import { asyncHandler } from "../../utils/asyncHandler.utils"

const router = Router();

router.get('/config/:taskKey', authenticate, asyncHandler(getLLMConfig));
router.put('/config', authenticate, asyncHandler(updateLLMConfig));

export default router;