import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const dir=await mkdtemp(join(tmpdir(),'gym-tests-'));
try {
 const access=join(dir,'access.test.mjs');
 await build({entryPoints:['tests/access.test.ts'],outfile:access,bundle:true,platform:'node',format:'esm'});
 const result=spawnSync(process.execPath,['--test',access,'tests/database.test.mjs'],{stdio:'inherit'});
 process.exitCode=result.status??1;
} finally {await rm(dir,{recursive:true,force:true});}
