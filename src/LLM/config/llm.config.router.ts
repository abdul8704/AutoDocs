import { Router } from 'express';
import { authenticate } from '../../auth/auth.middleware';
import { asyncHandler } from "../../utils/asyncHandler.utils"
import {
    getLLMConfig,
    updateLLMConfig,
    getAllConfigsController,
    createTaskConfigController,
    deleteTaskConfigController
} from './llm.config.controller';

const router = Router();

router.get('/', authenticate, asyncHandler(getAllConfigsController));
router.get('/:taskKey', authenticate, asyncHandler(getLLMConfig));

router.post('/', authenticate, asyncHandler(createTaskConfigController));

router.put('/', authenticate, asyncHandler(updateLLMConfig));

router.delete('/:taskKey', authenticate, asyncHandler(deleteTaskConfigController));

export default router;