// Usage: node examples/typescript/index.ts <pid>
// Node.js 22.18+ runs TypeScript files directly. On older versions use `npx tsx`.
import { inject } from 'frida-inject';

const pid = Number(process.argv[2]);
if (!Number.isInteger(pid)) {
  console.error('Usage: node examples/typescript/index.ts <pid>');
  process.exit(1);
}

const injection = await inject({
  pid,
  scripts: ['./agent/index.ts'],
  onDetach: (_session, reason) => console.log(`Detached (${reason})`),
});

// The agent exposes functions through `rpc.exports`. Call them from here:
const [script] = injection.scripts;
const modules = (await script?.exports.listModules?.()) as string[];
console.log(`The process has ${modules.length} modules loaded. The first five:`);
console.log(modules.slice(0, 5).join('\n'));

await injection.detach();
process.exit(0);
