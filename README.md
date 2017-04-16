# frida-inject
With this module, you can easily inject javascript into processes.
This module uses:
- [frida](https://github.com/frida/frida)
- [frida-load](https://github.com/frida/frida-load)

## Features
- Clean temp folder from frida trash (Injector files)
- Kill injector processes after injection (Since useless)
- Easy to use!

## Example

```js
FridaInject('Target.exe', require.resolve('frida-inject'), {
  onAttach: function(session) {
    console.log('Attached to process');
  },
  onDetach: function(session) {
    console.log('Detached from process');
  },
  onScriptCreate: function(script) {
    console.log('Script created');
  },
  onLoad: function(script) {
    console.log('Script loaded');
  },
  onMessage: function(message, script) {
    console.log('Got message: ' + JSON.stringify(message));
  },
  onSend: function(payload, script) {
    console.log('Got send: ' + payload);
  },
  onError: function(error) {
    console.error(error);
  }
});
```

## Installation

```bash
$ npm install frida-inject
```
