import { query, withTransaction } from '../../db';
import { AppError } from '../../middleware/errorHandler.middleware';
import { encryptMessage, decryptMessage } from '../../utils/crypto';

const CHAT_ENCRYPTION_SECRET = process.env.CHAT_ENCRYPTION_SECRET || 'default-chat-secret-change-in-prod';

export async function getConversations(userId: string) {
  const { rows } = await query(
    `SELECT c.*,
       CASE WHEN c.participant1_id = $1 THEN p2.display_name ELSE p1.display_name END as other_display_name,
       CASE WHEN c.participant1_id = $1 THEN c.participant2_id ELSE c.participant1_id END as other_user_id
     FROM conversations c
     JOIN profiles p1 ON p1.user_id = c.participant1_id
     JOIN profiles p2 ON p2.user_id = c.participant2_id
     WHERE c.participant1_id = $1 OR c.participant2_id = $1
     ORDER BY c.last_message_at DESC NULLS LAST`,
    [userId]
  );
  return rows;
}

export async function getMessages(conversationId: string, userId: string, limit = 50, offset = 0) {
  const { rows: conv } = await query(
    'SELECT * FROM conversations WHERE id = $1 AND (participant1_id = $2 OR participant2_id = $2)',
    [conversationId, userId]
  );
  if (conv.length === 0) throw new AppError(403, 'Not a participant', 'UNAUTHORIZED');

  const { rows } = await query(
    `SELECT m.*, p.display_name as sender_name
     FROM messages m
     JOIN profiles p ON p.user_id = m.sender_id
     WHERE m.conversation_id = $1 AND m.is_deleted = false
     ORDER BY m.created_at DESC LIMIT $2 OFFSET $3`,
    [conversationId, limit, offset]
  );

  return rows.map(msg => ({
    ...msg,
    content: msg.content_encrypted && msg.content_iv
      ? (() => {
          try {
            return decryptMessage(msg.content_encrypted, msg.content_iv, CHAT_ENCRYPTION_SECRET);
          } catch {
            return '[Decryption failed]';
          }
        })()
      : null,
    content_encrypted: undefined,
    content_iv: undefined,
  }));
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  text: string,
  messageType: 'text' | 'image' | 'video' | 'audio' = 'text',
  mediaKey?: string
) {
  const { rows: conv } = await query(
    'SELECT * FROM conversations WHERE id = $1 AND (participant1_id = $2 OR participant2_id = $2)',
    [conversationId, senderId]
  );
  if (conv.length === 0) throw new AppError(403, 'Not a participant', 'UNAUTHORIZED');

  return withTransaction(async (client) => {
    const { encrypted, iv } = encryptMessage(text, CHAT_ENCRYPTION_SECRET);

    const { rows } = await client.query(
      `INSERT INTO messages (conversation_id, sender_id, content_encrypted, content_iv, message_type, media_key)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, conversation_id, sender_id, message_type, created_at`,
      [conversationId, senderId, encrypted, iv, messageType, mediaKey || null]
    );

    await client.query(
      'UPDATE conversations SET last_message_at = NOW() WHERE id = $1',
      [conversationId]
    );

    return rows[0];
  });
}

export async function deleteMessage(messageId: string, userId: string) {
  const { rows } = await query(
    'SELECT * FROM messages WHERE id = $1 AND sender_id = $2',
    [messageId, userId]
  );
  if (rows.length === 0) throw new AppError(404, 'Message not found or not authorized', 'NOT_FOUND');

  await query('UPDATE messages SET is_deleted = true WHERE id = $1', [messageId]);
  return { messageId, deleted: true };
}
