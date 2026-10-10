// Usage: node examples/basic/index.mjs <process name>
import inject from 'frida-inject';

const name = process.argv[2] ?? 'notepad.exe';

await inject({
  name,
  // Keep looking once per second until the process is running.
  waitDelay: 1000,
  scripts: [
    // A line of code ...
    'console.log("Hello from inside process " + Process.id)',
    // ... or a folder / file next to this one. Its imports are bundled automatically.
    './agent',
  ],
  onAttach: () => console.log(`Attached to ${name}`),
  onLoad: () => console.log('Script loaded'),
  onMessage: (message) => console.log('Message from the process:', message),
  onDetach: (_session, reason) => console.log(`Detached (${reason})`),
});

console.log('Running. Press Ctrl+C to unload the scripts and quit.');
