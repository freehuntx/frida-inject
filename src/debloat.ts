import * as Frida from 'frida';
import * as fs from 'fs';
import * as os from 'os';

// Used for temp folder cleanup
function recursiveDelete(pathStr: string) {
  try {
    if (fs.existsSync(pathStr)) {
      fs.readdirSync(pathStr).forEach(file => {
        let curPath = `${pathStr}/${file}`

        if (fs.lstatSync(curPath).isDirectory())
          recursiveDelete(curPath)
        else
          fs.unlinkSync(curPath)
      })

      fs.rmdirSync(pathStr);
    }
  } catch (e) { }
}


export default async function debloat() {
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
