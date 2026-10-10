import fs from 'node:fs';
import path from 'node:path';
import { type BuildFailure, type BuildOptions, build } from 'esbuild';

/** A file or package that gets bundled together with everything it imports. */
export interface ScriptFile {
  file: string;
}

/** A piece of source code. It may use `import` and TypeScript syntax. */
export interface ScriptCode {
  code: string;
}

/**
 * One piece of an agent script.
 *
 * A plain string is looked up as a file or package first. If nothing is found
 * it is treated as source code. Use `{ file }` or `{ code }` to be explicit.
 */
export type ScriptPart = string | ScriptFile | ScriptCode;

/**
 * A script to inject. An array of parts is merged into a single Frida script,
 * which lets the parts see each other's top-level variables.
 */
export type ScriptInput = ScriptPart | ScriptPart[];

export interface CompileOptions {
  /** Directory that relative paths and package names are resolved from. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Embed a source map so that stack traces point at your original files. Defaults to `true`. */
  sourcemap?: boolean;
  /** Extra esbuild options. They win over the defaults used by this library. */
  esbuild?: BuildOptions;
}

/** A compiled script together with the files it was made from. */
export interface CompileResult {
  /** JavaScript that Frida can load. */
  source: string;
  /** Absolute paths of your files that went into it. Packages from `node_modules` are left out. */
  files: string[];
}

const LOOKS_LIKE_PATH = /^(\.{1,2}[\\/]|[\\/]|[A-Za-z]:[\\/])|\.[cm]?[jt]s$/;

function isBuildFailure(error: unknown): error is BuildFailure {
  return error instanceof Error && Array.isArray((error as BuildFailure).errors);
}

/** True if esbuild failed because the entry point itself does not exist. */
function isMissingEntry(error: unknown): boolean {
  if (!isBuildFailure(error) || error.errors.length !== 1) return false;
  const [first] = error.errors;
  return first !== undefined && first.location === null && first.text.startsWith('Could not resolve');
}

async function bundle(
  input: Pick<BuildOptions, 'entryPoints' | 'stdin'>,
  format: 'iife' | 'esm',
  cwd: string,
  options: CompileOptions,
): Promise<CompileResult> {
  const result = await build({
    absWorkingDir: cwd,
    bundle: true,
    format,
    // Frida agents run in QuickJS (or V8), which is neither Node.js nor a browser.
    platform: 'neutral',
    mainFields: ['browser', 'module', 'main'],
    conditions: ['frida', 'browser'],
    target: 'es2022',
    sourcemap: options.sourcemap ? 'inline' : false,
    logLevel: 'silent',
    // Inline code may define variables for a later part, so nothing in it is "unused".
    treeShaking: format === 'esm' ? false : undefined,
    ...options.esbuild,
    ...input,
    write: false,
    metafile: true,
  });

  const [output] = result.outputFiles;
  if (output === undefined) throw new Error('esbuild did not produce any output');

  const files = Object.keys(result.metafile.inputs)
    .map((input) => path.resolve(cwd, input))
    // Code given as a string and virtual modules from plugins are listed too, but are not files.
    .filter((file) => !file.split(path.sep).includes('node_modules') && fs.existsSync(file));

  return { source: output.text, files };
}

async function compilePart(part: ScriptPart, cwd: string, options: CompileOptions): Promise<CompileResult> {
  const code = (contents: string): Promise<CompileResult> =>
    // "esm" keeps the code at the top level instead of wrapping it in a function,
    // so parts of the same script can share variables.
    bundle({ stdin: { contents, resolveDir: cwd, sourcefile: 'inline-script.ts', loader: 'ts' } }, 'esm', cwd, options);

  if (typeof part === 'object' && part !== null) {
    if ('code' in part && typeof part.code === 'string') return code(part.code);
    if ('file' in part && typeof part.file === 'string')
      return bundle({ entryPoints: [part.file] }, 'iife', cwd, options);
  }

  if (typeof part !== 'string') {
    throw new TypeError(`Invalid script: expected a string, { file } or { code }, got ${typeof part}`);
  }

  // Multi-line strings are never file names, so skip the lookup.
  if (part.includes('\n')) return code(part);

  try {
    return await bundle({ entryPoints: [part] }, 'iife', cwd, options);
  } catch (error) {
    if (!isMissingEntry(error)) throw error;
    if (LOOKS_LIKE_PATH.test(part)) {
      throw new Error(`Script file not found: ${path.resolve(cwd, part)}`, { cause: error });
    }
    return code(part);
  }
}

/**
 * Like {@link compile}, but also tells you which files the script was made
 * from. That is what watch mode uses to know when to rebuild.
 */
export async function compileWithFiles(script: ScriptInput, options: CompileOptions = {}): Promise<CompileResult> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const parts = Array.isArray(script) ? script : [script];

  // A source map only makes sense when the output comes from a single bundle.
  const sourcemap = (options.sourcemap ?? true) && parts.length === 1;
  const results = await Promise.all(parts.map((part) => compilePart(part, cwd, { ...options, sourcemap })));

  return {
    source: results.map((result) => result.source).join('\n;\n'),
    files: [...new Set(results.flatMap((result) => result.files))],
  };
}

/**
 * Turns a script (file, package, source code, or a mix of them) into a single
 * string of JavaScript that Frida can load.
 */
export async function compile(script: ScriptInput, options: CompileOptions = {}): Promise<string> {
  return (await compileWithFiles(script, options)).source;
}
