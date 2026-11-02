/**

 * Upload pipeline regression (alias — runs full regression gate).

 * Run: npm run test:upload  or  npm run test:regression

 */

import { spawnSync } from 'node:child_process'

import { fileURLToPath } from 'node:url'

import path from 'node:path'



const dir = path.dirname(fileURLToPath(import.meta.url))

const r = spawnSync(process.execPath, [path.join(dir, 'run-regression.mjs')], {

  stdio: 'inherit',

  cwd: path.join(dir, '..'),

})

process.exit(r.status ?? 1)

