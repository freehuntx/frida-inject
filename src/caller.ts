import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ownDir = import.meta.dirname;

/**
 * Returns the directory of the file that called into this library.
 *
 * Relative script paths are resolved against it, so `scripts: ['./agent']`
 * means "next to the file I am writing", just like `import './agent'` would.
 * Has to be called synchronously, before the first `await`.
 */
export function callerDir(): string {
  const original = Error.prepareStackTrace;
  let files: string[] = [];
  try {
    Error.prepareStackTrace = (_, frames) => frames.map((frame) => frame.getFileName() ?? '');
    files = new Error().stack as unknown as string[];
  } finally {
    Error.prepareStackTrace = original;
  }

  for (const file of files) {
    if (!file || file.startsWith('node:')) continue;
    const filename = file.startsWith('file:') ? fileURLToPath(file) : file;
    if (!path.isAbsolute(filename)) continue;
    const dir = path.dirname(filename);
    if (dir !== ownDir) return dir;
  }

  return process.cwd();
}
