import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { applyNowUpdate, validateNowDocument } from './now.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const nowFile = path.join(projectRoot, 'content', 'now.json');

function readBoolean(name) {
  const value = process.env[name];
  if (!value) return false;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  throw new Error(`${name} must be true or false`);
}

async function updateNow() {
  const source = await readFile(nowFile, 'utf8');
  const document = validateNowDocument(JSON.parse(source));
  const result = applyNowUpdate(document, {
    values: {
      doing: process.env.NOW_DOING || '',
      consuming: process.env.NOW_CONSUMING || '',
      note: process.env.NOW_NOTE || '',
    },
    clear: {
      doing: readBoolean('NOW_CLEAR_DOING'),
      consuming: readBoolean('NOW_CLEAR_CONSUMING'),
      note: readBoolean('NOW_CLEAR_NOTE'),
    },
  });

  if (!result.changed) {
    console.log('No effective NOW changes; content/now.json was left untouched.');
    return;
  }

  await writeFile(nowFile, `${JSON.stringify(result.document, null, 2)}\n`);
  console.log(`Updated NOW at ${result.document.current.updatedAt}.`);
}

updateNow().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
