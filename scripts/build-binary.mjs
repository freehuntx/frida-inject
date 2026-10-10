// Builds a standalone `frida-inject` executable for the current platform.
//
// The result is a copy of Node.js with the CLI, Frida's native module and the
// esbuild binary packed into it (a Node.js "single executable application").
// Nothing has to be installed to run it.
//
// Usage: npm run build:binary
// Output: release/frida-inject-<os>-<arch>.tar.gz (.zip on Windows)

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

const root = path.dirname(import.meta.dirname);
const require = createRequire(import.meta.url);
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const os = { win32: 'windows', darwin: 'macos' }[process.platform] ?? process.platform;
const name = `frida-inject-${os}-${process.arch}`;

const workDir = path.join(root, 'build', 'binary');
const outDir = path.join(root, 'release');
fs.rmSync(workDir, { recursive: true, force: true });
fs.mkdirSync(workDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

const run = (command, args, options = {}) => execFileSync(command, args, { stdio: 'inherit', ...options });

// 1. The two native files that cannot live inside a JavaScript bundle.
const fridaBinding = path.join(path.dirname(require.resolve('frida')), '..', 'frida_binding.node');
const esbuildRequire = createRequire(require.resolve('esbuild'));
const esbuildBinary = esbuildRequire.resolve(
  `@esbuild/${process.platform}-${process.arch}/${isWindows ? 'esbuild.exe' : 'bin/esbuild'}`,
);
const assets = {
  'frida_binding.node': fridaBinding,
  [isWindows ? 'esbuild.exe' : 'esbuild']: esbuildBinary,
};

// Unpacked files are stored per build, so different versions never mix.
const hash = createHash('sha256');
for (const file of Object.values(assets)) hash.update(fs.readFileSync(file));
const buildId = `${pkg.version}-${hash.digest('hex').slice(0, 12)}`;

// 2. One JavaScript file with the CLI and all of its dependencies.
//    On first start, `bootstrap` unpacks the native files to a cache folder.
const bootstrap = `
(() => {
  const sea = require('node:sea');
  if (!sea.isSea()) return;
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');

  const home = os.homedir();
  const base =
    process.env.FRIDA_INJECT_CACHE ||
    (process.platform === 'win32'
      ? process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local')
      : process.platform === 'darwin'
        ? path.join(home, 'Library', 'Caches')
        : process.env.XDG_CACHE_HOME || path.join(home, '.cache'));
  const dir = path.join(base, 'frida-inject', ${JSON.stringify(buildId)});

  const unpack = (asset) => {
    const target = path.join(dir, asset);
    if (!fs.existsSync(target)) {
      fs.mkdirSync(dir, { recursive: true });
      const partial = target + '.' + process.pid + '.tmp';
      fs.writeFileSync(partial, Buffer.from(sea.getAsset(asset)), { mode: 0o755 });
      fs.renameSync(partial, target);
    }
    return target;
  };

  globalThis.__fridaInjectBinding = unpack('frida_binding.node');
  process.env.ESBUILD_BINARY_PATH = unpack(${JSON.stringify(isWindows ? 'esbuild.exe' : 'esbuild')});
})();
`;

const bundle = path.join(workDir, 'cli.cjs');
await build({
  entryPoints: [path.join(root, 'dist', 'cli.mjs')],
  outfile: bundle,
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node22',
  banner: { js: bootstrap },
  define: { 'import.meta.dirname': '__dirname' },
  logLevel: 'warning',
  plugins: [
    {
      // Frida finds its native module with the "bindings" package, which searches
      // node_modules. There is no node_modules here, so load the unpacked file instead.
      name: 'frida-binding',
      setup(build) {
        build.onResolve({ filter: /^bindings$/ }, () => ({ path: 'bindings', namespace: 'frida-binding' }));
        build.onLoad({ filter: /.*/, namespace: 'frida-binding' }, () => ({
          contents: `module.exports = () => {
            const loaded = { exports: {} };
            process.dlopen(loaded, globalThis.__fridaInjectBinding);
            return loaded.exports;
          };`,
        }));
      },
    },
  ],
});

// 3. Pack the bundle and the native files into a blob and put it into a copy of Node.js.
const blob = path.join(workDir, 'sea.blob');
const config = path.join(workDir, 'sea-config.json');
fs.writeFileSync(
  config,
  JSON.stringify({ main: bundle, output: blob, disableExperimentalSEAWarning: true, assets }, null, 2),
);
run(process.execPath, ['--experimental-sea-config', config]);

const exeName = isWindows ? 'frida-inject.exe' : 'frida-inject';
const exe = path.join(workDir, exeName);
fs.copyFileSync(process.execPath, exe);
fs.chmodSync(exe, 0o755);

// macOS refuses to run a binary whose signature no longer matches, so drop it and sign again below.
if (isMac) run('codesign', ['--remove-signature', exe]);

run(process.execPath, [
  require.resolve('postject/dist/cli.js'),
  exe,
  'NODE_SEA_BLOB',
  blob,
  '--sentinel-fuse',
  'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
  ...(isMac ? ['--macho-segment-name', 'NODE_SEA'] : []),
]);

if (isMac) run('codesign', ['--sign', '-', exe]);

// 4. Make sure it starts, then wrap it up for the release page.
const version = execFileSync(exe, ['--version'], { encoding: 'utf8' }).trim();
if (version !== pkg.version) throw new Error(`Binary reports version "${version}", expected "${pkg.version}"`);

fs.copyFileSync(path.join(root, 'LICENSE.md'), path.join(workDir, 'LICENSE.md'));
const archive = path.join(outDir, `${name}${isWindows ? '.zip' : '.tar.gz'}`);
fs.rmSync(archive, { force: true });
// "-a" picks the format from the file name. On Windows, use the system's own tar:
// the one that comes with Git cannot write zip files.
const tar = isWindows ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
run(tar, ['-a', '-cf', archive, exeName, 'LICENSE.md'], { cwd: workDir });

console.log(`\nBuilt ${path.relative(root, archive)} (${(fs.statSync(archive).size / 1e6).toFixed(1)} MB)`);
