import fs from 'node:fs';
import path from 'node:path';

export interface FileWatcher {
  /** Replaces the set of watched files. */
  update(files: string[]): void;
  /** Stops watching. */
  close(): void;
}

/**
 * Calls `onChange` shortly after any of the watched files was changed.
 *
 * It watches the folders the files are in rather than the files themselves.
 * Many editors save by writing a new file and renaming it over the old one,
 * and a watcher on the old file would never hear about that.
 */
export function watchFiles(onChange: () => void, delay = 100): FileWatcher {
  const watchers = new Map<string, fs.FSWatcher>();
  let watched = new Set<string>();
  let timer: NodeJS.Timeout | undefined;

  const trigger = (): void => {
    // Saving one file often fires several events in a row. Wait until they stop.
    clearTimeout(timer);
    timer = setTimeout(onChange, delay);
  };

  return {
    update(files) {
      watched = new Set(files.map((file) => path.resolve(file)));
      const dirs = new Set([...watched].map((file) => path.dirname(file)));

      for (const [dir, watcher] of watchers) {
        if (dirs.has(dir)) continue;
        watcher.close();
        watchers.delete(dir);
      }

      for (const dir of dirs) {
        if (watchers.has(dir)) continue;
        try {
          const watcher = fs.watch(dir, (_event, filename) => {
            // Some platforms do not say which file changed. Then assume it was one of ours.
            if (filename === null || watched.has(path.join(dir, filename))) trigger();
          });
          watcher.on('error', () => {});
          watchers.set(dir, watcher);
        } catch {
          // The folder is gone. The next successful build will bring the right folders back.
        }
      }
    },
    close() {
      clearTimeout(timer);
      for (const watcher of watchers.values()) watcher.close();
      watchers.clear();
    },
  };
}
