import { parseArgs } from 'node:util';

export const HELP = `Usage: frida-inject [options] [script ...]

Injects JavaScript or TypeScript files into a running process.

Target (pick one):
  -n, --name <name>      attach to the process with this name
  -p, --pid <pid>        attach to the process with this id
  -f, --spawn <program>  start this program and inject before it runs
                         (arguments for the program go after "--")

Scripts:
  [script ...]           files, folders or packages to inject, in order
  -e, --eval <code>      code to inject, can be given more than once

Device:
  -U, --usb              use the device connected over USB
  -H, --host <address>   use a frida-server running on another machine

Other:
      --watch            reload a script when its file, or a file it
                         imports, changes
  -w, --wait <ms>        if the process is not running yet, look again
                         every <ms> milliseconds (only with --name)
      --runtime <name>   JavaScript engine in the target: qjs or v8
      --no-sourcemap     do not embed source maps
      --no-clean         leave Frida's helper processes and temp folders
      --debug            print every step
  -h, --help             show this help
  -v, --version          show the version

Examples:
  frida-inject -n notepad.exe agent.ts
  frida-inject -p 1234 -e 'send(Process.id)'
  frida-inject -n notepad.exe --watch agent.ts
  frida-inject -f /usr/bin/app agent.js -- --some-flag
  frida-inject -U -n Twitter hooks.ts
`;

export interface CliArgs {
  help: boolean;
  version: boolean;
  name?: string;
  pid?: number;
  spawn?: string;
  spawnArgs: string[];
  files: string[];
  evals: string[];
  usb: boolean;
  host?: string;
  wait?: number;
  watch: boolean;
  runtime?: 'qjs' | 'v8';
  sourcemap: boolean;
  clean: boolean;
  debug: boolean;
}

/** Problems with the command line. Shown to the user without a stack trace. */
export class UsageError extends Error {}

function toNumber(value: string, flag: string): number {
  const number = Number(value);
  if (value.trim() === '' || !Number.isInteger(number) || number < 0) {
    throw new UsageError(`${flag} expects a whole number, got "${value}".`);
  }
  return number;
}

export function parseCli(argv: string[]): CliArgs {
  // Everything after "--" belongs to the program started with --spawn.
  const separator = argv.indexOf('--');
  const own = separator === -1 ? argv : argv.slice(0, separator);
  const spawnArgs = separator === -1 ? [] : argv.slice(separator + 1);

  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(own);
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
  const { values, positionals } = parsed;

  const args: CliArgs = {
    help: values.help ?? false,
    version: values.version ?? false,
    name: values.name,
    pid: values.pid === undefined ? undefined : toNumber(values.pid, '--pid'),
    spawn: values.spawn,
    spawnArgs,
    files: positionals,
    evals: values.eval ?? [],
    usb: values.usb ?? false,
    host: values.host,
    wait: values.wait === undefined ? undefined : toNumber(values.wait, '--wait'),
    watch: values.watch ?? false,
    sourcemap: !values['no-sourcemap'],
    clean: !values['no-clean'],
    debug: values.debug ?? false,
  };

  if (values.runtime !== undefined) {
    if (values.runtime !== 'qjs' && values.runtime !== 'v8') {
      throw new UsageError(`--runtime expects "qjs" or "v8", got "${values.runtime}".`);
    }
    args.runtime = values.runtime;
  }

  if (args.help || args.version) return args;

  const targets = [args.name, args.pid, args.spawn].filter((target) => target !== undefined);
  if (targets.length === 0) throw new UsageError('No target given. Use --name, --pid or --spawn.');
  if (targets.length > 1) throw new UsageError('Use only one of --name, --pid and --spawn.');
  if (spawnArgs.length > 0 && args.spawn === undefined) {
    throw new UsageError('Arguments after "--" are only allowed together with --spawn.');
  }
  if (args.wait !== undefined && args.name === undefined) throw new UsageError('--wait only works with --name.');
  if (args.usb && args.host !== undefined) throw new UsageError('Use either --usb or --host, not both.');
  if (args.files.length === 0 && args.evals.length === 0) {
    throw new UsageError('Nothing to inject. Pass a script file or use --eval.');
  }

  return args;
}

function parse(argv: string[]) {
  return parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      name: { type: 'string', short: 'n' },
      pid: { type: 'string', short: 'p' },
      spawn: { type: 'string', short: 'f' },
      eval: { type: 'string', short: 'e', multiple: true },
      usb: { type: 'boolean', short: 'U' },
      host: { type: 'string', short: 'H' },
      wait: { type: 'string', short: 'w' },
      watch: { type: 'boolean' },
      runtime: { type: 'string' },
      'no-sourcemap': { type: 'boolean' },
      'no-clean': { type: 'boolean' },
      debug: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });
}
