# Changelog

## 1.0.0

A rewrite on current tooling. See [Upgrading from 0.x](README.md#upgrading-from-0x) for what to change in your code.

### Breaking

- The package is ESM only and needs Node.js 22.12 or newer.
- `inject()` rejects on failure instead of printing the error and calling `process.exit(1)`.
- With `waitDelay`, the returned promise now resolves once the scripts are loaded, not before the process is found.
- Scripts are bundled with esbuild instead of Browserify and Babel. The output targets ES2022 instead of ES5, and stand-ins for Node.js built-in modules are no longer added.
- On Ctrl+C or `SIGTERM` the scripts are unloaded, the session is detached, and the program then ends as it normally would. Before, the program kept running.
- `onUnload` is called before a script is unloaded by the library, in reverse load order.

### Added

- A command line tool: `frida-inject -n notepad.exe agent.ts`.
- Standalone binaries for Linux, macOS and Windows on every GitHub release.
- A Nix flake (`nix run github:freehuntx/frida-inject`) that installs the standalone binary from the GitHub release.
- Watch mode: `--watch` on the command line, `watch: true` in the library. A script is rebuilt and reloaded when one of its files changes.
- TypeScript agents work without any setup.
- Code strings can use `import` and TypeScript.
- `{ file }` and `{ code }` to say explicitly what a script entry is.
- `inject()` returns `{ session, scripts, unload(), detach() }`.
- Options: `cwd`, `signal`, `runtime`, `sourcemap`, `esbuild`, `handleSignals`, `watch`, `onMessage`, `onReloadError`.
- `onDetach` receives the crash report as a third argument.
- Named exports `inject`, `compile`, `compileWithFiles` and `clean`.
- A missing script file is reported as such instead of being run as code.
- Tests, linting, CI and a release workflow.

### Tooling

- Library build: `tsc` → tsdown
- Agent bundling: Browserify + Babel → esbuild
- Package manager: Yarn 1 → npm
- Lint and format: Biome
- Tests: Vitest
- Frida 17, TypeScript 7
