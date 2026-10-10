// This file runs inside the target process.
// Types for `Process`, `rpc`, `Interceptor`, ... come from the `@types/frida-gum` package.

rpc.exports = {
  listModules(): string[] {
    return Process.enumerateModules().map((module) => module.name);
  },
};
