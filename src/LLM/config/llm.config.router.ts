import { Router } from 'express';
import { authenticate } from '../../auth/auth.middleware';
import { requireAdmin } from '../../middleware/rbac.middleware';
import { asyncHandler } from "../../utils/asyncHandler.utils"
import {
    getLLMConfig,
    updateLLMConfig,
    getAllConfigsController,
    createTaskConfigController,
    deleteTaskConfigController
} from './llm.config.controller';

const router = Router();

router.use(authenticate, requireAdmin);

router.get('/', asyncHandler(getAllConfigsController));
router.get('/:taskKey', asyncHandler(getLLMConfig));

router.post('/', asyncHandler(createTaskConfigController));

router.put('/', asyncHandler(updateLLMConfig));

router.delete('/:taskKey', asyncHandler(deleteTaskConfigController));

export default router;