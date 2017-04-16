const Frida = require('frida'),
      FridaLoad = require('frida-load'),
      co = require('co'),
      os = require('os'),
      fs = require('fs');

// Used for temp folder cleanup
function recursiveDelete(path) {
  try {
    if (fs.existsSync(path)) {
      fs.readdirSync(path).forEach((file)=>{
        let curPath = path + "/" + file;

        if (fs.lstatSync(curPath).isDirectory()) recursiveDelete(curPath);
        else {
            fs.unlinkSync(curPath);
        }
      });

      fs.rmdirSync(path);
    }
  } catch(e) {}
}

class FridaInject {
  constructor(target, sourceFile, options) {
    this._target = target;
    this._sourceFile = sourceFile;
    this._options = options || {};
    this._session = null;

    co(this._init.bind(this)).catch((error)=>this._emit('onError', error));
  }

  *_init() {
    this._session = yield Frida.attach(this._target);
    this._emit('onAttach', this._session);
    this._session.events.listen('detached', ()=>this._emit('onDetach', this._session));

    yield this._inject([this._sourceFile]);
  }

  *_inject(sourceFiles=[]) {
    for (let sourceFile of sourceFiles) {
      let sourceCode = yield FridaLoad(sourceFile);
      let script = yield this._session.createScript(sourceCode);
      this._emit('onScriptCreate', script);

      script.events.listen('message', (message)=>{
        if (message.type === 'error') this._emit('onError', message);
        else if(message.type === 'send') this._emit('onSend', message.payload, script);

        this._emit('onMessage', message, script)
      });

      yield script.load();
      this._emit('onLoad', script);
    }

    yield this._cleanup();
  }

  *_cleanup() {
    // First lets remove all injectors currently running
    let localDevice = yield Frida.getLocalDevice();
    let processes = yield localDevice.enumerateProcesses();

    for (let process of processes) {
      if (!process.name.startsWith('frida-winjector')) continue;

      Frida.kill(process.pid); // We dont want injectors anymore!
    }

    // Now lets clean our temp folder for old injector files
    let tmpDir = os.tmpdir();
    fs.readdirSync(tmpDir).filter((e)=>e.startsWith('frida-')).forEach((folder)=>{
      recursiveDelete(`${tmpDir}/${folder}`);
    });
  }

  _emit(name, ...args) {
    if (typeof this._options[name] !== 'function') return;
    this._options[name].apply(this, args);
  }

  //Getter/Setter
  get session() { return this._session; }
}

module.exports = function(target, sourceFile, options) {
  return new FridaInject(target, sourceFile, options);
};
