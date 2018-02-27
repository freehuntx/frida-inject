const EventEmitter = require('events')
const fs = require('fs')
const os = require('os')
const exec = require('child_process').exec
const Babel = require('babel-core')
const Frida = require('frida')
const FridaCompile = require('frida-compile')

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

// Function to check if process is running
function isRunning(proc) {
  return new Promise((resolve, reject) => {
    const plat = process.platform
    const cmd = plat == 'win32' ? 'tasklist' : (plat == 'darwin' ? 'ps -ax | grep ' + proc : (plat == 'linux' ? 'ps -A' : ''))
    if(cmd === '' || proc === '') {
      resolve(false)
    }
    exec(cmd, (err, stdout, stderr) => {
      resolve(stdout.toLowerCase().indexOf(proc.toLowerCase()) > -1)
    })
  })
}

module.exports = class FridaInject extends EventEmitter {
  constructor(process, options) {
    super()
    this.on('error', () => {})
    this._process = process
    this._options = {
      delay: 0,
      wait: true,
      waitThreshold: 500,
      ...options
    }
    this._session = null
    
    this._init()
  }

  async _init() {
    if (!await isRunning(this._process)) {
      if (!this._options.wait) throw new Error('Process not found')
      setTimeout(() => this._init(), this._options.waitThreshold)
      return
    }

    setTimeout(() => {
      Frida.attach(this._process).then(
        session => {
          this._session = session
          this.emit('attach', session)
  
          session.events.listen('detached', () => {
            this.emit('detach', session)
            this._session = null
          })
        },
        err => {
          if (err.message === 'Process not found' && this._options.wait) {
            setTimeout(() => this._init(), this._options.waitThreshold)
            return
          }
  
          throw err
        }
      )
    }, this._options.delay)
  }

  async load(input) {
    if (this._session === null) {
      this.once('attach', () => this.load(input))
      return
    }

    let source = input

    if (fs.existsSync(input)) {
      try {
        source = (await FridaCompile.compile(input, {}, {})).bundle
        source = Babel.transform(source, { presets: ['es2015'] }).code
      }
      catch(e) {
        source = ''
      }
    }

    try {
      let script = await this._session.createScript(source)

      script.events.listen('message', message => {
        if (message.type === 'error') this.emit('error', message)
        else if(message.type === 'send') this.emit('send', message.payload, script)
  
        this.emit('message', message, script)
      });
  
      await script.load()
      this.emit('load', script)
    }
    catch(e) {
      console.error(e)
    }

    this._cleanup()
  }

  async _cleanup() {
    // First lets remove all injectors currently running
    let localDevice = await Frida.getLocalDevice()
    let processes = await localDevice.enumerateProcesses()

    for (let process of processes) {
      if (!process.name.startsWith('frida-winjector')) continue

      Frida.kill(process.pid) // We dont want injectors anymore!
    }

    // Now lets clean our temp folder for old injector files
    let tmpDir = os.tmpdir()
    fs.readdirSync(tmpDir).filter(e => e.startsWith('frida-')).forEach(folder => {
      recursiveDelete(`${tmpDir}/${folder}`)
    })
  }
}
