const Frida = require('frida')
const compiler = require('./compiler')
const debloat = require('./debloat')

async function FridaInject(options = {}) {
  options.clean = options.clean !== undefined ? options.clean : true
  options.debug = options.debug !== undefined ? options.debug : false
  options.device = options.device || await Frida.getLocalDevice()
  options.pid = options.pid
  options.name = options.name
  options.waitDelay = options.waitDelay || 0
  options.scripts = options.scripts || []

  if (options.pid && options.name) throw new Error('Use either pid OR name, but not both!')
  
  function debugLog(...args) {
    if (options.debug) console.log(...args)
  }

  function unloadFridaScript(fridaScript) {
    debugLog('[*] Frida script unloaded')
    options.onUnload && options.onUnload(fridaScript)
    fridaScript.unload()
  }

  if (options.pid)
    debugLog('[*] Attaching to PID:', options.pid)
  else if (options.name)
    debugLog('[*] Attaching to process:', options.name)
  else throw new Error('Missing pid/name option!')
  
  let session
  try {
    session = await options.device.attach(options.pid || options.name)
    session.detached.connect(reason => {
      debugLog(`[*] Detached from process (reason=${reason})`)
      options.onDetach && options.onDetach(session, reason)
    })
  }
  catch(e) {
    if (e.message === 'Process not found' && options.name && options.waitDelay > 0) {
      if (!options.$waitNotified) {
        console.log('Process', options.name, 'not found. Retrying every', (options.waitDelay / 1000).toFixed(6).slice(0, -5), 'seconds...')
        options.$waitNotified = true
      }

      setTimeout(() => {
        FridaInject(options)
      }, options.waitDelay)
      return
    }

    console.error(e)
    process.exit(1)
  }

  debugLog('[*] Attached to process')
  options.onAttach && options.onAttach(session)


  for (let i=0; i<options.scripts.length; i++) {
    debugLog('[*] Compiling script')
    const source = await compiler.compile(options.scripts[i])
    // console.log(source)
    
    debugLog('[*] Creating frida script')
    const fridaScript = await session.createScript(source)
    fridaScript.message.connect(message => {
      if (message.type === 'error') console.error(message.stack)
    })

    debugLog('[*] Loading frida script')
    await fridaScript.load()
    options.onLoad && options.onLoad(fridaScript)

    debugLog('[*] Frida script loaded')
    
    process.on('SIGTERM', () => unloadFridaScript(fridaScript))
    process.on('SIGINT', () => unloadFridaScript(fridaScript))
  }

  debugLog('[*] Cleaning bloat')
  if (options.clean) debloat()
}

module.exports = FridaInject
