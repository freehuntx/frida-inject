import { inject } from './inject.ts';

export { clean } from './clean.ts';
export type { CompileOptions, CompileResult, ScriptCode, ScriptFile, ScriptInput, ScriptPart } from './compile.ts';
export { compile, compileWithFiles } from './compile.ts';
export type { Injection, InjectOptions } from './inject.ts';
export { inject };
export default inject;
