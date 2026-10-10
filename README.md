# frida-inject

Run your own JavaScript or TypeScript inside another running program, from the command line or from a few lines of Node.js.

`frida-inject` is a small wrapper around [Frida](https://frida.re). You tell it which process you mean and which scripts you want in there. It attaches to the process, bundles your scripts together with everything they import, loads them, and cleans up after itself.

Use it from the command line:

```bash
frida-inject -n notepad.exe agent.ts
```

Or as a library in your own Node.js program:

```js
import inject from 'frida-inject';

await inject({
  name: 'notepad.exe',
  scripts: ['console.log("Hello from inside Notepad!")'],
});
```

## Contents

- [What you get](#what-you-get)
- [Install](#install)
- [Command line](#command-line)
- [Your first injection](#your-first-injection)
- [How scripts are found](#how-scripts-are-found)
- [Talking to your script](#talking-to-your-script)
- [Options](#options)
- [What `inject()` returns](#what-inject-returns)
- [Recipes](#recipes)
- [Troubleshooting](#troubleshooting)
- [Upgrading from 0.x](#upgrading-from-0x)
- [Working on this project](#working-on-this-project)

## What you get

- **A command line tool and a library.** Same features either way.
- **No build step.** Point at a `.js` or `.ts` file and it is bundled on the fly with [esbuild](https://esbuild.github.io). `import`, npm packages and TypeScript all work.
- **Reload on save.** In watch mode, saving a script swaps the running version for the new one.
- **Wait for the process.** If the program is not running yet, `frida-inject` can keep looking until it starts.
- **Tidy by default.** Scripts are unloaded when you press Ctrl+C, and the helper processes and temp folders Frida leaves behind are removed.
- **Typed.** Every option shows up in your editor's autocomplete.

## Install

There are four ways to get it. Pick the one that fits how you want to use it.

| You want | Use |
| --- | --- |
| the command line tool, nothing else installed | [a standalone binary](#standalone-binary) |
| the command line tool, and you have Node.js | [npm, globally](#npm-as-a-command-line-tool) |
| to call it from your own Node.js code | [npm, in your project](#npm-as-a-library) |
| to use it on NixOS or with Nix | [Nix](#nix) |

### Standalone binary

Every [release](https://github.com/freehuntx/frida-inject/releases/latest) comes with a ready-to-run program for each platform. It contains everything it needs, including Node.js and Frida, so there is nothing else to install.

| System | File |
| --- | --- |
| Linux, Intel/AMD | `frida-inject-linux-x64.tar.gz` |
| Linux, ARM | `frida-inject-linux-arm64.tar.gz` |
| macOS, Apple Silicon | `frida-inject-macos-arm64.tar.gz` |
| macOS, Intel | `frida-inject-macos-x64.tar.gz` |
| Windows, Intel/AMD | `frida-inject-windows-x64.zip` |
| Windows, ARM | `frida-inject-windows-arm64.zip` |

**Linux and macOS.** Download, unpack and move it somewhere on your `PATH`. Replace `linux-x64` with your system from the table:

```bash
curl -L https://github.com/freehuntx/frida-inject/releases/latest/download/frida-inject-linux-x64.tar.gz | tar -xz
sudo mv frida-inject /usr/local/bin/
frida-inject --version
```

**Windows.** In PowerShell:

```powershell
curl.exe -LO https://github.com/freehuntx/frida-inject/releases/latest/download/frida-inject-windows-x64.zip
tar -xf frida-inject-windows-x64.zip
.\frida-inject.exe --version
```

Move `frida-inject.exe` to a folder that is on your `PATH` if you want to call it from anywhere.

Good to know:

- The binaries are not signed with a paid developer certificate. If you download with a browser, macOS may refuse to open the file. Allow it with `xattr -d com.apple.quarantine frida-inject`. Windows may show a SmartScreen warning that you can click through with "More info".
- To check a download, compare it with `SHA256SUMS.txt` from the same release: `sha256sum -c SHA256SUMS.txt --ignore-missing` (on macOS: `shasum -a 256 -c SHA256SUMS.txt --ignore-missing`).
- On first start, the binary unpacks two helper files (Frida's native module and the esbuild bundler) into your user cache folder: `~/.cache/frida-inject` on Linux, `~/Library/Caches/frida-inject` on macOS, `%LOCALAPPDATA%\frida-inject` on Windows. Set `FRIDA_INJECT_CACHE` to use a different folder. You can delete it at any time.
- To update, download the new release and replace the file.

### npm, as a command line tool

Needs **Node.js 22.12 or newer**.

```bash
npm install --global frida-inject
frida-inject --version
```

Or run it once without installing: `npx frida-inject -n notepad.exe agent.ts`.

### npm, as a library

Needs **Node.js 22.12 or newer**.

```bash
npm install frida-inject
```

Frida is installed along with the package. Its prebuilt binary is downloaded during `npm install`, so there is nothing to compile.

> [!NOTE]
> npm 11.19 and newer, pnpm and Bun do not run install scripts of dependencies unless you allow it. Allow `frida` and `esbuild`: `npm install-scripts approve frida esbuild` (pnpm: `pnpm approve-builds`). For a global install: `npm install --global --allow-scripts=frida,esbuild frida-inject`.

### Nix

The repository is a [flake](https://nixos.wiki/wiki/Flakes). The package is the standalone binary from the latest GitHub release, so nothing is compiled. Supported systems are `x86_64-linux`, `aarch64-linux`, `x86_64-darwin` and `aarch64-darwin`.

Try it without installing:

```bash
nix run github:freehuntx/frida-inject -- -n firefox agent.ts
```

Install it into your user profile:

```bash
nix profile install github:freehuntx/frida-inject
```

Add it to a NixOS or Home Manager configuration that uses flakes:

```nix
{
  inputs.frida-inject.url = "github:freehuntx/frida-inject";

  outputs = { nixpkgs, frida-inject, ... }: {
    nixosConfigurations.my-machine = nixpkgs.lib.nixosSystem {
      modules = [
        ({ pkgs, ... }: {
          nixpkgs.overlays = [ frida-inject.overlays.default ];
          environment.systemPackages = [ pkgs.frida-inject ];
          # With Home Manager: home.packages = [ pkgs.frida-inject ];
        })
      ];
    };
  };
}
```

Without flakes, clone the repository and run `nix-build`. The program is then at `./result/bin/frida-inject`. To install it: `nix-env -if .`

`nix develop` opens a shell with Node.js and npm for working on the project itself.

## Command line

```
frida-inject [options] [script ...]
```

Say which process, then which scripts. Scripts can be `.js` or `.ts` files, folders or npm packages, and they are bundled with their imports before they are injected. Paths are relative to the folder you are in.

```bash
# Attach by name and inject a file
frida-inject -n notepad.exe agent.ts

# Attach by process id and run a line of code
frida-inject -p 1234 -e 'send(Process.id)'

# Reload the script every time you save it
frida-inject -n notepad.exe --watch agent.ts

# Wait until the program starts, checking once per second
frida-inject -n game.exe -w 1000 agent.ts

# Start a program and inject before its first line runs
frida-inject -f /usr/bin/app agent.js -- --flag-for-the-app

# A phone connected over USB
frida-inject -U -n Twitter hooks.ts
```

Whatever your script passes to `send()` and `console.log()` is printed. `frida-inject` keeps running until the process ends or you press Ctrl+C, which unloads your scripts again.

| Option | What it does |
| --- | --- |
| `-n`, `--name <name>` | Attach to the process with this name. |
| `-p`, `--pid <pid>` | Attach to the process with this id. |
| `-f`, `--spawn <program>` | Start this program and inject before it runs. Arguments for the program go after `--`. |
| `-e`, `--eval <code>` | Code to inject. Can be given more than once. |
| `-U`, `--usb` | Use the device connected over USB. |
| `-H`, `--host <address>` | Use a `frida-server` running on another machine. |
| `--watch` | Reload a script when its file, or a file it imports, changes. See [Reload on save](#reload-on-save). |
| `-w`, `--wait <ms>` | If the process is not running yet, look again every `<ms>` milliseconds. Only with `--name`. |
| `--runtime <qjs\|v8>` | JavaScript engine used inside the target. |
| `--no-sourcemap` | Do not embed source maps. |
| `--no-clean` | Leave Frida's helper processes and temp folders alone. |
| `--debug` | Print every step. |
| `-h`, `--help` | Show the help. |
| `-v`, `--version` | Show the version. |

Exactly one of `--name`, `--pid` and `--spawn` is required. The rest of this document describes the library, which can do everything the command line can and more.

## Your first injection

Two files are involved. One runs in Node.js on your machine and starts the injection. The other one, usually called the *agent*, runs inside the target process.

**`index.mjs`** runs in Node.js:

```js
import inject from 'frida-inject';

await inject({
  name: 'notepad.exe',
  scripts: ['./agent.js'],
  onMessage: (message) => console.log('The agent says:', message.payload),
});

console.log('Injected. Press Ctrl+C to stop.');
```

**`agent.js`** runs inside Notepad:

```js
send(`I am running in process ${Process.id}`);

for (const module of Process.enumerateModules().slice(0, 3)) {
  send(`Loaded module: ${module.name}`);
}
```

Start Notepad, then run `node index.mjs`.

Inside the agent you can use Frida's whole [JavaScript API](https://frida.re/docs/javascript-api/): `Interceptor` to hook functions, `Memory` to read and write memory, `Process`, `Module` and so on.

There are two complete, runnable examples in [`examples/`](examples): one in [plain JavaScript](examples/basic) and one in [TypeScript](examples/typescript).

## How scripts are found

`scripts` is a list. Each entry becomes one Frida script, and they are loaded in order.

| You write | What happens |
| --- | --- |
| `'./agent.js'`, `'./agent.ts'` | That file is bundled, including everything it imports. |
| `'./agent'` | A folder works too. Its `index.js` or `index.ts` is used. |
| `'some-npm-package'` | The package is bundled from your `node_modules`. |
| `'console.log("hi")'` | Anything that is not a file or package is run as code. |
| `{ file: './agent.js' }` | Same as the string, but never mistaken for code. |
| `{ code: 'console.log("hi")' }` | Same as the string, but never mistaken for a file. |
| `['const answer = 42', 'send(answer)']` | An array is merged into **one** script. See below. |

**Relative paths start at the file that calls `inject()`**, exactly like an `import` in that file would. You can change this with the `cwd` option.

Code given as a string can use `import` and TypeScript too:

```js
scripts: [`
  import { describe } from './helpers.js';
  send(describe(Process.mainModule));
`]
```

### Sharing variables between scripts

Normally each entry in `scripts` is isolated from the others. If you put several parts into an inner array, they are merged into a single script. Variables that code parts declare at the top level are then visible to the parts after them:

```js
scripts: [
  ['const GREETING = "hello"', 'send(GREETING)'],
]
```

Files and packages inside such an array stay wrapped in their own scope. To share something from a file, attach it to `globalThis`.

## Talking to your script

**From the agent to Node.js**, call `send()` in the agent and listen with `onMessage`:

```js
await inject({
  name: 'notepad.exe',
  scripts: ['send({ pid: Process.id })'],
  onMessage: (message) => {
    if (message.type === 'send') console.log(message.payload); // { pid: 1234 }
    if (message.type === 'error') console.error(message.stack);
  },
});
```

If you do not set `onMessage`, uncaught errors from the agent are printed with `console.error` so they do not go unnoticed.

**From Node.js to the agent**, export functions in the agent and call them through the script object:

```js
// agent.js
rpc.exports = {
  add: (a, b) => a + b,
};
```

```js
// index.mjs
const { scripts } = await inject({ name: 'notepad.exe', scripts: ['./agent.js'] });
console.log(await scripts[0].exports.add(2, 3)); // 5
```

## Options

Exactly one of `pid` and `name` is required. Everything else is optional.

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `name` | `string` | | Name of the process to attach to, for example `notepad.exe`. |
| `pid` | `number` | | Process id to attach to. |
| `scripts` | `ScriptInput[]` | `[]` | What to inject. See [How scripts are found](#how-scripts-are-found). |
| `device` | `frida.Device` | local machine | Where the process runs. Use this for phones and remote machines. |
| `cwd` | `string` | folder of the calling file | Where relative paths and package names are looked up. |
| `watch` | `boolean` | `false` | Reload a script when its file, or a file it imports, changes. See [Reload on save](#reload-on-save). |
| `waitDelay` | `number` | `0` | If the process is not found, look again every this many milliseconds. Only with `name`. `0` gives up immediately. |
| `signal` | `AbortSignal` | | Lets you cancel, for example to stop waiting for a process. |
| `runtime` | `frida.ScriptRuntime` | Frida's default (QuickJS) | JavaScript engine used inside the target. |
| `sourcemap` | `boolean` | `true` | Makes error stack traces point at your original files. |
| `esbuild` | `esbuild.BuildOptions` | | Extra [esbuild options](https://esbuild.github.io/api/#build) for bundling your scripts. |
| `clean` | `boolean` | `true` | Remove Frida's leftover helper processes and temp folders afterwards. |
| `handleSignals` | `boolean` | `true` | Unload and detach when your program gets Ctrl+C or `SIGTERM`. |
| `debug` | `boolean` | `false` | Print each step to the console. |

### Callbacks

| Callback | Called |
| --- | --- |
| `onAttach(session)` | once attached, before any script is loaded |
| `onLoad(script)` | after each script was loaded |
| `onMessage(message, data, script)` | for every `send()` from the agent and for uncaught errors |
| `onUnload(script)` | right before a script is unloaded by `frida-inject` |
| `onReloadError(error)` | in watch mode, when a changed script cannot be rebuilt or loaded |
| `onDetach(session, reason, crash)` | when the connection ends, whether you asked for it or the process quit |

## What `inject()` returns

`inject()` returns a promise. It resolves once all scripts are loaded, and rejects if the process cannot be attached or a script cannot be bundled.

```js
const injection = await inject({ ... });

injection.session;        // the frida.Session
injection.scripts;        // the loaded frida.Script objects, in order
await injection.unload(); // unload all scripts, stay attached
await injection.detach(); // unload all scripts and detach
```

Errors that happen *inside* the target process, such as an exception in your agent, do not reject the promise. They arrive as messages of type `error`.

The package also exports two helpers you can use on their own:

- `compile(script, options?)` bundles a script and returns the resulting JavaScript as a string, without injecting anything.
- `compileWithFiles(script, options?)` does the same and also returns the list of files the script was made from.
- `clean()` removes Frida's leftovers on the local machine.

## Recipes

### Reload on save

While you are working on an agent, turn on watch mode. Every time you save the script, or any file it imports, it is rebuilt and swapped in. The target process keeps running the whole time.

```bash
frida-inject -n notepad.exe --watch agent.ts
```

```js
await inject({
  name: 'notepad.exe',
  watch: true,
  scripts: ['./agent.ts'],
  onLoad: () => console.log('Agent loaded'),
});
```

What to expect:

- The old version is unloaded before the new one is loaded. Frida removes its hooks (`Interceptor.attach` and friends) on unload, so they do not pile up.
- The script starts from scratch. Variables from the previous version are gone. Changes your agent made to the process itself, such as memory it has written, stay.
- If the new version has a mistake and cannot be built, the error is shown and the previous version keeps running. Fix the file and save again.
- Only your own files are watched, not packages in `node_modules`. Code given as a string has no file to watch, but files it imports are watched.
- With several entries in `scripts`, only the entry whose files changed is reloaded.

### Wait until the program starts

```js
await inject({
  name: 'game.exe',
  waitDelay: 1000, // look once per second
  scripts: ['./agent.js'],
});
```

To give up after a while, pass a signal: `signal: AbortSignal.timeout(60_000)`.

### Write the agent in TypeScript

Nothing to set up for bundling, `.ts` files just work. For autocomplete on Frida's API inside the agent, install its types:

```bash
npm install --save-dev @types/frida-gum
```

esbuild removes type annotations but does not check them. Run `tsc --noEmit` if you want type errors reported.

### Hook Java, Objective-C or Swift

Since Frida 17, the `Java`, `ObjC` and `Swift` bridges are no longer built into Frida. Install the one you need and import it in your agent. It gets bundled like any other package:

```bash
npm install frida-java-bridge
```

```js
// agent.js
import Java from 'frida-java-bridge';

Java.perform(() => {
  const Activity = Java.use('android.app.Activity');
  // ...
});
```

The others are called `frida-objc-bridge` and `frida-swift-bridge`.

### Inject into an app on a phone

Pass a `device`. Here the app is also started by Frida, so the script is in place before the app runs its first line:

```js
import frida from 'frida';
import inject from 'frida-inject';

const device = await frida.getUsbDevice();
const pid = await device.spawn('com.example.app');

await inject({ device, pid, scripts: ['./agent.js'] });
await device.resume(pid);
```

### Change how scripts are bundled

Anything you put in `esbuild` is passed on and overrides the defaults:

```js
await inject({
  name: 'notepad.exe',
  scripts: ['./agent.js'],
  esbuild: {
    minify: true,
    define: { DEBUG: 'false' },
  },
});
```

The defaults are `bundle: true`, `platform: 'neutral'` and `target: 'es2022'`.

## Troubleshooting

**"Process not found"**
The name has to match what the system reports, including `.exe` on Windows. Check with Task Manager, `ps`, or `frida-ps` from [frida-tools](https://frida.re/docs/installation/). If the program starts later, use `waitDelay`.

**"Permission denied" or attaching fails on Linux**
Many distributions only let a process be inspected by its parent. Run your script as root, or relax the rule until the next reboot with `sudo sysctl kernel.yama.ptrace_scope=0`. On Windows, a program running as administrator can only be attached to from an administrator terminal. On macOS, System Integrity Protection blocks attaching to Apple's own apps.

**Attaching to a process that Node.js itself started hangs (Linux)**
A process started with `child_process.spawn()` belongs to Node.js, and Node.js and Frida then get in each other's way while Frida tries to attach. Let Frida start it instead with `device.spawn()` (see the phone recipe above), or start it from somewhere else.

**"Script file not found"**
Relative paths start at the file that calls `inject()`. If you call it through a helper of your own, set `cwd` explicitly.

**`Could not resolve "fs"` (or `path`, `net`, ...)**
The agent does not run in Node.js, so Node's built-in modules do not exist there. Use Frida's own API (`File`, `Socket`, ...) or a package such as `frida-fs`.

**`Java`, `ObjC` or `Swift` is not defined**
See [Hook Java, Objective-C or Swift](#hook-java-objective-c-or-swift).

**My program does not exit**
An open Frida session keeps Node.js running. Call `await injection.detach()` when you are done, or `process.exit()`.

## Upgrading from 0.x

Version 1.0 is a rewrite on current tooling. Most scripts need only the first two changes.

| 0.x | 1.x |
| --- | --- |
| `const FridaInject = require('frida-inject')` | `import inject from 'frida-inject'`. The package is ESM only, like Frida 17 itself. `require()` still works in Node.js 22.12+, use `require('frida-inject').default`. |
| Any Node.js version | Node.js 22.12+ |
| Errors were printed and the program was ended with `process.exit(1)` | `inject()` rejects. Use `try`/`catch` or `.catch()`. |
| With `waitDelay`, the call returned before the process was found | The promise resolves once the scripts are actually loaded. |
| No return value | Returns `{ session, scripts, unload, detach }`. |
| Scripts were bundled with Browserify and Babel and converted to ES5 | Scripts are bundled with esbuild and target ES2022. TypeScript works without setup. |
| Browserify quietly added stand-ins for Node modules like `buffer` or `events` | They are not added. Install a package that provides them if your agent needs one. |
| Ctrl+C unloaded the scripts but left the program running | Ctrl+C unloads, detaches and then ends the program as usual. Turn off with `handleSignals: false`. |

New options: `cwd`, `signal`, `runtime`, `sourcemap`, `esbuild`, `handleSignals`, `watch`, `onMessage`, `onReloadError`. See [CHANGELOG.md](CHANGELOG.md) for the full list.

## Working on this project

```bash
npm install
npm run build      # bundle the library into dist/ (tsdown)
npm test           # run the tests (Vitest)
npm run lint       # check formatting and lint rules (Biome)
npm run format     # fix what can be fixed automatically
npm run typecheck  # check types (TypeScript)
npm run build:binary  # build the standalone binary for your platform into release/
```

The tests that attach to a real process are skipped unless you ask for them, because they need permission to inspect other processes:

```bash
FRIDA_TEST_ATTACH=1 npm test
```

| Folder | Contents |
| --- | --- |
| `src/cli.ts`, `src/args.ts` | the command line tool and its option parsing |
| `src/inject.ts` | attaching, loading scripts, cleanup on exit |
| `src/compile.ts` | turning files, packages and code strings into one script with esbuild |
| `src/watch.ts` | noticing changed files for watch mode |
| `src/clean.ts` | removing Frida's leftovers |
| `src/caller.ts` | finding out which file called `inject()` |
| `test/` | tests and the small agent they inject |
| `examples/` | runnable examples |
| `scripts/build-binary.mjs` | packs Node.js, the CLI and Frida into one executable |
| `flake.nix`, `package.nix`, `nix/release.json` | the Nix package and the release it downloads |
| `scripts/update-nix-release.mjs` | points the Nix package at a new release |
| `.github/workflows/` | CI (`ci.yml`) and releases (`release.yml`) |

### Making a release

1. Set the new version in `package.json` and describe the changes in `CHANGELOG.md`.
2. Commit, then tag the commit with the same version and push the tag:

   ```bash
   git tag v1.0.0
   git push origin master v1.0.0
   ```

The [release workflow](.github/workflows/release.yml) then builds the binaries for all six platforms and creates the GitHub release with them and a `SHA256SUMS.txt`. Afterwards it writes the new version and the file hashes to `nix/release.json` and pushes that to `master`, so the Nix package picks up the release. If `master` does not accept pushes from the workflow, download `SHA256SUMS.txt` from the release and run `node scripts/update-nix-release.mjs v1.0.0 SHA256SUMS.txt` yourself. Publishing to npm is part of the workflow but switched off until you enable it. The two steps for that are written at the top of the `npm` job in the workflow file.

## License

[MIT](LICENSE.md)
