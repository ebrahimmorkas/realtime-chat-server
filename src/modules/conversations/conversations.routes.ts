import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as conversations from './conversations.service.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');
const groupName = z.string().trim().min(1).max(80);

export const conversationsRouter = Router();

conversationsRouter.use(authenticate);

conversationsRouter.get('/', async (req, res) => {
  res.json({ data: await conversations.listConversations(req.user!.id) });
});

conversationsRouter.post(
  '/direct',
  validate({ body: z.object({ userId: objectId }) }),
  async (req, res) => {
    const result = await conversations.openDirectConversation(req.user!.id, req.body.userId);
    res.status(result.created ? 201 : 200).json({ conversation: result.conversation });
  },
);

conversationsRouter.post(
  '/group',
  validate({
    body: z.object({
      name: groupName,
      memberIds: z.array(objectId).min(1).max(conversations.MAX_GROUP_MEMBERS),
    }),
  }),
  async (req, res) => {
    const conversation = await conversations.createGroup(
      req.user!.id,
      req.body.name,
      req.body.memberIds,
    );
    res.status(201).json({ conversation });
  },
);

conversationsRouter.get('/:id', async (req, res) => {
  res.json({ conversation: await conversations.getConversation(req.params.id, req.user!.id) });
});

conversationsRouter.patch(
  '/:id',
  validate({ body: z.object({ name: groupName }) }),
  async (req, res) => {
    const conversation = await conversations.renameGroup(
      req.params.id as string,
      req.user!.id,
      req.body.name,
    );
    res.json({ conversation });
  },
);

conversationsRouter.post(
  '/:id/members',
  validate({ body: z.object({ userIds: z.array(objectId).min(1).max(50) }) }),
  async (req, res) => {
    const conversation = await conversations.addMembers(
      req.params.id as string,
      req.user!.id,
      req.body.userIds,
    );
    res.json({ conversation });
  },
);

conversationsRouter.delete('/:id/members/:userId', async (req, res) => {
  res.json(await conversations.removeMember(req.params.id, req.user!.id, req.params.userId));
});
