// Development seed data. Run with `npm run db:seed` (or automatically by `prisma migrate reset`).
// Idempotent: every write is an upsert keyed on a stable value, so running it twice is safe.
import { loadConfig } from "../src/config.js";
import { createPrismaClient } from "../src/infra/db.js";

const config = loadConfig();
const prisma = createPrismaClient(config.databaseUrl);

const SAMPLE = `# Release checklist

1. Freeze main
2. Run the full test suite
3. Tag the release
4. Publish the changelog
5. Announce in #releases
`;

async function main(): Promise<void> {
  const ada = await prisma.user.upsert({
    where: { githubId: "1001" },
    update: {},
    create: { githubId: "1001", login: "ada", name: "Ada Lovelace" },
  });
  const grace = await prisma.user.upsert({
    where: { githubId: "1002" },
    update: {},
    create: { githubId: "1002", login: "grace", name: "Grace Hopper" },
  });

  // Fixed id so the upsert has something stable to match; cuids are generated otherwise.
  const doc = await prisma.document.upsert({
    where: { id: "seed-document-1" },
    update: {},
    create: {
      id: "seed-document-1",
      title: "Release checklist",
      filename: "release-checklist.md",
      content: SAMPLE,
      lineCount: SAMPLE.trimEnd().split("\n").length,
      owner: { connect: { id: ada.id } },
    },
  });

  await prisma.comment.upsert({
    where: { id: "seed-comment-1" },
    update: {},
    create: {
      id: "seed-comment-1",
      body: "Should we also notify support before tagging?",
      startLine: 5,
      endLine: 5,
      document: { connect: { id: doc.id } },
      author: { connect: { id: grace.id } },
    },
  });
  await prisma.comment.upsert({
    where: { id: "seed-comment-2" },
    update: {},
    create: {
      id: "seed-comment-2",
      body: "Steps 3 and 4 can run in parallel.",
      startLine: 5,
      endLine: 6,
      document: { connect: { id: doc.id } },
      author: { connect: { id: ada.id } },
    },
  });

  console.log(`Seeded users (${ada.login}, ${grace.login}), document "${doc.title}", 2 comments.`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  // Always release the connection, or the script's process never exits.
  .finally(() => prisma.$disconnect());
