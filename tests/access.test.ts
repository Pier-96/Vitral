import assert from 'node:assert/strict';
import { test } from 'node:test';
import { progressOwner, validateMembership, type Membership } from '../server/access';
import { pendingInvitation, clearInvitation } from '../src/invitation';

const coach:Membership={userId:'coach',isCoach:true,isClient:false,clientIds:['client','client-two'],coachId:null};
const client:Membership={userId:'client',isCoach:false,isClient:true,clientIds:[],coachId:'coach'};

test('coach must explicitly select a client; asesorado reads their own history',()=>{
  assert.throws(()=>progressOwner(coach,undefined));
  assert.equal(progressOwner(coach,'client'),'client');
  assert.equal(progressOwner(client,undefined),'client');
});
test('only linked coach can write, even if client submits their own or another id',()=>{
  assert.equal(progressOwner(coach,'client-two',true),'client-two');
  for(const target of [undefined,'client','coach','stranger'])assert.throws(()=>progressOwner(client,target,true));
  for(const target of ['coach','stranger'])assert.throws(()=>progressOwner(coach,target,true));
});
test('neither participant can read a third account',()=>{
  for(const member of [coach,client])assert.throws(()=>progressOwner(member,'stranger'));
});
test('onboarding users and unlinked coaches cannot write progress',()=>{
  for(const isCoach of [true,false])assert.throws(()=>progressOwner({userId:'new',isCoach,isClient:false,clientIds:[],coachId:null},undefined,true));
});
test('legacy reciprocal roles fail closed for reads and writes',()=>{
  const invalid={...coach,coachId:'client'};
  assert.throws(()=>validateMembership(invalid));
  assert.throws(()=>progressOwner(invalid,'client'));
  assert.throws(()=>progressOwner(invalid,'client',true));
});
test('a relation cannot confer coach privileges without the coach role',()=>{
  assert.throws(()=>progressOwner({...coach,isCoach:false},'client',true));
});
test('malformed subject parameters cannot fall back to another user',()=>{
  for(const target of [[],{},null,['client']])assert.throws(()=>progressOwner(coach,target,true));
});
test('invitation survives OAuth callback without query and clears only after acceptance',()=>{
  const values=new Map<string,string>();
  const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)},removeItem:(key:string)=>{values.delete(key)}};
  assert.equal(pendingInvitation('',storage),null);
  assert.equal(pendingInvitation('?invite=private-token',storage),'private-token');
  assert.equal(pendingInvitation('',storage),'private-token');
  assert.equal(pendingInvitation('?invite=new-token',storage),'new-token');
  clearInvitation(storage);
  assert.equal(pendingInvitation('',storage),null);
});
