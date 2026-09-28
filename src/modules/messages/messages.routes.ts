import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { messageText, sendMessageSchema } from './messages.schemas.js';
import * as messages from './messages.service.js';

const listQuery = z.object({
  before: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const messagesRouter = Router();

messagesRouter.use(authenticate);

messagesRouter.get(
  '/conversations/:id/messages',
  validate({ query: listQuery }),
  async (req, res) => {
    const query = req.query as unknown as z.infer<typeof listQuery>;
    res.json(await messages.listMessages(req.user!.id, req.params.id as string, query));
  },
);

messagesRouter.post(
  '/conversations/:id/messages',
  validate({ body: sendMessageSchema }),
  async (req, res) => {
    const result = await messages.sendMessage(req.user!.id, req.params.id as string, req.body);
    res.status(result.duplicate ? 200 : 201).json({ message: result.message });
  },
);

messagesRouter.post('/conversations/:id/read', async (req, res) => {
  res.json(await messages.markRead(req.user!.id, req.params.id));
});

messagesRouter.patch(
  '/messages/:id',
  validate({ body: z.object({ text: messageText }) }),
  async (req, res) => {
    const message = await messages.editMessage(
      req.user!.id,
      req.params.id as string,
      req.body.text,
    );
    res.json({ message });
  },
);

messagesRouter.delete('/messages/:id', async (req, res) => {
  await messages.deleteMessage(req.user!.id, req.params.id);
  res.status(204).end();
});
