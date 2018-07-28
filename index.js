const Babel = require('babel-core')
const Babelify = require('babelify')
const Browserify = require('browserify')
const Frida = require('frida')
const fs = require('fs')
const os = require('os')
const path = require('path')
const parentDir = path.dirname(module.parent.filename)

const babelConfig = {
  presets: ['env'],
  plugins: ['transform-object-rest-spread']
}

// Used for temp folder cleanup
function recursiveDelete(path) {
  try {
    if (fs.existsSync(path)) {
      fs.readdirSync(path).forEach(file => {
        let curPath = `${path}/${file}`

        if (fs.lstatSync(curPath).isDirectory())
          recursiveDelete(curPath)
        else
          fs.unlinkSync(curPath)
      })

      fs.rmdirSync(path);
    }
  } catch(e) {}
}

async function cleanBloat() {
    // First lets remove all injectors currently running
    let localDevice = await Frida.getLocalDevice()
    let processes = await localDevice.enumerateProcesses()

    for (let process of processes) {
      if (!process.name.startsWith('frida-winjector')) continue

      localDevice.kill(process.pid) // We dont want injectors anymore!
    }

    // Now lets clean our temp folder for old injector files
    let tmpDir = os.tmpdir()
    fs.readdirSync(tmpDir).filter(e => e.startsWith('frida-')).forEach(folder => {
      recursiveDelete(`${tmpDir}/${folder}`)
    })
}

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

  function transpile(source) {
    return Babel.transform(source, babelConfig).code
  }

  function bundle(file) {
    return new Promise((resolve, reject) => {
      Browserify()
        .require(file, { entry: true })
        .transform(Babelify.configure(babelConfig))
        .bundle((err, buf) => {
          if (err) reject(err)
          else resolve(buf.toString())
        })
    })
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
    const script = options.scripts[i]
    let source

    try {
      const moduleFile = require.resolve(path.resolve(parentDir, script))
      debugLog('[*] Bundling module:', moduleFile)
      source = await bundle(moduleFile)
    }
    catch(e) {
      source = script
    }

    debugLog('[*] Transpiling script')
    source = transpile(source)
    
    debugLog('[*] Creating frida script')
    const fridaScript = await session.createScript(source)

    debugLog('[*] Loading frida script')
    options.onLoad && options.onLoad(fridaScript)
    await fridaScript.load()

    debugLog('[*] Frida script loaded\n')
    
    process.on('SIGTERM', () => unloadFridaScript(fridaScript))
    process.on('SIGINT', () => unloadFridaScript(fridaScript))
  }

  debugLog('[*] Cleaning bloat')
  if (options.clean) cleanBloat()
}

module.exports = FridaInject

/*debug: true,
//device: Frida,
//pid: null,
process: 'notepad++.exe',
scripts: [
  'console.log("This is some basic injected script")',
  './inject'
],
onError: err => console.error(err),
onAttach: session => console.log('Attached to process'),
onDetach: session => console.log('Detached from process'),
onLoad: script => console.log('Script loaded'),
onSend: msg => console.log('Send:', msg),
onMessage: msg => console.log('Message:', JSON.stringify(msg))
*/
