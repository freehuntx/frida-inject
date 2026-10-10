import { setTimeout as sleep } from 'node:timers/promises';
import type { BuildOptions } from 'esbuild';
import {
  type Crash,
  type Device,
  getLocalDevice,
  type Message,
  type Script,
  type ScriptRuntime,
  type Session,
  type SessionDetachReason,
} from 'frida';
import { callerDir } from './caller.ts';
import { clean } from './clean.ts';
import { compileWithFiles, type ScriptInput } from './compile.ts';
import { type FileWatcher, watchFiles } from './watch.ts';

export interface InjectOptions {
  /** Process id to attach to. Use either `pid` or `name`. */
  pid?: number;
  /** Process name to attach to, for example `notepad.exe`. Use either `pid` or `name`. */
  name?: string;
  /** Frida device the process runs on. Defaults to the local machine. */
  device?: Device;
  /** Scripts to inject, loaded one after another. Each entry becomes its own Frida script. */
  scripts?: ScriptInput[];
  /**
   * Directory that relative script paths and package names are resolved from.
   * Defaults to the directory of the file that calls `inject()`.
   */
  cwd?: string;
  /**
   * If the process is not running yet, look again every `waitDelay` milliseconds
   * until it shows up. Only works together with `name`. `0` (default) fails right away.
   */
  waitDelay?: number;
  /** Abort waiting for the process and anything else that is still in progress. */
  signal?: AbortSignal;
  /** JavaScript engine used inside the target process. Defaults to Frida's default (QuickJS). */
  runtime?: ScriptRuntime;
  /**
   * Keep an eye on the script files and everything they import. When one of
   * them changes, the script is rebuilt, the old version is unloaded and the
   * new one is loaded. Defaults to `false`.
   */
  watch?: boolean;
  /** Embed source maps so stack traces point at your original files. Defaults to `true`. */
  sourcemap?: boolean;
  /** Extra esbuild options for bundling your scripts. */
  esbuild?: BuildOptions;
  /** Remove Frida's leftover helper processes and temp folders after injecting. Defaults to `true`. */
  clean?: boolean;
  /** Unload the scripts and detach when your program receives Ctrl+C or SIGTERM. Defaults to `true`. */
  handleSignals?: boolean;
  /** Print what is going on to the console. Defaults to `false`. */
  debug?: boolean;

  /** Called once the process is attached, before any script is loaded. */
  onAttach?: (session: Session) => void;
  /** Called when the connection to the process ends, for whatever reason. */
  onDetach?: (session: Session, reason: SessionDetachReason, crash: Crash | null) => void;
  /** Called after a script was loaded into the process. */
  onLoad?: (script: Script) => void;
  /** Called right before a script is unloaded by this library. */
  onUnload?: (script: Script) => void;
  /**
   * Called in watch mode when a changed script cannot be rebuilt or loaded.
   * The previous version keeps running. Without this callback the error is printed.
   */
  onReloadError?: (error: unknown) => void;
  /** Called for every message a script sends with `send()` and for uncaught errors. */
  onMessage?: (message: Message, data: Buffer | null, script: Script) => void;
}

/** A running injection, returned by {@link inject}. */
export interface Injection {
  /** The Frida session attached to the process. */
  session: Session;
  /**
   * The loaded Frida scripts, in the order of the `scripts` option.
   * In watch mode a reloaded script takes the place of its previous version.
   */
  scripts: Script[];
  /** Unloads all scripts and stops watching, but stays attached. */
  unload(): Promise<void>;
  /** Unloads all scripts and detaches from the process. */
  detach(): Promise<void>;
}

const EXIT_SIGNALS = ['SIGINT', 'SIGTERM'] as const;

function isProcessNotFound(error: unknown): boolean {
  return error instanceof Error && /process not found|unable to find process/i.test(error.message);
}

async function attach(device: Device, options: InjectOptions, log: (...args: unknown[]) => void): Promise<Session> {
  const target = options.pid ?? (options.name as string);
  const waitDelay = options.name !== undefined ? (options.waitDelay ?? 0) : 0;
  let notified = false;

  for (;;) {
    options.signal?.throwIfAborted();
    try {
      return await device.attach(target);
    } catch (error) {
      if (waitDelay <= 0 || !isProcessNotFound(error)) throw error;
      if (!notified) {
        log(`[*] Process "${options.name}" not found. Retrying every ${waitDelay / 1000} seconds...`);
        notified = true;
      }
      await sleep(waitDelay, undefined, { signal: options.signal });
    }
  }
}

/**
 * Attaches to a process, bundles the given scripts and loads them into it.
 *
 * Resolves once every script is loaded. Rejects if the process cannot be
 * attached or a script fails to compile. Errors thrown inside the target
 * process do not reject, they arrive as messages (see `onMessage`).
 */
export async function inject(options: InjectOptions = {}): Promise<Injection> {
  // Has to happen before the first `await`, afterwards the caller is gone from the stack.
  const cwd = options.cwd ?? callerDir();

  if (options.pid !== undefined && options.name !== undefined) {
    throw new Error('Use either "pid" or "name", but not both.');
  }
  if (options.pid === undefined && options.name === undefined) {
    throw new Error('Missing target: set either "pid" or "name".');
  }

  const log = (...args: unknown[]): void => {
    if (options.debug) console.log(...args);
  };

  const device = options.device ?? (await getLocalDevice());

  log(options.pid !== undefined ? `[*] Attaching to PID: ${options.pid}` : `[*] Attaching to process: ${options.name}`);
  const session = await attach(device, options, log);

  const scripts: Script[] = [];
  const watchers: FileWatcher[] = [];
  let removeSignalHandlers = (): void => {};

  const stopWatching = (): void => {
    for (const watcher of watchers.splice(0)) watcher.close();
  };

  const unloadScript = async (script: Script): Promise<void> => {
    if (script.isDestroyed) return;
    options.onUnload?.(script);
    await script.unload().catch(() => {});
    log('[*] Frida script unloaded');
  };

  const unload = async (): Promise<void> => {
    stopWatching();
    for (const script of scripts.splice(0).reverse()) await unloadScript(script);
  };

  /** Builds one entry of `scripts` and loads it, replacing `previous` if there is one. */
  const load = async (input: ScriptInput, previous?: Script): Promise<{ script?: Script; files: string[] }> => {
    log('[*] Compiling script');
    const { source, files } = await compileWithFiles(input, {
      cwd,
      sourcemap: options.sourcemap,
      esbuild: options.esbuild,
    });

    let script: Script | undefined;
    if (source.trim() !== '') {
      log('[*] Creating frida script');
      const created = await session.createScript(source, options.runtime ? { runtime: options.runtime } : {});
      created.message.connect((message, data) => {
        if (options.onMessage) options.onMessage(message, data, created);
        else if (message.type === 'error') console.error(message.stack ?? message.description);
      });
      script = created;
    }

    // Only now, with the new version ready, take the old one out. Frida undoes its hooks on unload.
    if (previous) {
      await unloadScript(previous);
      const index = scripts.indexOf(previous);
      if (index !== -1) scripts.splice(index, 1, ...(script ? [script] : []));
      else if (script) scripts.push(script);
    } else if (script) {
      scripts.push(script);
    }

    if (script) {
      log('[*] Loading frida script');
      await script.load();
      options.onLoad?.(script);
      log('[*] Frida script loaded');
    }

    return { script, files };
  };

  /** Reloads one entry of `scripts` whenever one of its files changes. */
  const watch = (input: ScriptInput, first: { script?: Script; files: string[] }): void => {
    let current = first.script;
    let busy = false;
    let again = false;

    const reload = async (): Promise<void> => {
      if (busy) {
        again = true;
        return;
      }
      busy = true;
      try {
        do {
          again = false;
          if (session.isDetached()) return;
          log('[*] Change detected, reloading script');
          try {
            const next = await load(input, current);
            current = next.script;
            watcher.update(next.files);
          } catch (error) {
            if (options.onReloadError) options.onReloadError(error);
            else console.error(error instanceof Error ? error.message : error);
          }
        } while (again);
      } finally {
        busy = false;
      }
    };

    const watcher = watchFiles(() => void reload());
    watcher.update(first.files);
    watchers.push(watcher);
  };

  const detach = async (): Promise<void> => {
    await unload();
    if (!session.isDetached()) await session.detach();
  };

  session.detached.connect((reason, crash) => {
    removeSignalHandlers();
    stopWatching();
    log(`[*] Detached from process (reason=${reason})`);
    options.onDetach?.(session, reason, crash);
  });

  if (options.handleSignals ?? true) {
    const handlers = EXIT_SIGNALS.map((signal) => {
      const handler = (): void => {
        // Clean up, then let the signal do what it would have done without us.
        void detach()
          .catch(() => {})
          .finally(() => {
            removeSignalHandlers();
            process.kill(process.pid, signal);
          });
      };
      process.once(signal, handler);
      return [signal, handler] as const;
    });
    removeSignalHandlers = () => {
      for (const [signal, handler] of handlers) process.off(signal, handler);
    };
  }

  log('[*] Attached to process');

  try {
    options.onAttach?.(session);

    for (const input of options.scripts ?? []) {
      options.signal?.throwIfAborted();
      const loaded = await load(input);
      if (options.watch) watch(input, loaded);
    }
  } catch (error) {
    await detach().catch(() => {});
    throw error;
  }

  if (options.clean ?? true) {
    log('[*] Cleaning up Frida leftovers');
    await clean();
  }

  return { session, scripts, unload, detach };
}
