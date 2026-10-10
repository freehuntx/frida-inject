import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { compile, compileWithFiles } from '../src/index.ts';

const cwd = path.join(import.meta.dirname, 'fixtures');

/** Runs compiled agent code and returns everything it passed to `send()`. */
function run(source: string): unknown[] {
  const sent: unknown[] = [];
  vm.runInNewContext(source, { send: (value: unknown) => sent.push(value) });
  return sent;
}

describe('compile', () => {
  it('bundles a directory with its imports', async () => {
    expect(run(await compile('./agent', { cwd }))).toEqual([{ result: 15 }]);
  });

  it('bundles an explicit file', async () => {
    expect(run(await compile({ file: './agent/index.ts' }, { cwd }))).toEqual([{ result: 15 }]);
  });

  it('treats unknown strings as source code', async () => {
    expect(run(await compile('send(1 + 1)', { cwd }))).toEqual([2]);
  });

  it('supports TypeScript and imports in source code', async () => {
    const code = "import { add } from './agent/lib/math.ts';\nconst sum: number = add(2, 3);\nsend(sum);";
    expect(run(await compile({ code }, { cwd }))).toEqual([5]);
  });

  it('shares top-level variables between the parts of one script', async () => {
    expect(run(await compile(['const shared = 41', './agent', 'send(shared + 1)'], { cwd }))).toEqual([
      { result: 15 },
      42,
    ]);
  });

  it('embeds a source map for single scripts only', async () => {
    expect(await compile('./agent', { cwd })).toContain('sourceMappingURL=data:');
    expect(await compile('./agent', { cwd, sourcemap: false })).not.toContain('sourceMappingURL');
    expect(await compile(['./agent', 'send(1)'], { cwd })).not.toContain('sourceMappingURL');
  });

  it('lists the files a script was made from', async () => {
    const { files } = await compileWithFiles(['./agent', 'send(1)'], { cwd });
    expect(files.sort()).toEqual([path.join(cwd, 'agent/index.ts'), path.join(cwd, 'agent/lib/math.ts')]);
  });

  it('passes extra options on to esbuild', async () => {
    const source = await compile('send(VERSION)', { cwd, esbuild: { define: { VERSION: '"1.2.3"' } } });
    expect(run(source)).toEqual(['1.2.3']);
  });

  it('reports a missing file instead of running its name as code', async () => {
    await expect(compile('./does-not-exist', { cwd })).rejects.toThrow(/Script file not found/);
  });

  it('reports syntax errors', async () => {
    await expect(compile({ code: 'const = ;' }, { cwd })).rejects.toThrow(/Build failed/);
  });

  it('rejects invalid input', async () => {
    await expect(compile(42 as never, { cwd })).rejects.toThrow(TypeError);
  });
});
