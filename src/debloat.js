const Frida = require('frida')
const fs = require('fs')
const os = require('os')

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


module.exports = async function debloat() {
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
