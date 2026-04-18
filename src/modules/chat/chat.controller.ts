import { Request, Response, NextFunction } from 'express';
import { getConversations, getMessages, sendMessage, deleteMessage } from './chat.service';

export async function listConversations(req: Request, res: Response, next: NextFunction) {
  try {
    const conversations = await getConversations(req.user!.userId);
    res.json({ conversations });
  } catch (err) {
    next(err);
  }
}

export async function listMessages(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
    const messages = await getMessages(req.params.conversationId, req.user!.userId, limit, offset);
    res.json({ messages });
  } catch (err) {
    next(err);
  }
}

export async function postMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const { text, messageType, mediaKey } = req.body;
    const message = await sendMessage(
      req.params.conversationId,
      req.user!.userId,
      text,
      messageType,
      mediaKey
    );
    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
}

export async function removeMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await deleteMessage(req.params.messageId, req.user!.userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
