# frida-inject
With this module, you can easily inject javascript into processes.
This module uses:
- [frida](https://github.com/frida/frida)
- [frida-compile](https://github.com/frida/frida-compile)

## Features
- Clean temp folder from frida trash (Injector files)
- Kill injector processes after injection (Since useless)
- Easy to use!

## Installation

```bash
$ npm install frida-inject
```

## Docu
Class: FridaInject
  - Constructor (target: String|Number, options: Object)
    - // target can be a process name or PID
    - options: Object
      - delay: Number `[default=0]` // Wait specific time before attach
      - wait: Boolean `[default=true]` // Wait for the target
      - waitThreshold: Number `[default=500]` // ms between process check
  - __Methods__
  - instance.load (input: String)
    - // input can be either javascript code, or a js file.
  - __Events__
  - Event: 'error'
    - error \<Error\>
  - Event: 'attach'
    - session \<FridaSession\>
  - Event: 'detach'
    - session \<FridaSession\>
  - Event: 'load'
    - script \<FridaScript\>
  - Event: 'send'
    - payload \<Object\>
    - script \<FridaScript\>
  - Event: 'message'
    - message \<String\>
    - script \<FridaScript\>

## Example

```js
const FridaInject = require('frida-inject')

let notepad = new FridaInject('calc.exe')
  .on('error', err => console.error(err))
  .on('attach', () => {
    console.log('Attached to process')
  })
  .on('detach', () => {
    console.log('Detached from process')
  })
  .on('load', script => {
    console.log('Script loaded')
  })
  .on('send', msg => {
    console.log('Got send:', msg)
  })
  .on('message', msg => {
    console.log('Got message:', JSON.stringify(message))
  })

notepad.load('console.log("This is some basic injected script")') // Inject raw
notepad.load(`${__dirname}/inject`) // Inject source file
```
