import { expect, test, type Browser, type Page } from '@playwright/test';

/** Each user gets their own browser context, i.e. a separate session. */
async function openAs(browser: Browser, name: 'Alice' | 'Bob' | 'Carol'): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByRole('button', { name: new RegExp(`Log in as ${name}`) }).click();
  await expect(page.getByRole('navigation', { name: 'Conversations' })).toBeVisible();
  return page;
}

const openChat = (page: Page, title: string) =>
  page
    .getByRole('navigation', { name: 'Conversations' })
    .getByRole('link', { name: new RegExp(title) })
    .click();

const unique = (text: string) => `${text} ${Date.now().toString(36)}`;

test('messages, typing indicators and read receipts flow between two users live', async ({
  browser,
}) => {
  const alice = await openAs(browser, 'Alice');
  const bob = await openAs(browser, 'Bob');

  await openChat(alice, 'Bob Martinez');
  await openChat(bob, 'Alice Johnson');

  // Bob sees Alice online and typing.
  const bobsView = bob.getByRole('region', { name: 'Alice Johnson' });
  await expect(bobsView.getByText('online', { exact: true })).toBeVisible();
  await alice.getByLabel('Message', { exact: true }).pressSequentially('Hi Bob', { delay: 30 });
  await expect(bobsView.getByText('typing…', { exact: true })).toBeVisible();

  // The message arrives without a reload.
  const text = unique('Hi Bob, are you there?');
  await alice.getByLabel('Message', { exact: true }).fill(text);
  await alice.getByLabel('Message', { exact: true }).press('Enter');
  await expect(bob.getByRole('log').getByText(text)).toBeVisible();

  // Bob has the chat open, so Alice's message turns to "Seen".
  const receipt = alice.getByRole('log').getByTestId('receipt').last();
  await expect(receipt).toHaveAttribute('data-state', 'seen');

  // And the reply comes back the other way.
  const reply = unique('Yes! Real-time works');
  await bob.getByLabel('Message', { exact: true }).fill(reply);
  await bob.getByRole('button', { name: 'Send message' }).click();
  await expect(alice.getByRole('log').getByText(reply)).toBeVisible();
});

test('unread badges update for chats that are not open', async ({ browser }) => {
  const alice = await openAs(browser, 'Alice');
  const carol = await openAs(browser, 'Carol');

  await openChat(carol, 'Alice Johnson');
  const text = unique('Ping from Carol');
  await carol.getByLabel('Message', { exact: true }).fill(text);
  await carol.getByLabel('Message', { exact: true }).press('Enter');

  const item = alice
    .getByRole('navigation', { name: 'Conversations' })
    .getByRole('link', { name: /Carol Singh/ });
  await expect(item).toContainText(text);
  await expect(item.getByLabel(/unread/)).toBeVisible();

  await item.click();
  await expect(item.getByLabel(/unread/)).toHaveCount(0);
});

test('a user can edit and delete their own message', async ({ browser }) => {
  const alice = await openAs(browser, 'Alice');
  const bob = await openAs(browser, 'Bob');
  await openChat(alice, 'Bob Martinez');
  await openChat(bob, 'Alice Johnson');

  const text = unique('Typo mesage');
  await alice.getByLabel('Message', { exact: true }).fill(text);
  await alice.getByLabel('Message', { exact: true }).press('Enter');
  const bubble = alice.getByRole('log').getByText(text);
  await expect(bubble).toBeVisible();

  await bubble.hover();
  await alice.getByRole('button', { name: 'Message actions' }).last().click();
  await alice.getByRole('menuitem', { name: 'Edit' }).click();
  const fixed = text.replace('mesage', 'message');
  await alice.getByLabel('Edit message').fill(fixed);
  await alice.getByLabel('Edit message').press('Enter');
  await expect(bob.getByRole('log').getByText(fixed)).toBeVisible();

  await alice.getByRole('log').getByText(fixed).hover();
  await alice.getByRole('button', { name: 'Message actions' }).last().click();
  await alice.getByRole('menuitem', { name: 'Delete' }).click();
  await alice.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(bob.getByRole('log').getByText(fixed)).toHaveCount(0);
});

test('creating a group notifies the members instantly', async ({ browser }) => {
  const alice = await openAs(browser, 'Alice');
  const carol = await openAs(browser, 'Carol');
  const name = unique('Book club');

  await alice.getByRole('button', { name: 'New group' }).click();
  const dialog = alice.getByRole('dialog');
  await dialog.getByLabel('Group name').fill(name);
  await dialog.getByLabel('Search people').fill('car');
  await dialog.getByRole('button', { name: /Carol Singh/ }).click();
  await dialog.getByRole('button', { name: 'Create group' }).click();

  await expect(alice.getByRole('heading', { name })).toBeVisible();
  await expect(
    carol
      .getByRole('navigation', { name: 'Conversations' })
      .getByRole('link', { name: new RegExp(name) }),
  ).toBeVisible();
});
