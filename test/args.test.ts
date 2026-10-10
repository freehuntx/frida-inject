import { describe, expect, it } from 'vitest';
import { parseCli, UsageError } from '../src/args.ts';

describe('parseCli', () => {
  it('reads a target, files and code', () => {
    const args = parseCli(['-n', 'notepad.exe', 'agent.ts', '-e', 'send(1)', '-e', 'send(2)']);
    expect(args).toMatchObject({ name: 'notepad.exe', files: ['agent.ts'], evals: ['send(1)', 'send(2)'] });
    expect(args).toMatchObject({ clean: true, sourcemap: true, debug: false, usb: false });
  });

  it('reads numbers and switches', () => {
    const args = parseCli([
      '--pid',
      '1234',
      'a.js',
      '--no-clean',
      '--no-sourcemap',
      '--runtime',
      'v8',
      '-U',
      '--watch',
    ]);
    expect(args).toMatchObject({ pid: 1234, clean: false, sourcemap: false, runtime: 'v8', usb: true, watch: true });
  });

  it('hands everything after "--" to the spawned program', () => {
    const args = parseCli(['-f', '/bin/app', 'agent.js', '--', '--flag', '-n', 'value']);
    expect(args).toMatchObject({ spawn: '/bin/app', files: ['agent.js'], spawnArgs: ['--flag', '-n', 'value'] });
  });

  it('accepts --help and --version without a target', () => {
    expect(parseCli(['--help']).help).toBe(true);
    expect(parseCli(['-v']).version).toBe(true);
  });

  it.each([
    [['agent.js'], /No target/],
    [['-n', 'a', '-p', '1', 'agent.js'], /only one of/],
    [['-n', 'a'], /Nothing to inject/],
    [['-p', 'abc', 'agent.js'], /whole number/],
    [['-p', '1', '-w', '500', 'agent.js'], /only works with --name/],
    [['-n', 'a', '-U', '-H', 'host', 'agent.js'], /either --usb or --host/],
    [['-n', 'a', 'agent.js', '--runtime', 'node'], /"qjs" or "v8"/],
    [['-n', 'a', 'agent.js', '--', 'x'], /only allowed together with --spawn/],
    [['-n', 'a', 'agent.js', '--nope'], /Unknown option/],
  ])('rejects %j', (argv, message) => {
    expect(() => parseCli(argv)).toThrow(UsageError);
    expect(() => parseCli(argv)).toThrow(message);
  });
});
