#!/usr/bin/env node
import { type Device, getDeviceManager, getLocalDevice, getUsbDevice, ScriptRuntime } from 'frida';
import { type CliArgs, HELP, parseCli, UsageError } from './args.ts';
import type { ScriptInput } from './compile.ts';
import { inject } from './inject.ts';

declare const __VERSION__: string;

async function getDevice(args: CliArgs): Promise<Device> {
  if (args.usb) return getUsbDevice();
  if (args.host !== undefined) return getDeviceManager().addRemoteDevice(args.host);
  return getLocalDevice();
}

async function main(argv: string[]): Promise<void> {
  const args = parseCli(argv);

  if (args.help) {
    process.stdout.write(HELP);
    return;
  }
  if (args.version) {
    console.log(__VERSION__);
    return;
  }

  const device = await getDevice(args);
  const scripts: ScriptInput[] = [...args.files.map((file) => ({ file })), ...args.evals.map((code) => ({ code }))];

  let pid = args.pid;
  if (args.spawn !== undefined) {
    pid = await device.spawn([args.spawn, ...args.spawnArgs]);
  }

  let ready = false;

  await inject({
    device,
    pid,
    name: args.name,
    scripts,
    cwd: process.cwd(),
    waitDelay: args.wait,
    watch: args.watch,
    // Stay quiet for the first load, speak up for every reload after it.
    onLoad: () => {
      if (ready) console.error(`[frida-inject] Reloaded at ${new Date().toLocaleTimeString()}`);
    },
    onReloadError: (error) => {
      console.error(error instanceof Error ? error.message : error);
      console.error('[frida-inject] Reload failed, the previous version keeps running.');
    },
    runtime: args.runtime === undefined ? undefined : ScriptRuntime[args.runtime === 'v8' ? 'V8' : 'QJS'],
    sourcemap: args.sourcemap,
    clean: args.clean,
    debug: args.debug,
    onMessage: (message) => {
      if (message.type === 'error') {
        console.error(message.stack ?? message.description);
      } else {
        const { payload } = message;
        console.log(typeof payload === 'string' ? payload : JSON.stringify(payload));
      }
    },
    // The target is gone or we were told to stop. Either way there is nothing left to do.
    onDetach: () => process.exit(0),
  });

  ready = true;

  if (args.spawn !== undefined && pid !== undefined) {
    await device.resume(pid);
  }

  if (args.watch) console.error('[frida-inject] Watching for changes. Press Ctrl+C to stop.');
}

main(process.argv.slice(2)).catch((error: unknown) => {
  if (error instanceof UsageError) {
    console.error(`${error.message}\nRun "frida-inject --help" to see all options.`);
    process.exit(2);
  }
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
