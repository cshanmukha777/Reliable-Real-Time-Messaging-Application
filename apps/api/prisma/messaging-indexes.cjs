const { PrismaClient } = require('@prisma/client');

async function prepareMessaging(db) {
  await db.$runCommandRaw({
    createIndexes: 'messages',
    indexes: [{
      key: { conversationId: 1, body: 'text' },
      name: 'messages_conversation_body_text',
      default_language: 'none',
      language_override: 'searchLanguage',
    }],
  });
  let cursor;
  for (;;) {
    const profiles = await db.profile.findMany({
      where: { OR: [{ discoveryKey: null }, { discoveryKey: { isSet: false } }] },
      orderBy: { id: 'asc' },
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      select: { id: true, displayName: true },
      take: 100,
    });
    if (!profiles.length) break;
    for (const { id, displayName } of profiles) {
      await db.profile.updateMany({
        where: { id, displayName, OR: [{ discoveryKey: null }, { discoveryKey: { isSet: false } }] },
        data: { discoveryKey: displayName.normalize('NFKC').toLowerCase() },
      });
    }
    cursor = profiles.at(-1).id;
  }
}

module.exports = { prepareMessaging };
if (require.main === module) {
  const db = new PrismaClient();
  prepareMessaging(db).catch(() => {
    console.error('Messaging index or public profile preparation failed.');
    process.exitCode = 1;
  }).finally(() => db.$disconnect());
}
