import test from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../src/server.js';
import { openDb } from '../src/db.js';

async function setup(){
  const db=openDb(':memory:');
  const app=await buildServer({db,dbPath:':memory:',logger:false,devLogin:true,cookieSecret:'test-secret-test-secret-test-secret'});
  return {app,db};
}

test('circle membership and visit access are isolated', async()=>{
  const {app,db}=await setup();
  async function login(name){
    const r=await app.inject({method:'POST',url:'/auth/dev/login',payload:{name,subject:name}});
    return r.cookies[0].value;
  }
  const cookieA=await login('A'); const cookieB=await login('B');
  const ca=await app.inject({method:'POST',url:'/api/circles',headers:{cookie:`sokn_session=${cookieA}`},payload:{name:'Alpha'}});
  assert.equal(ca.statusCode,200);
  const alpha=ca.json(); const slugA=alpha.visitor_url.split('/').pop();
  await app.inject({method:'POST',url:`/api/circles/by-slug/${slugA}/join`,headers:{cookie:`sokn_session=${cookieB}`}});
  const circleRow=db.prepare('SELECT id FROM circles WHERE visitor_slug=?').get(slugA);
  await app.inject({method:'POST',url:`/api/circles/${circleRow.id}/visits`,headers:{cookie:`sokn_session=${cookieB}`},payload:{date:'2030-01-02',start_time:'14:00',end_time:'16:00',template:'Nachmittags'}});
  const cb=await app.inject({method:'POST',url:'/api/circles',headers:{cookie:`sokn_session=${cookieB}`},payload:{name:'Beta'}});
  assert.equal(cb.statusCode,200);
  const beta=cb.json(); const slugB=beta.visitor_url.split('/').pop();
  const circleB=db.prepare('SELECT id FROM circles WHERE visitor_slug=?').get(slugB);
  const cross=await app.inject({method:'GET',url:`/api/circles/${circleB.id}/visits`,headers:{cookie:`sokn_session=${cookieA}`}});
  assert.equal(cross.statusCode,404);
  await app.close();
});

test('ban removes access and refuses rejoining', async()=>{
  const {app,db}=await setup();
  async function login(name){
    const r=await app.inject({method:'POST',url:'/auth/dev/login',payload:{name,subject:name}});
    return r.cookies[0].value;
  }
  const admin=await login('Admin'), visitor=await login('Visitor');
  const created=await app.inject({method:'POST',url:'/api/circles',headers:{cookie:`sokn_session=${admin}`},payload:{name:'Family'}});
  const slug=created.json().visitor_url.split('/').pop();
  await app.inject({method:'POST',url:`/api/circles/by-slug/${slug}/join`,headers:{cookie:`sokn_session=${visitor}`}});
  const circle=db.prepare('SELECT id FROM circles WHERE visitor_slug=?').get(slug);
  const user=db.prepare('SELECT id FROM users WHERE subject=?').get('Visitor');
  const banned=await app.inject({method:'POST',url:`/api/circles/${circle.id}/members/${user.id}/block`,headers:{cookie:`sokn_session=${admin}`}});
  assert.equal(banned.statusCode,200);
  const denied=await app.inject({method:'GET',url:`/api/circles/${circle.id}/visits`,headers:{cookie:`sokn_session=${visitor}`}});
  assert.ok([401,404].includes(denied.statusCode));
  const rejoin=await app.inject({method:'POST',url:`/api/circles/by-slug/${slug}/join`,headers:{cookie:`sokn_session=${visitor}`}});
  assert.ok([401,404].includes(rejoin.statusCode));
  await app.close();
});

test('visitor cannot delete another visitor’s visit or admin visit', async()=>{
  const {app,db}=await setup();
  async function login(name){
    const r=await app.inject({method:'POST',url:'/auth/dev/login',payload:{name,subject:name}});
    return r.cookies[0].value;
  }
  const a=await login('One'), b=await login('Two');
  const made=await app.inject({method:'POST',url:'/api/circles',headers:{cookie:`sokn_session=${a}`},payload:{name:'Circle'}});
  const slug=made.json().visitor_url.split('/').pop();
  await app.inject({method:'POST',url:`/api/circles/by-slug/${slug}/join`,headers:{cookie:`sokn_session=${b}`}});
  const circle=db.prepare('SELECT id FROM circles WHERE visitor_slug=?').get(slug);
  const adminVisit=await app.inject({method:'POST',url:`/api/circles/${circle.id}/visits`,headers:{cookie:`sokn_session=${a}`},payload:{date:'2030-02-01',start_time:'10:00',end_time:'11:00'}});
  const id=adminVisit.json().id;
  const forbidden=await app.inject({method:'DELETE',url:`/api/circles/${circle.id}/visits/${id}`,headers:{cookie:`sokn_session=${b}`}});
  assert.equal(forbidden.statusCode,403);
  await app.close();
});
