import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * `ampx` does not read .env files, but the function resources need
 * VITE_SUPABASE_URL at synthesize time. Imported first from backend.ts.
 */
for (const file of ['.env', '.env.local']) {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) continue;

  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, '');
  }
}
