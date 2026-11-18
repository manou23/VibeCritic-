import assert from 'node:assert/strict';
import {recoverAbandonedJobs} from './publishing-v2/recovery.mjs';
const now=Date.parse('2026-11-18T20:00:00Z');
const state={jobs:{
 'game:1':{key:'game:1',item:{type:'game',id:'1',name:'Game One',date:'2020-01-01'},status:'abandoned',stage:0,parts:[],lastError:'Evidence rejected: No verified trailer available',createdAt:new Date(now-1000).toISOString()},
 'movie:2':{key:'movie:2',item:{type:'movie',id:'2',name:'Duplicate',date:'2020-01-01'},status:'abandoned',stage:0,parts:[],lastError:'Skipped: an existing review already covers this title.'},
 'movie:3':{key:'movie:3',item:{type:'movie',id:'3',name:'Future Film',date:'2027-01-01'},status:'abandoned',stage:0,parts:[],lastError:'Evidence rejected: Independent source has insufficient detail'},
 'series:4':{key:'series:4',item:{type:'series',id:'4',name:'Already Written',date:'2020-01-01'},status:'abandoned',stage:3,parts:[],fileWritten:true,lastError:'Evidence rejected: No sufficiently matching independent encyclopedia page'},
 'movie:6':{key:'movie:6',item:{type:'movie',id:'6',name:'Legacy Future',date:'2027-01-01'},status:'abandoned',stage:0,parts:[],lastError:'Editorial rejection: release date is in the future; wait until release before reviewing.'},
 'series:5':{key:'series:5',item:{type:'series',id:'5',name:'Already Retried',date:'2020-01-01'},status:'abandoned',stage:0,parts:[],recoveryAttempts:1,lastError:'Evidence rejected: Primary source metadata is too thin'}
}};
assert.equal(recoverAbandonedJobs(state,now),3,'recoverable evidence failures and legacy future-release rejections are reactivated');
const recovered=state.jobs['game:1'];
assert.equal(recovered.status,'queued');
assert.equal(recovered.stage,0);
assert.equal(recovered.parts.length,0);
assert.equal(recovered.evidence,null);
assert.equal(recovered.recoveryAttempts,1);
assert.equal(recovered.evidenceRecoveryAttempts,0);
assert.equal(state.jobs['movie:2'].status,'abandoned','duplicates must never be retried');
assert.equal(state.jobs['movie:3'].status,'queued','future releases are now recovered as advance-reading work');
assert.equal(state.jobs['series:4'].status,'abandoned','already written articles must not be duplicated');
assert.equal(state.jobs['series:5'].status,'abandoned','recovery is bounded to one reactivation');
assert.equal(state.jobs['movie:6'].status,'queued','legacy future-release rejections must be reactivated for advance reading');
console.log('VibeCritic automatic evidence recovery tests passed.');
