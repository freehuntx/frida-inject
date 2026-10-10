import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Message } from 'frida';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import inject from '../src/index.ts';

describe('inject (validation)', () => {
  it('requires a target', async () => {
    await expect(inject({})).rejects.toThrow(/Missing target/);
  });

  it('refuses pid and name together', async () => {
    await expect(inject({ pid: 1, name: 'init' })).rejects.toThrow(/not both/);
  });
});

// Attaching to a real process needs ptrace permissions, so this part is opt-in:
//   FRIDA_TEST_ATTACH=1 npm test
describe.runIf(process.env.FRIDA_TEST_ATTACH === '1')('inject (real process)', () => {
  let pid = 0;

  beforeEach(() => {
    // Started through a shell so the target is not a child of this Node.js process.
    // Node.js collects the status of its own children, which Frida needs for itself.
    pid = Number(execFileSync('sh', ['-c', 'sleep 300 >/dev/null 2>&1 & echo $!'], { encoding: 'utf8' }));
  });

  afterEach(() => {
    try {
      process.kill(pid);
    } catch {
      // Already gone.
    }
  });

  it('loads scripts and receives their messages', async () => {
    const messages: Message[] = [];
    const events: string[] = [];

    const injection = await inject({
      pid,
      handleSignals: false,
      scripts: ['./fixtures/agent', 'send(Process.id)', ['const shared = 41', 'send(shared + 1)']],
      onAttach: () => events.push('attach'),
      onLoad: () => events.push('load'),
      onUnload: () => events.push('unload'),
      onDetach: () => events.push('detach'),
      onMessage: (message) => messages.push(message),
    });

    expect(injection.scripts).toHaveLength(3);
    await expect
      .poll(() => messages.map((m) => (m.type === 'send' ? m.payload : m)))
      .toEqual([{ result: 15 }, pid, 42]);

    await injection.detach();
    expect(injection.session.isDetached()).toBe(true);
    await expect.poll(() => events).toEqual(['attach', 'load', 'load', 'load', 'unload', 'unload', 'unload', 'detach']);
  });

  it('reloads a script when one of its files changes', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inject-watch-'));
    const value = path.join(dir, 'value.js');
    fs.writeFileSync(path.join(dir, 'agent.js'), "import { value } from './value.js';\nsend(value);\n");
    fs.writeFileSync(value, 'export const value = 1;\n');

    const payloads: unknown[] = [];
    const errors: unknown[] = [];
    const events: string[] = [];

    const injection = await inject({
      pid,
      cwd: dir,
      watch: true,
      handleSignals: false,
      scripts: ['./agent.js'],
      onLoad: () => events.push('load'),
      onUnload: () => events.push('unload'),
      onReloadError: (error) => errors.push(error),
      onMessage: (message) => message.type === 'send' && payloads.push(message.payload),
    });

    try {
      await expect.poll(() => payloads).toEqual([1]);
      const [first] = injection.scripts;

      // A change in an imported file is picked up.
      fs.writeFileSync(value, 'export const value = 2;\n');
      await expect.poll(() => payloads, { timeout: 10_000 }).toEqual([1, 2]);
      expect(events).toEqual(['load', 'unload', 'load']);
      expect(injection.scripts).toHaveLength(1);
      expect(injection.scripts[0]).not.toBe(first);
      expect(first?.isDestroyed).toBe(true);

      // A broken file is reported and the running version stays.
      const second = injection.scripts[0];
      fs.writeFileSync(value, 'export const value = ;\n');
      await expect.poll(() => errors, { timeout: 10_000 }).toHaveLength(1);
      expect(injection.scripts[0]).toBe(second);
      expect(second?.isDestroyed).toBe(false);

      // Fixing it brings the next version in.
      fs.writeFileSync(value, 'export const value = 3;\n');
      await expect.poll(() => payloads, { timeout: 10_000 }).toEqual([1, 2, 3]);
    } finally {
      await injection.detach();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('waits for a process to appear and can be aborted', async () => {
    const waiting = inject({ name: 'surely-no-such-process', waitDelay: 50, signal: AbortSignal.timeout(300) });
    await expect(waiting).rejects.toThrow(/abort|timeout/i);
  });

  it('fails right away without waitDelay', async () => {
    await expect(inject({ name: 'surely-no-such-process' })).rejects.toThrow(/process not found/i);
  });
});
