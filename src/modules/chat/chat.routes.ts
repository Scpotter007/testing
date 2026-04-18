import { Router } from 'express';
import { body, param } from 'express-validator';
import { authenticate } from '../../middleware/auth.middleware';
import { listConversations, listMessages, postMessage, removeMessage } from './chat.controller';

const router = Router();

router.get('/', authenticate, listConversations);
router.get('/:conversationId/messages', authenticate, listMessages);
router.post(
  '/:conversationId/messages',
  authenticate,
  [
    param('conversationId').isUUID(),
    body('text').isString().notEmpty().isLength({ max: 5000 }),
    body('messageType').optional().isIn(['text', 'image', 'video', 'audio']),
    body('mediaKey').optional().isString(),
  ],
  postMessage
);
router.delete('/:conversationId/messages/:messageId', authenticate, removeMessage);

export default router;
