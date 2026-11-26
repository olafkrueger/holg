import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import webPush from 'web-push';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { loadConfig } from './config.js';
import { rid, sha, now } from './util.js';

export async function buildServer(overrides = {}) {
  const config = loadConfig(overrides);
  const db = overrides.db || openDb(overrides.dbPath || config.dbPath);
  const app = Fastify({ logger: config.logger === false ? false : config.logger });
  await app.register(cookie, { secret: overrides.cookieSecret || process.env.COOKIE_SECRET || rid(32) });
  await app.register(rateLimit, { max: overrides.rateLimitMax || 60, timeWindow: '1 minute' });
  if (config.vapid.publicKey && config.vapid.privateKey) {
    webPush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey);
  }

  function getAuth(request) {
    const token = request.cookies?.sokn_session;
    if (!token) return null;
    const session = db.prepare('SELECT u.*, s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?').get(sha(token));
    return session && session.expires_at > now() ? session : null;
  }
  function deviceAuth(request) {
    const token = request.cookies?.sokn_device;
    if (!token) return null;
    return db.prepare(`SELECT d.*, c.name circle_name FROM devices d JOIN circles c ON c.id=d.circle_id
      WHERE d.token_hash=? AND d.revoked=0`).get(sha(token)) || null;
  }
  function setSession(reply, userId) {
    const token = rid(32);
    db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(sha(token), userId, now() + 30*24*60*60*1000);
    reply.setCookie('sokn_session', token, { httpOnly:true, secure:config.secureCookies, sameSite:'lax', path:'/', maxAge:30*24*60*60 });
  }
  function member(circleId, userId) {
    return db.prepare('SELECT * FROM memberships WHERE circle_id=? AND user_id=?').get(circleId, userId);
  }
  function requireMember(request, reply, circleId) {
    const user = getAuth(request);
    if (!user) { reply.code(401).send({error:'login_required'}); return null; }
    const m = member(circleId,user.id);
    if (!m || m.status !== 'active') { reply.code(404).send({error:'not_found'}); return null; }
    return { user, membership:m };
  }

  app.decorate('db', db);
  app.get('/api/health', async () => ({ok:true}));
  app.get('/api/me', async (request) => {
    const user = getAuth(request);
    return user ? {id:user.id, name:user.display_name, avatar:user.avatar_url} : {id:null};
  });

  app.get('/auth/providers', async () => ({
    providers: [
      ...(config.devLogin ? [{id:'dev',name:'Development login'}] : []),
      {id:'google',name:'Google'},
      {id:'microsoft',name:'Microsoft 365'},
      {id:'apple',name:'Apple'}
    ]
  }));

  app.post('/auth/dev/login', async (request, reply) => {
    if (!config.devLogin) return reply.code(404).send({error:'not_found'});
    const name = String(request.body?.name || 'Test visitor').slice(0,80);
    const subject = String(request.body?.subject || rid(12));
    let user = db.prepare('SELECT * FROM users WHERE provider=? AND subject=?').get('dev',subject);
    if (!user) {
      const id=rid(16);
      db.prepare('INSERT INTO users(id,provider,subject,display_name,avatar_url,created_at) VALUES(?,?,?,?,?,?)')
        .run(id,'dev',subject,name,null,now());
      user=db.prepare('SELECT * FROM users WHERE id=?').get(id);
    }
    setSession(reply,user.id);
    return {ok:true,user:{id:user.id,name:user.display_name}};
  });

  app.post('/auth/logout', async (request, reply) => {
    const token=request.cookies?.sokn_session;
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha(token));
    reply.clearCookie('sokn_session',{path:'/'});
    return {ok:true};
  });

  app.post('/api/circles', async (request, reply) => {
    const user=getAuth(request);
    if (!user) return reply.code(401).send({error:'login_required'});
    const name=String(request.body?.name||'').trim().slice(0,80);
    if (!name) return reply.code(400).send({error:'name_required'});
    const id=rid(16), visitor=rid(24), admin=rid(24);
    db.transaction(()=>{
      db.prepare('INSERT INTO circles(id,name,visitor_slug,admin_slug_hash,created_at) VALUES(?,?,?,?,?)')
        .run(id,name,visitor,sha(admin),now());
      db.prepare('INSERT INTO memberships(circle_id,user_id,role,status,created_at) VALUES(?,?,?,?,?)')
        .run(id,user.id,'admin','active',now());
    })();
    return {id,name,visitor_url:`/c/${visitor}`,admin_url:`/c/${visitor}/admin/${admin}`};
  });

  app.get('/api/circles/by-slug/:slug', async (request, reply) => {
    const circle=db.prepare('SELECT id,name,photo,photo_type FROM circles WHERE visitor_slug=?').get(request.params.slug);
    if (!circle) return reply.code(404).send({error:'not_found'});
    const user=getAuth(request), m=user && member(circle.id,user.id);
    if (m?.status==='banned') return reply.code(404).send({error:'not_found'});
    return {id:circle.id,name:circle.name,photo:circle.photo,role:m?.status==='active'?m.role:null};
  });

  app.post('/api/circles/by-slug/:slug/join', async (request, reply) => {
    const circle=db.prepare('SELECT id FROM circles WHERE visitor_slug=?').get(request.params.slug);
    if (!circle) return reply.code(404).send({error:'not_found'});
    const user=getAuth(request);
    if (!user) return reply.code(401).send({error:'login_required'});
    const m=member(circle.id,user.id);
    if (m?.status==='banned') return reply.code(404).send({error:'not_found'});
    if (!m) db.prepare('INSERT INTO memberships(circle_id,user_id,role,status,created_at) VALUES(?,?,?,?,?)')
      .run(circle.id,user.id,'visitor','active',now());
    return {ok:true};
  });

  app.post('/api/circles/:circleId/admin/rotate', async (request,reply) => {
    const auth=requireMember(request,reply,request.params.circleId);
    if (!auth) return;
    if(auth.membership.role!=='admin') return reply.code(403).send({error:'forbidden'});
    const circle=db.prepare('SELECT visitor_slug FROM circles WHERE id=?').get(request.params.circleId);
    if(!circle) return reply.code(404).send({error:'not_found'});
    const visitor=rid(24), admin=rid(24);
    db.prepare('UPDATE circles SET visitor_slug=?,admin_slug_hash=? WHERE id=?').run(visitor,sha(admin),request.params.circleId);
    return {visitor_url:`/c/${visitor}`,admin_url:`/c/${visitor}/admin/${admin}`};
  });

  app.post('/api/circles/:circleId/pairings', async(request,reply)=>{
    const auth=requireMember(request,reply,request.params.circleId);
    if(!auth) return;
    if(auth.membership.role!=='admin') return reply.code(403).send({error:'forbidden'});
    const token=rid(24);
    db.prepare('INSERT INTO pairings(token_hash,circle_id,expires_at,used) VALUES(?,?,?,0)').run(sha(token),request.params.circleId,now()+15*60*1000);
    return {pairing_url:`/pair/${token}`,expires_in:900};
  });
  app.post('/api/pair/:token', async(request,reply)=>{
    const p=db.prepare('SELECT * FROM pairings WHERE token_hash=?').get(sha(request.params.token));
    if(!p || p.used || p.expires_at<now()) return reply.code(404).send({error:'not_found'});
    db.prepare('UPDATE pairings SET used=1 WHERE token_hash=?').run(p.token_hash);
    const id=rid(16), deviceToken=rid(32);
    db.prepare('INSERT INTO devices(id,circle_id,token_hash,created_at,revoked) VALUES(?,?,?,?,0)').run(id,p.circle_id,sha(deviceToken),now());
    reply.setCookie('sokn_device',deviceToken,{httpOnly:true,secure:config.secureCookies,sameSite:'lax',path:'/',maxAge:365*24*60*60});
    return {ok:true,circle_id:p.circle_id};
  });

  app.get('/api/circles/:circleId/device', async(request,reply)=>{
    const device=deviceAuth(request);
    if(!device || device.circle_id!==request.params.circleId) return reply.code(404).send({error:'not_found'});
    return {circle:{id:device.circle_id,name:device.circle_name},holger:true};
  });
  app.get('/api/device', async(request,reply)=>{
    const device=deviceAuth(request);
    if(!device) return reply.code(404).send({error:'not_found'});
    return {circle:{id:device.circle_id,name:device.circle_name},holger:true};
  });

  app.get('/api/circles/:circleId/visits', async(request,reply)=>{
    const device=deviceAuth(request);
    if(device?.circle_id===request.params.circleId) {
      const visits=db.prepare('SELECT v.*,u.display_name,u.avatar_url FROM visits v JOIN users u ON u.id=v.user_id WHERE v.circle_id=? ORDER BY date,start_time').all(request.params.circleId);
      return {visits};
    }
    const auth=requireMember(request,reply,request.params.circleId);
    if(!auth) return;
    const visits=db.prepare('SELECT v.*,u.display_name,u.avatar_url FROM visits v JOIN users u ON u.id=v.user_id WHERE v.circle_id=? ORDER BY date,start_time').all(request.params.circleId);
    return {visits};
  });

  app.post('/api/circles/:circleId/visits', async(request,reply)=>{
    const auth=requireMember(request,reply,request.params.circleId); if(!auth)return;
    const b=request.body||{}; const date=/^\d{4}-\d{2}-\d{2}$/.test(String(b.date))?b.date:'';
    const start=String(b.start_time||''); const end=String(b.end_time||start);
    if(!date||!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end)) return reply.code(400).send({error:'invalid_visit'});
    if(end<start) return reply.code(400).send({error:'invalid_time_range'});
    const id=rid(16);
    db.prepare('INSERT INTO visits(id,circle_id,user_id,date,start_time,end_time,template,note,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(id,request.params.circleId,auth.user.id,date,start,end,b.template?String(b.template).slice(0,20):null,String(b.note||'').slice(0,280),now());
    await pushCircle(db,request.params.circleId,{title:'Neuer Besuch',body:'Jemand hat einen Besuch angekündigt.'});
    return db.prepare('SELECT v.*,u.display_name,u.avatar_url FROM visits v JOIN users u ON u.id=v.user_id WHERE v.id=?').get(id);
  });

  app.put('/api/circles/:circleId/visits/:visitId', async(request,reply)=>{
    const auth=requireMember(request,reply,request.params.circleId); if(!auth)return;
    const visit=db.prepare('SELECT * FROM visits WHERE id=? AND circle_id=?').get(request.params.visitId,request.params.circleId);
    if(!visit) return reply.code(404).send({error:'not_found'});
    if(auth.membership.role!=='admin' && visit.user_id!==auth.user.id) return reply.code(403).send({error:'forbidden'});
    const b=request.body||{}, date=/^\d{4}-\d{2}-\d{2}$/.test(String(b.date||visit.date))?(b.date||visit.date):visit.date;
    const start=String(b.start_time||visit.start_time), end=String(b.end_time||visit.end_time);
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end)||end<start) return reply.code(400).send({error:'invalid_visit'});
    db.prepare('UPDATE visits SET date=?,start_time=?,end_time=?,template=?,note=? WHERE id=? AND circle_id=?')
      .run(date,start,end,b.template===undefined?visit.template:String(b.template).slice(0,20),b.note===undefined?visit.note:String(b.note).slice(0,280),request.params.visitId,request.params.circleId);
    await pushCircle(db,request.params.circleId,{title:'Besuch geändert',body:'Ein Besuch wurde aktualisiert.'});
    return db.prepare('SELECT v.*,u.display_name,u.avatar_url FROM visits v JOIN users u ON u.id=v.user_id WHERE v.id=?').get(request.params.visitId);
  });

  app.delete('/api/circles/:circleId/visits/:visitId', async(request,reply)=>{
    const auth=requireMember(request,reply,request.params.circleId); if(!auth)return;
    const visit=db.prepare('SELECT * FROM visits WHERE id=? AND circle_id=?').get(request.params.visitId,request.params.circleId);
    if(!visit) return reply.code(404).send({error:'not_found'});
    if(auth.membership.role!=='admin' && visit.user_id!==auth.user.id) return reply.code(403).send({error:'forbidden'});
    db.prepare('DELETE FROM visits WHERE id=? AND circle_id=?').run(request.params.visitId,request.params.circleId);
    await pushCircle(db,request.params.circleId,{title:'Besuch geändert',body:'Ein Besuch wurde gelöscht.'});
    return {ok:true};
  });

  app.post('/api/circles/:circleId/members/:userId/block', async(request,reply)=>{
    const auth=requireMember(request,reply,request.params.circleId); if(!auth)return;
    if(auth.membership.role!=='admin') return reply.code(403).send({error:'forbidden'});
    db.prepare('UPDATE memberships SET status=? WHERE circle_id=? AND user_id=?').run('banned',request.params.circleId,request.params.userId);
    db.prepare(`DELETE FROM sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=? AND m.circle_id=? AND m.status='banned')`).run(request.params.userId,request.params.userId,request.params.circleId);
    return {ok:true};
  });

  app.get('/api/circles/:circleId/members', async(request,reply)=>{
    const auth=requireMember(request,reply,request.params.circleId); if(!auth)return;
    if(auth.membership.role!=='admin') return reply.code(403).send({error:'forbidden'});
    return {members:db.prepare(`SELECT u.id,u.display_name,u.avatar_url,m.role,m.status FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.circle_id=?`).all(request.params.circleId)};
  });

  app.post('/api/circles/:circleId/push', async(request,reply)=>{
    const auth=requireMember(request,reply,request.params.circleId); if(!auth)return;
    const {endpoint,keys,lang}=request.body||{};
    if(!endpoint||!keys?.p256dh||!keys?.auth) return reply.code(400).send({error:'invalid_subscription'});
    db.prepare('INSERT OR REPLACE INTO push_subscriptions(id,circle_id,user_id,endpoint,p256dh,auth,lang) VALUES(?,?,?,?,?,?,?)')
      .run(rid(16),request.params.circleId,auth.user.id,endpoint,keys.p256dh,keys.auth,String(lang||'de').slice(0,5));
    return {ok:true};
  });
  app.get('/api/vapid-public-key', async()=>({publicKey:config.vapid.publicKey||''}));

  app.addHook('onClose',()=>db.close());
  if (fs.existsSync(config.appDir)) {
    await app.register(fastifyStatic,{root:config.appDir,prefix:'/',wildcard:false});
    app.setNotFoundHandler((request,reply)=>{
      if(request.url.startsWith('/api/')||request.url.startsWith('/auth/')||request.url.startsWith('/pair/')) return reply.code(404).send({error:'not_found'});
      return reply.sendFile('index.html');
    });
  }
  app.decorate('config',config);
  return app;
}

async function pushCircle(db,circleId,payload){
  if(!process.env.VAPID_PUBLIC_KEY||!process.env.VAPID_PRIVATE_KEY) return;
  const subs=db.prepare('SELECT endpoint,p256dh,auth FROM push_subscriptions WHERE circle_id=?').all(circleId);
  for(const s of subs){
    try{await webPush.sendNotification({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth}},JSON.stringify(payload));}
    catch(e){if(e.statusCode===404||e.statusCode===410) db.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').run(s.endpoint);}
  }
}

if (process.argv[1] && path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url))) {
  const app=await buildServer();
  await app.listen({host:app.config.host,port:app.config.port});
}
