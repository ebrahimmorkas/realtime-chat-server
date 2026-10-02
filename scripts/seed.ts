/**
 * Demo data for the web client: five users, two direct chats and two groups
 * with a realistic message history. Safe to re-run: it does nothing if the
 * demo users already exist. All demo users share the password `Password123!`.
 *
 *   npm run db:seed
 */
import bcrypt from 'bcryptjs';
import mongoose, { Types } from 'mongoose';
import { env } from '../src/config/env.js';
import {
  ConversationModel,
  directKeyFor,
} from '../src/modules/conversations/conversation.model.js';
import { MessageModel } from '../src/modules/messages/message.model.js';
import { UserModel } from '../src/modules/users/user.model.js';

const PASSWORD = 'Password123!';
const MINUTE = 60_000;

const USERS = [
  { username: 'alice', displayName: 'Alice Johnson' },
  { username: 'bob', displayName: 'Bob Martinez' },
  { username: 'carol', displayName: 'Carol Singh' },
  { username: 'dave', displayName: 'Dave Okafor' },
  { username: 'erin', displayName: 'Erin Walsh' },
] as const;

type Username = (typeof USERS)[number]['username'];

/** [sender, text, minutes ago] */
type Script = [Username, string, number][];

const CHATS: { name?: string; members: Username[]; script: Script }[] = [
  {
    members: ['alice', 'bob'],
    script: [
      ['bob', 'Hey Alice! Did you get a chance to look at the new dashboard designs?', 190],
      ['alice', 'Yes! The dark mode looks great 🌙', 186],
      ['alice', 'I left a couple of comments on the charts page', 186],
      ['bob', 'Perfect, I will go through them after lunch', 180],
      ['bob', 'Also, are we still on for the demo on Friday?', 62],
      ['alice', 'Absolutely. I will prepare the walkthrough', 58],
      ['bob', 'Great. Can you also show the real-time updates? People love that part', 12],
    ],
  },
  {
    members: ['alice', 'carol'],
    script: [
      ['carol', 'Morning! Coffee at 10?', 600],
      ['alice', 'Sounds good ☕', 595],
      ['carol', 'Thanks for helping with the deployment yesterday', 300],
      ['alice', 'Anytime! The Redis adapter made scaling painless', 298],
    ],
  },
  {
    name: 'Weekend trip 🏔️',
    members: ['alice', 'bob', 'carol', 'dave'],
    script: [
      ['dave', 'Okay team, mountains or beach this weekend?', 1500],
      ['carol', 'Mountains! The weather looks perfect', 1490],
      ['bob', '+1 for mountains', 1488],
      ['alice', 'I can drive. My car fits four', 1470],
      ['dave', "Amazing. Let's leave Saturday at 7am", 1460],
      ['carol', "I'll book the cabin tonight", 240],
      ['dave', 'Who is bringing snacks? 🍫', 30],
    ],
  },
  {
    name: 'Frontend guild',
    members: ['alice', 'bob', 'erin'],
    script: [
      ['erin', 'Reminder: guild meeting on Thursday, topic is React Server Components', 2900],
      ['bob', "I'll present our TanStack Query caching patterns", 2880],
      ['alice', 'Can someone share the slides from last time?', 2000],
      ['erin', 'Uploaded them to the shared drive 👍', 1990],
    ],
  },
];

async function main() {
  await mongoose.connect(env.MONGO_URL, { serverSelectionTimeoutMS: 5000 });

  if (await UserModel.exists({ username: 'alice' })) {
    console.log('Demo data already present, nothing to do.');
    return;
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const created = await UserModel.insertMany(
    USERS.map((u) => ({ ...u, email: `${u.username}@example.com`, passwordHash })),
  );
  const ids = Object.fromEntries(created.map((u) => [u.username, u._id])) as Record<
    Username,
    Types.ObjectId
  >;

  const now = Date.now();
  for (const chat of CHATS) {
    const conversationId = new Types.ObjectId();
    const messages = chat.script.map(([sender, text, minutesAgo]) => ({
      // Ids embed the timestamp, so cursor pagination by _id follows the history.
      _id: new Types.ObjectId(
        Types.ObjectId.generate(Math.floor((now - minutesAgo * MINUTE) / 1000)),
      ),
      conversation: conversationId,
      sender: ids[sender],
      text,
      createdAt: new Date(now - minutesAgo * MINUTE),
      editedAt: null,
      deletedAt: null,
    }));
    // Inserted directly so the history keeps its past timestamps.
    await MessageModel.collection.insertMany(messages);

    const last = messages.at(-1)!;
    const firstAt = messages[0]!.createdAt;
    await ConversationModel.create({
      _id: conversationId,
      type: chat.name ? 'group' : 'direct',
      name: chat.name ?? null,
      directKey: chat.name
        ? undefined
        : directKeyFor(...(chat.members.map((m) => String(ids[m])) as [string, string])),
      createdBy: ids[chat.members[0]!],
      members: chat.members.map((username, index) => ({
        user: ids[username],
        role: chat.name && index === 0 ? 'admin' : 'member',
        joinedAt: new Date(firstAt.getTime() - MINUTE),
        // Alice has read everything except the newest message in each chat,
        // so she sees unread badges; everyone else is fully caught up.
        lastReadAt:
          username === 'alice' && last.sender !== ids.alice
            ? new Date(last.createdAt.getTime() - 1)
            : last.createdAt,
      })),
      lastMessage: {
        id: String(last._id),
        text: last.text,
        sender: last.sender,
        createdAt: last.createdAt,
      },
      lastMessageAt: last.createdAt,
    });
  }

  console.log(`Seeded ${USERS.length} users and ${CHATS.length} conversations.`);
  console.log(`Log in as alice, bob, carol, dave or erin with password ${PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
