import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getLocalDevice } from 'frida';

/**
 * Removes what Frida leaves behind on the local machine:
 *
 * - helper processes that keep running after an injection (`frida-winjector-*` on Windows)
 * - `frida-*` folders in the temp directory that hold copies of the injected agent
 *
 * Problems are ignored. Files that are still in use simply stay where they are.
 */
export async function clean(): Promise<void> {
  try {
    const device = await getLocalDevice();
    const processes = await device.enumerateProcesses();
    const helpers = processes.filter((process) => process.name.startsWith('frida-winjector'));
    await Promise.allSettled(helpers.map((helper) => device.kill(helper.pid)));
  } catch {
    // No local device, or no permission to list processes.
  }

  const tmpDir = os.tmpdir();
  const entries = await fs.readdir(tmpDir, { withFileTypes: true }).catch(() => []);
  const folders = entries.filter((entry) => entry.isDirectory() && entry.name.startsWith('frida-'));
  await Promise.allSettled(
    folders.map((folder) => fs.rm(path.join(tmpDir, folder.name), { recursive: true, force: true })),
  );
}
