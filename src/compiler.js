
const Babel = require('babel-core')
const Babelify = require('babelify')
const Browserify = require('browserify')
const path = require('path')
const parentDir = path.dirname(module.parent.parent.filename)

const babelConfig = {
  presets: ["env"],
  plugins: ['transform-object-rest-spread']
}

function moduleExists(name) {
  try {
    require.resolve(name)
    return true
  }
  catch(e) {
    return false
  }
}

function bundleFile(file) {
  return new Promise((resolve, reject) => {
    Browserify({ debug: true })
    .transform(Babelify.configure(babelConfig), { global: true })
    .require(file, { entry: true })
    .bundle((err, buf) => {
      if (err) reject(err)
      else resolve(buf.toString())
    })
  })
}

function resolveScript(script) {
  if (moduleExists(script)) {
    return bundleFile(require.resolve(script))
  }
  else if (moduleExists(path.resolve(parentDir, script))) {
    return bundleFile(require.resolve(path.resolve(parentDir, script)))
  }
  else {
    return Promise.resolve(Babel.transform(script, babelConfig).code)
  }
}

function compile(script) {
  if (typeof script === 'string') {
    return resolveScript(script)
  }
  else if (Array.isArray(script)) {
    return Promise.all(script.map(resolveScript))
      .then(values => values.join(';'))
  }
  else throw new Error('Invalid script of type: ' + typeof script)
}

module.exports = {
  compile
}
