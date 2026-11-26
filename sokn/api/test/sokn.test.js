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

test('profiles and visit participants remain private to the calendar and work on the tablet', async()=>{
  const {app,db}=await setup();
  const login=async name=>{
    const r=await app.inject({method:'POST',url:'/auth/dev/login',payload:{name,subject:name}});
    return {cookie:`sokn_session=${r.cookies[0].value}`,id:r.json().user.id};
  };
  const franzi=await login('Franzi'), olaf=await login('Olaf'), outsider=await login('Outsider');
  const create=await app.inject({method:'POST',url:'/api/circles',headers:{cookie:franzi.cookie},payload:{name:'Family'}});
  const circle=create.json(), slug=circle.visitor_url.split('/').pop();
  await app.inject({method:'POST',url:`/api/circles/by-slug/${slug}/join`,headers:{cookie:olaf.cookie}});
  const url=`/api/circles/${circle.id}`;
  const jpeg='data:image/jpeg;base64,/9j/2Q==';
  assert.equal((await app.inject({method:'PUT',url:'/api/profile',headers:{cookie:olaf.cookie},payload:{name:'Marc'}})).statusCode,200);
  assert.equal((await app.inject({method:'PUT',url:'/api/profile/photo',headers:{cookie:franzi.cookie},payload:{photo:jpeg}})).statusCode,200);
  assert.equal((await app.inject({method:'PUT',url:'/api/profile/photo',headers:{cookie:franzi.cookie},payload:{photo:'data:image/svg+xml;base64,PHN2Zz4='}})).statusCode,400);
  const tim=await app.inject({method:'POST',url:`${url}/companions`,headers:{cookie:franzi.cookie},payload:{name:'Tim',photo:jpeg}});
  const toni=await app.inject({method:'POST',url:`${url}/companions`,headers:{cookie:franzi.cookie},payload:{name:'Toni'}});
  assert.equal(tim.statusCode,200);
  const people=(await app.inject({method:'GET',url:`${url}/people`,headers:{cookie:franzi.cookie}})).json();
  assert.deepEqual(people.members.map(p=>p.display_name).sort(),['Franzi','Marc']);
  assert.deepEqual(people.companions.map(p=>p.display_name),['Tim','Toni']);
  assert.deepEqual((await app.inject({method:'GET',url:`${url}/people`,headers:{cookie:olaf.cookie}})).json().companions,[]);
  assert.equal((await app.inject({method:'GET',url:`${url}/people`,headers:{cookie:outsider.cookie}})).statusCode,404);
  const timUrl=`${url}/companions/${tim.json().id}`;
  assert.equal((await app.inject({method:'PUT',url:timUrl,headers:{cookie:olaf.cookie},payload:{name:'Tim'}})).statusCode,404);
  const changed=await app.inject({method:'PUT',url:timUrl,headers:{cookie:franzi.cookie},payload:{name:'Tim',remove_photo:true}});
  assert.equal(changed.json().avatar_url,null);
  assert.equal((await app.inject({method:'PUT',url:timUrl,headers:{cookie:franzi.cookie},payload:{name:'Tim',photo:jpeg}})).statusCode,200);
  const payload={date:'2030-01-02',start_time:'10:00',end_time:'12:00',participants:[
    {type:'user',id:olaf.id},{type:'companion',id:tim.json().id},{type:'companion',id:toni.json().id}
  ]};
  const created=await app.inject({method:'POST',url:`${url}/visits`,headers:{cookie:franzi.cookie},payload});
  assert.equal(created.statusCode,200);
  assert.deepEqual(created.json().people.map(p=>p.display_name),['Franzi','Marc','Tim','Toni']);
  const visits=await app.inject({method:'GET',url:`${url}/visits`,headers:{cookie:olaf.cookie}});
  assert.deepEqual(visits.json().visits[0].people.map(p=>p.display_name),['Franzi','Marc','Tim','Toni']);
  const photoUrl=created.json().people.find(p=>p.display_name==='Tim').avatar_url;
  assert.equal((await app.inject({method:'GET',url:photoUrl,headers:{cookie:olaf.cookie}})).headers['content-type'],'image/jpeg');
  assert.equal((await app.inject({method:'GET',url:photoUrl,headers:{cookie:outsider.cookie}})).statusCode,404);
  assert.equal((await app.inject({method:'GET',url:`${url}/photos/users/${franzi.id}`})).statusCode,404);
  assert.equal((await app.inject({method:'POST',url:`${url}/visits`,headers:{cookie:olaf.cookie},payload:{...payload,participants:[{type:'companion',id:tim.json().id}]}})).statusCode,400);
  assert.equal((await app.inject({method:'POST',url:`${url}/visits`,headers:{cookie:franzi.cookie},payload:{...payload,participants:[{type:'user',id:outsider.id}]}})).statusCode,400);
  assert.equal((await app.inject({method:'POST',url:`${url}/visits`,headers:{cookie:franzi.cookie},payload:{...payload,participants:[{type:'user',id:olaf.id},{type:'user',id:olaf.id}]}})).statusCode,400);
  const pairing=await app.inject({method:'POST',url:`${url}/pairings`,headers:{cookie:franzi.cookie}});
  const paired=await app.inject({method:'POST',url:`/api${pairing.json().pairing_url}`});
  const device=`sokn_device=${paired.cookies[0].value}`;
  assert.equal((await app.inject({method:'GET',url:photoUrl,headers:{cookie:device}})).statusCode,200);
  assert.equal((await app.inject({method:'GET',url:`${url}/visits`,headers:{cookie:device}})).json().visits[0].people.length,4);
  const updated=await app.inject({method:'PUT',url:`${url}/visits/${created.json().id}`,headers:{cookie:franzi.cookie},payload:{participants:[{type:'companion',id:toni.json().id}]}});
  assert.deepEqual(updated.json().people.map(p=>p.display_name),['Franzi','Toni']);
  assert.equal((await app.inject({method:'GET',url:photoUrl,headers:{cookie:device}})).statusCode,404);
  assert.equal((await app.inject({method:'DELETE',url:'/api/profile/photo',headers:{cookie:franzi.cookie}})).statusCode,200);
  assert.equal((await app.inject({method:'GET',url:`${url}/photos/users/${franzi.id}`,headers:{cookie:olaf.cookie}})).statusCode,404);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM visits').get().n,1);
  await app.close();
});
