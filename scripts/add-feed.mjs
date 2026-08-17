import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { addFeedEntry, validateFeedEntries } from './feed.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const feedFile = path.join(projectRoot, 'content', 'feed.json');

async function updateFeed() {
  const source = await readFile(feedFile, 'utf8');
  const entries = validateFeedEntries(JSON.parse(source));
  const result = addFeedEntry(entries, {
    type: process.env.FEED_TYPE,
    title: process.env.FEED_TITLE,
    body: process.env.FEED_BODY,
    href: process.env.FEED_HREF,
    linkLabel: process.env.FEED_LINK_LABEL,
    date: process.env.FEED_DATE,
    id: process.env.FEED_ID,
  });

  await writeFile(feedFile, `${JSON.stringify(result.entries, null, 2)}\n`);
  console.log(`Added ${result.entry.type} feed entry "${result.entry.title}" (${result.entry.id}).`);
}

updateFeed().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
