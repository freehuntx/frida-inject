import * as Frida from 'frida';
import { compile } from './compiler';
import debloat from './debloat';

interface FridaInjectOptions {
  clean?: boolean;
  debug?: boolean;
  device?: Frida.Device;
  pid?: number;
  name?: string;
  waitDelay?: number;
  scripts?: string[];
  onUnload?: (script: Frida.Script) => void;
  onDetach?: (session: Frida.Session, reason: string) => void;
  onAttach?: (session: Frida.Session) => void;
  onLoad?: (script: Frida.Script) => void;
  $waitNotified?: boolean;
}

async function FridaInject(options: FridaInjectOptions = {}) {
  options.clean = options.clean !== undefined ? options.clean : true
  options.debug = options.debug !== undefined ? options.debug : false
  options.device = options.device || await Frida.getLocalDevice()
  options.pid = options.pid
  options.name = options.name
  options.waitDelay = options.waitDelay || 0
  options.scripts = options.scripts || []

  if (options.pid && options.name) throw new Error('Use either pid OR name, but not both!')

  function debugLog(...args: any[]) {
    if (options.debug) console.log(...args)
  }

  function unloadFridaScript(fridaScript: Frida.Script) {
    debugLog('[*] Frida script unloaded')
    options.onUnload && options.onUnload(fridaScript)
    fridaScript.unload()
  }

  if (options.pid)
    debugLog('[*] Attaching to PID:', options.pid)
  else if (options.name)
    debugLog('[*] Attaching to process:', options.name)
  else throw new Error('Missing pid/name option!')

  let session: Frida.Session;
  try {
    const target = options.pid || options.name!;
    session = await options.device!.attach(target)
    session.detached.connect((reason) => {
      debugLog(`[*] Detached from process (reason=${reason})`)
      options.onDetach && options.onDetach(session, reason)
    })
  }
  catch (e: any) {
    if (e.message === 'Process not found' && options.name && (options.waitDelay || 0) > 0) {
      if (!options.$waitNotified) {
        console.log('Process', options.name, 'not found. Retrying every', (options.waitDelay! / 1000).toFixed(6).slice(0, -5), 'seconds...')
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


  for (let i = 0; i < (options.scripts || []).length; i++) {
    debugLog('[*] Compiling script')
    const script = options.scripts![i];
    const source = await compile(script)

    if (!source) continue;

    debugLog('[*] Creating frida script')
    const fridaScript = await session.createScript(source)
    fridaScript.message.connect((message: any) => {
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

export = FridaInject;
