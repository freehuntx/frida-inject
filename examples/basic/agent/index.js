// This file runs inside the target process.
import { add } from './math.js';

send(`5 + 10 = ${add(5, 10)}`);
send(`The main module is ${Process.mainModule.name}`);
