import { z } from 'zod';
import { MAX_MESSAGE_LENGTH } from './message.model.js';

export const messageText = z.string().trim().min(1).max(MAX_MESSAGE_LENGTH);

export const sendMessageSchema = z.object({
  text: messageText,
  clientId: z.string().trim().min(1).max(64).optional(),
});
