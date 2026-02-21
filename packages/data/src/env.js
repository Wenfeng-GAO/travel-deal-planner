import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

export function resolveRepoRoot() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', '..', '..');
}

export function loadEnv({ override = false } = {}) {
  const root = resolveRepoRoot();
  const envPath = path.join(root, '.env');
  dotenv.config({ path: envPath, override });
  return envPath;
}
