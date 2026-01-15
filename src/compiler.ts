import * as Babel from '@babel/core';
import Babelify from 'babelify';
import Browserify from 'browserify';
import * as path from 'path';

const parentDir = module.parent && module.parent.parent && module.parent.parent.filename ? path.dirname(module.parent.parent.filename) : process.cwd();

const babelConfig = {
  presets: ['@babel/preset-env'],
  plugins: ['@babel/plugin-transform-object-rest-spread']
};

function moduleExists(name: string): boolean {
  try {
    require.resolve(name)
    return true
  }
  catch (e) {
    return false
  }
}

function bundleFile(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    Browserify({ debug: true })
      .transform(Babelify.configure(babelConfig), { global: true })
      .require(file, { entry: true })
      .bundle((err: any, buf: Buffer) => {
        if (err) reject(err)
        else resolve(buf.toString())
      })
  })
}

function resolveScript(script: string): Promise<string | null | undefined> {
  if (moduleExists(script)) {
    return bundleFile(require.resolve(script))
  }
  else if (moduleExists(path.resolve(parentDir, script))) {
    return bundleFile(require.resolve(path.resolve(parentDir, script)))
  }
  else {
    const result = Babel.transform(script, babelConfig);
    return Promise.resolve(result ? result.code : '');
  }
}

export function compile(script: string | string[]) {
  if (typeof script === 'string') {
    return resolveScript(script)
  }
  else if (Array.isArray(script)) {
    return Promise.all(script.map(resolveScript))
      .then(values => values.join(';'))
  }
  else throw new Error('Invalid script of type: ' + typeof script)
}
