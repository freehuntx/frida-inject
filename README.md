# frida-inject
With this module, you can easily inject javascript into processes.


## Features
- Bundle & Transpile injected scripts (no frida-compile needed)
- Clean frida bloat (tmp folder & injector process)
- Retry if process not found
- Easy to use!

## Installation

```bash
$ npm install frida-inject
```

## Documentation
FridaInject (options): Function
  - options: Object
    - clean: Boolean `[default=true]`
    - debug: Boolean `[default=false]`
    - device: FridaDevice `[default=localDevice]`
    - pid: Number // Process id
    - name: String // Process name
    - scripts: Array\< String|Array\<String\> \> `[default=[]]`
    - waitDelay: Number `[default=0]` (ms to wait before retrying injection|0=off)
    - onAttach: Function\<session\>
    - onDetach: Function\<session, reason\>
    - onLoad: Function\<script\>
    - onUnload: Function\<script\>

## Example
#### Simple injection
```js
const FridaInject = require('frida-inject')

FridaInject({
  name: 'notepad++.exe',
  scripts: [
    'console.log("This is some basic injected script")',
    './some_folder'
  ],
  onAttach: session => console.log('Attached to process'),
  onDetach: (session, reason) => console.log('Detached from process'),
  onLoad: script => console.log('Script loaded'),
  onUnload: script => console.log('Script unloaded')
})
```

#### Simple injection (Bundled scripts)
Since version 0.3.0 you can provide multiple scripts into one script.  
This will allow you to share a global scope.
```js
const FridaInject = require('frida-inject')

FridaInject({
  name: 'notepad++.exe',
  scripts: [
    ['frida-ex-nativefunction', 'console.log(ExNativeFunction)']
  ]
})
```

#### Advanced injection (provided device)
```js
const Frida = require('frida')
const FridaInject = require('frida-inject')

async function main() {
  const device = await Frida.getUsbDevice()
  const pid = await device.spawn('com.atebits.Tweetie2', {
    url: 'twitter://user?screen_name=fridadotre',
    env: {
      'OS_ACTIVITY_DT_MODE': 'YES',
      'NSUnbufferedIO': 'YES'
    },
    stdio: 'pipe'
  })

  FridaInject({
    device: device,
    pid: pid,
    scripts: [
      'console.log("This is some basic injected script")',
      './inject'
    ],
    onAttach: session => console.log('Attached to process'),
    onDetach: (session, reason) => console.log('Detached from process'),
    onLoad: script => console.log('Script loaded'),
    onUnload: script => console.log('Script unloaded')
  })
}
main()
```

## TODO
- Implement better clean logic
