import fs from 'node:fs/promises';
import path from 'node:path';
import { createState, validateState } from './core.mjs';
export async function loadState(filePath='data/publisher-v2-state.json') {
  try { return validateState(JSON.parse(await fs.readFile(filePath,'utf8'))); }
  catch (error) { if (error?.code==='ENOENT') return createState(); throw error; }
}
export async function saveState(state,filePath='data/publisher-v2-state.json') {
  validateState(state);
  const target=path.resolve(filePath); await fs.mkdir(path.dirname(target),{recursive:true});
  const temp=target+'.tmp-'+process.pid; let handle;
  try { handle=await fs.open(temp,'w'); await handle.writeFile(JSON.stringify({...state,updatedAt:new Date().toISOString()},null,2)+'\n','utf8'); await handle.sync(); await handle.close(); handle=null; await fs.rename(temp,target); }
  catch(error) { if(handle) await handle.close().catch(()=>{}); await fs.rm(temp,{force:true}).catch(()=>{}); throw error; }
}
