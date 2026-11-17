import { writeFile } from 'node:fs/promises';
import { fields } from '../shared/settings.js';
await writeFile(
  new URL('../src/appmeta/settings.json', import.meta.url),
  JSON.stringify({ format_version: 1, version: 1, fields }, null, 2) + '\n',
);
