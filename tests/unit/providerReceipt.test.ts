import assert from 'node:assert/strict';
import test from 'node:test';
import { extractProviderReceipt, providerForUrl } from '../../app/providerReceipt.ts';
test('only exact HTTPS provider hosts are recognized',()=>{
 assert.equal(providerForUrl('https://api.openai.com/v1/responses'),'openai');
 assert.equal(providerForUrl('https://api.openai.com.attacker.test/v1'),null);
 assert.equal(providerForUrl('http://api.openai.com/v1'),null);
 assert.equal(providerForUrl('https://api.klang.io/transcription'),'klangio');
});
test('receipt retains measured tokens without prompts, output, or invented dollars',()=>{
 const r=extractProviderReceipt('openai',new Headers({'x-request-id':'req_1','authorization':'secret'}),{id:'resp_1',model:'model-1',usage:{input_tokens:100,input_tokens_details:{cached_tokens:20},output_tokens:0},input:'private lyrics',output:'private result',cost:5});
 assert.deepEqual(r.units,{input_tokens:100,cached_input_tokens:20,output_tokens:0});
 assert.equal(r.providerRequestId,'req_1');
 assert.equal(JSON.stringify(r).includes('private'),false);
 assert.equal('cost' in r,false);
});
test('unknown and invalid usage is distinct from measured zero',()=>{
 assert.deepEqual(extractProviderReceipt('openai',new Headers(),{usage:{input_tokens:-1,output_tokens:'0'}}).units,{});
 assert.deepEqual(extractProviderReceipt('elevenlabs',new Headers({'x-character-cost':'0'}),null).units,{character_cost:0});
 assert.deepEqual(extractProviderReceipt('elevenlabs',new Headers(),null).units,{});
});
test('asynchronous transcription has a provider task reference',()=>{
 assert.equal(extractProviderReceipt('klangio',new Headers(),{job_id:'job_123'}).providerTaskId,'job_123');
});
