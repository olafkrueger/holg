import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import formbody from '@fastify/formbody';
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
  await app.register(formbody);
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
  function canViewCircle(request, circleId) {
    const device = deviceAuth(request);
    if (device?.circle_id === circleId) return true;
    const user = getAuth(request);
    return !!user && member(circleId,user.id)?.status === 'active';
  }
  function readPhoto(value) {
    if (typeof value !== 'string' || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
    const data=Buffer.from(value.slice('data:image/jpeg;base64,'.length),'base64');
    if (data.length < 4 || data.length > 256*1024 || data[0]!==0xff || data[1]!==0xd8 || data[data.length-2]!==0xff || data[data.length-1]!==0xd9) return null;
    return data;
  }
  function photoResponse(reply, photo) {
    if (!photo) return reply.code(404).send({error:'not_found'});
    return reply.header('Cache-Control','private, no-store').header('X-Content-Type-Options','nosniff').type('image/jpeg').send(photo);
  }
  function visitWithPeople(visit, circleId) {
    const uploaded=db.prepare('SELECT 1 FROM user_photos WHERE user_id=?').get(visit.user_id);
    const people=[{id:visit.user_id,display_name:visit.display_name,avatar_url:uploaded
      ? `/api/circles/${circleId}/photos/users/${visit.user_id}` : visit.avatar_url}];
    const others=db.prepare(`SELECT u.id,u.display_name,u.avatar_url,up.user_id has_photo,NULL companion_id,p.position
      FROM visit_participants p JOIN users u ON u.id=p.user_id LEFT JOIN user_photos up ON up.user_id=u.id
      WHERE p.visit_id=?
      UNION ALL
      SELECT c.id,c.display_name,NULL,c.photo IS NOT NULL,c.id,p.position
      FROM visit_participants p JOIN companions c ON c.id=p.companion_id WHERE p.visit_id=? ORDER BY position`).all(visit.id,visit.id);
    for (const person of others) people.push({
      id:person.id, display_name:person.display_name,
      avatar_url:person.has_photo ? `/api/circles/${circleId}/photos/${person.companion_id?'companions':'users'}/${person.id}` : person.avatar_url
    });
    return {...visit,people};
  }
  function validateParticipants(circleId, ownerId, participants) {
    if (!Array.isArray(participants) || participants.length > 20) return false;
    const seen=new Set();
    for (const p of participants) {
      if (!p || typeof p.id!=='string' || !['user','companion'].includes(p.type)) return false;
      const key=`${p.type}:${p.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      if (p.type==='user') {
        if (p.id===ownerId || member(circleId,p.id)?.status!=='active') return false;
      } else if (!db.prepare('SELECT 1 FROM companions WHERE id=? AND circle_id=? AND owner_id=?').get(p.id,circleId,ownerId)) return false;
    }
    return true;
  }
  function saveParticipants(visitId, participants) {
    const insert=db.prepare('INSERT INTO visit_participants(visit_id,user_id,companion_id,position) VALUES(?,?,?,?)');
    for (const [position,p] of participants.entries()) insert.run(visitId,p.type==='user'?p.id:null,p.type==='companion'?p.id:null,position);
  }

  app.decorate('db', db);
  app.get('/api/health', async () => ({ok:true}));
  app.get('/api/me', async (request) => {
    const user = getAuth(request);
    return user ? {id:user.id, name:user.display_name, avatar:db.prepare('SELECT 1 FROM user_photos WHERE user_id=?').get(user.id) ? '/api/profile/photo' : user.avatar_url} : {id:null};
  });
  app.put('/api/profile', async (request,reply)=>{
    const user=getAuth(request); if(!user) return reply.code(401).send({error:'login_required'});
    const name=typeof request.body?.name==='string' ? request.body.name.trim() : '';
    if(!name || name.length>80) return reply.code(400).send({error:'invalid_name'});
    db.prepare('UPDATE users SET display_name=?,name_custom=1 WHERE id=?').run(name,user.id);
    return {ok:true,name};
  });
  app.put('/api/profile/photo', async (request,reply)=>{
    const user=getAuth(request); if(!user) return reply.code(401).send({error:'login_required'});
    const photo=readPhoto(request.body?.photo);
    if(!photo) return reply.code(400).send({error:'invalid_photo'});
    db.prepare('INSERT OR REPLACE INTO user_photos(user_id,photo) VALUES(?,?)').run(user.id,photo);
    return {ok:true};
  });
  app.get('/api/profile/photo', async (request,reply)=>{
    const user=getAuth(request); if(!user) return reply.code(401).send({error:'login_required'});
    return photoResponse(reply,db.prepare('SELECT photo FROM user_photos WHERE user_id=?').get(user.id)?.photo);
  });
  app.delete('/api/profile/photo', async (request,reply)=>{
    const user=getAuth(request); if(!user) return reply.code(401).send({error:'login_required'});
    db.prepare('DELETE FROM user_photos WHERE user_id=?').run(user.id);
    return {ok:true};
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

  app.get('/auth/:provider/start', async (request, reply) => {
    const provider=request.params.provider;
    if(!['google','microsoft','apple'].includes(provider)) return reply.code(404).send({error:'not_found'});
    const settings={
      google:config.google,
      microsoft:config.microsoft,
      apple:config.apple
    }[provider];
    const configured=provider==='google'?settings.clientId&&settings.clientSecret:
      provider==='microsoft'?settings.clientId&&settings.clientSecret:
      settings.clientId&&settings.teamId&&settings.keyId&&settings.privateKey;
    if(!configured) return reply.code(503).send({error:'provider_not_configured'});

    const state=rid(32);
    const nextPath=String(request.query.next||'/').startsWith('/')?String(request.query.next||'/'):'/';
    db.prepare('INSERT INTO oauth_states(state,provider,next_path,expires_at) VALUES(?,?,?,?)')
      .run(state,provider,nextPath,now()+10*60*1000);
    const callback=`${config.baseUrl}/auth/${provider}/callback`;
    let url;
    if(provider==='google'){
      url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.searchParams.set('client_id',settings.clientId);
      url.searchParams.set('redirect_uri',callback);
      url.searchParams.set('response_type','code');
      url.searchParams.set('scope','openid profile');
      url.searchParams.set('state',state);
    }else if(provider==='microsoft'){
      url=new URL(`https://login.microsoftonline.com/${settings.tenant}/oauth2/v2.0/authorize`);
      url.searchParams.set('client_id',settings.clientId);
      url.searchParams.set('redirect_uri',callback);
      url.searchParams.set('response_type','code');
      url.searchParams.set('scope','openid profile');
      url.searchParams.set('state',state);
    }else{
      url=new URL('https://appleid.apple.com/auth/authorize');
      url.searchParams.set('client_id',settings.clientId);
      url.searchParams.set('redirect_uri',callback);
      url.searchParams.set('response_type','code');
      url.searchParams.set('response_mode','form_post');
      url.searchParams.set('scope','name');
      url.searchParams.set('state',state);
    }
    return reply.redirect(url.toString());
  });

  app.route({
    method:['GET','POST'],
    url:'/auth/:provider/callback',
    handler:async(request,reply)=>{
      const provider=request.params.provider;
      const code=String(request.query.code||request.body?.code||'');
      const state=String(request.query.state||request.body?.state||'');
      const oauth=db.prepare('SELECT * FROM oauth_states WHERE state=? AND provider=?').get(state,provider);
      if(!oauth||oauth.expires_at<now()){
        db.prepare('DELETE FROM oauth_states WHERE state=?').run(state);
        return reply.code(400).send({error:'invalid_login'});
      }
      db.prepare('DELETE FROM oauth_states WHERE state=?').run(state);
      const settings={
        google:config.google,
        microsoft:config.microsoft,
        apple:config.apple
      }[provider];
      const callback=`${config.baseUrl}/auth/${provider}/callback`;
      let tokenUrl, params;
      if(provider==='google'){
        tokenUrl='https://oauth2.googleapis.com/token';
        params={code,client_id:settings.clientId,client_secret:settings.clientSecret,redirect_uri:callback,grant_type:'authorization_code'};
      }else if(provider==='microsoft'){
        tokenUrl=`https://login.microsoftonline.com/${settings.tenant}/oauth2/v2.0/token`;
        params={code,client_id:settings.clientId,client_secret:settings.clientSecret,redirect_uri:callback,grant_type:'authorization_code',scope:'openid profile'};
      }else if(provider==='apple'){
        tokenUrl='https://appleid.apple.com/auth/token';
        const nowSeconds=Math.floor(now()/1000);
        const header=Buffer.from(JSON.stringify({alg:'ES256',kid:settings.keyId})).toString('base64url');
        const claims=Buffer.from(JSON.stringify({iss:settings.teamId,iat:nowSeconds,exp:nowSeconds+300,aud:'https://appleid.apple.com',sub:settings.clientId})).toString('base64url');
        const signer=crypto.createSign('SHA256');
        signer.update(`${header}.${claims}`);
        signer.end();
        let secret;
        try{secret=signer.sign(settings.privateKey).toString('base64url');}catch{return reply.code(503).send({error:'provider_not_configured'});}
        params={code,client_id:settings.clientId,client_secret:`${header}.${claims}.${secret}`,redirect_uri:callback,grant_type:'authorization_code'};
      }else{
        return reply.code(404).send({error:'not_found'});
      }
      const tokenResponse=await fetch(tokenUrl,{
        method:'POST',
        headers:{'content-type':'application/x-www-form-urlencoded','accept':'application/json'},
        body:new URLSearchParams(params)
      });
      if(!tokenResponse.ok)return reply.code(401).send({error:'login_failed'});
      const token=await tokenResponse.json();
      if(!token.id_token)return reply.code(401).send({error:'login_failed'});
      let claims;
      try{claims=JSON.parse(Buffer.from(token.id_token.split('.')[1],'base64url').toString('utf8'));}catch{return reply.code(401).send({error:'login_failed'});}
      const subject=String(claims.sub||'');
      const name=String(claims.name||claims.preferred_username||claims.email?.split('@')[0]||'Besucherin').slice(0,80);
      if(!subject)return reply.code(401).send({error:'login_failed'});
      let user=db.prepare('SELECT * FROM users WHERE provider=? AND subject=?').get(provider,subject);
      if(!user){
        const id=rid(16);
        db.prepare('INSERT INTO users(id,provider,subject,display_name,avatar_url,created_at) VALUES(?,?,?,?,?,?)')
          .run(id,provider,subject,name,claims.picture||null,now());
        user=db.prepare('SELECT * FROM users WHERE id=?').get(id);
      }else{
        db.prepare('UPDATE users SET display_name=?,avatar_url=? WHERE id=?').run(user.name_custom ? user.display_name : name,claims.picture||user.avatar_url,user.id);
      }
      setSession(reply,user.id);
      return reply.redirect(oauth.next_path);
    }
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

  app.get('/api/circles/by-admin/:slug', async (request,reply)=>{
    const circle=db.prepare('SELECT id,name,visitor_slug FROM circles WHERE admin_slug_hash=?').get(sha(request.params.slug));
    if(!circle) return reply.code(404).send({error:'not_found'});
    const auth=requireMember(request,reply,circle.id);
    if(!auth || auth.membership.role!=='admin') return reply.code(404).send({error:'not_found'});
    return circle;
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

  app.get('/api/circles/:circleId/people', async(request,reply)=>{
    const circleId=request.params.circleId;
    const auth=requireMember(request,reply,circleId); if(!auth)return;
    const members=db.prepare(`SELECT u.id,u.display_name,u.avatar_url,up.user_id has_photo
      FROM memberships m JOIN users u ON u.id=m.user_id LEFT JOIN user_photos up ON up.user_id=u.id
      WHERE m.circle_id=? AND m.status='active' ORDER BY u.display_name`).all(circleId);
    const companions=db.prepare('SELECT id,display_name,photo IS NOT NULL has_photo FROM companions WHERE circle_id=? AND owner_id=? ORDER BY display_name').all(circleId,auth.user.id);
    return {
      me:auth.user.id,
      members:members.map(p=>({id:p.id,display_name:p.display_name,avatar_url:p.has_photo ? `/api/circles/${circleId}/photos/users/${p.id}` : p.avatar_url})),
      companions:companions.map(p=>({id:p.id,display_name:p.display_name,avatar_url:p.has_photo ? `/api/circles/${circleId}/photos/companions/${p.id}` : null}))
    };
  });
  app.post('/api/circles/:circleId/companions', async(request,reply)=>{
    const circleId=request.params.circleId;
    const auth=requireMember(request,reply,circleId); if(!auth)return;
    const name=typeof request.body?.name==='string' ? request.body.name.trim() : '';
    if(!name || name.length>80) return reply.code(400).send({error:'invalid_name'});
    const photo=request.body?.photo ? readPhoto(request.body.photo) : null;
    if(request.body?.photo && !photo) return reply.code(400).send({error:'invalid_photo'});
    const id=rid(16);
    db.prepare('INSERT INTO companions(id,circle_id,owner_id,display_name,photo) VALUES(?,?,?,?,?)').run(id,circleId,auth.user.id,name,photo);
    return {id,display_name:name,avatar_url:photo ? `/api/circles/${circleId}/photos/companions/${id}` : null};
  });
  app.put('/api/circles/:circleId/companions/:companionId', async(request,reply)=>{
    const {circleId,companionId}=request.params;
    const auth=requireMember(request,reply,circleId); if(!auth)return;
    const companion=db.prepare('SELECT * FROM companions WHERE id=? AND circle_id=? AND owner_id=?').get(companionId,circleId,auth.user.id);
    if(!companion) return reply.code(404).send({error:'not_found'});
    const name=typeof request.body?.name==='string' ? request.body.name.trim() : '';
    if(!name || name.length>80) return reply.code(400).send({error:'invalid_name'});
    const photo=request.body?.photo ? readPhoto(request.body.photo) : request.body?.remove_photo ? null : companion.photo;
    if(request.body?.photo && !photo) return reply.code(400).send({error:'invalid_photo'});
    db.prepare('UPDATE companions SET display_name=?,photo=? WHERE id=? AND circle_id=? AND owner_id=?').run(name,photo,companionId,circleId,auth.user.id);
    return {id:companionId,display_name:name,avatar_url:photo ? `/api/circles/${circleId}/photos/companions/${companionId}` : null};
  });
  app.get('/api/circles/:circleId/photos/users/:userId', async(request,reply)=>{
    const {circleId,userId}=request.params;
    if(!canViewCircle(request,circleId)) return reply.code(404).send({error:'not_found'});
    const visible=db.prepare(`SELECT 1 FROM memberships WHERE circle_id=? AND user_id=? AND status='active'
      UNION ALL SELECT 1 FROM visits v LEFT JOIN visit_participants p ON p.visit_id=v.id
      WHERE v.circle_id=? AND (v.user_id=? OR p.user_id=?) LIMIT 1`).get(circleId,userId,circleId,userId,userId);
    if(!visible) return reply.code(404).send({error:'not_found'});
    return photoResponse(reply,db.prepare('SELECT photo FROM user_photos WHERE user_id=?').get(userId)?.photo);
  });
  app.get('/api/circles/:circleId/photos/companions/:companionId', async(request,reply)=>{
    const {circleId,companionId}=request.params;
    if(!canViewCircle(request,circleId)) return reply.code(404).send({error:'not_found'});
    const user=getAuth(request);
    const photo=db.prepare(`SELECT c.photo FROM companions c WHERE c.id=? AND c.circle_id=?
      AND (c.owner_id=? OR EXISTS (SELECT 1 FROM visit_participants p JOIN visits v ON v.id=p.visit_id WHERE p.companion_id=c.id AND v.circle_id=c.circle_id))`)
      .get(companionId,circleId,user?.id || '');
    return photoResponse(reply,photo?.photo);
  });

  app.get('/api/circles/:circleId/visits', async(request,reply)=>{
    const device=deviceAuth(request);
    if(device?.circle_id!==request.params.circleId) {
      const auth=requireMember(request,reply,request.params.circleId);
      if(!auth) return;
    }
    const visits=db.prepare('SELECT v.*,u.display_name,u.avatar_url FROM visits v JOIN users u ON u.id=v.user_id WHERE v.circle_id=? ORDER BY date,start_time').all(request.params.circleId);
    return {visits:visits.map(v=>visitWithPeople(v,request.params.circleId))};
  });

  app.post('/api/circles/:circleId/visits', async(request,reply)=>{
    const auth=requireMember(request,reply,request.params.circleId); if(!auth)return;
    const b=request.body||{}; const date=/^\d{4}-\d{2}-\d{2}$/.test(String(b.date))?b.date:'';
    const start=String(b.start_time||''); const end=String(b.end_time||start);
    if(!date||!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end)) return reply.code(400).send({error:'invalid_visit'});
    if(end<start) return reply.code(400).send({error:'invalid_time_range'});
    const participants=b.participants===undefined ? [] : b.participants;
    if(!validateParticipants(request.params.circleId,auth.user.id,participants)) return reply.code(400).send({error:'invalid_participants'});
    const id=rid(16);
    db.transaction(()=>{
      db.prepare('INSERT INTO visits(id,circle_id,user_id,date,start_time,end_time,template,note,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(id,request.params.circleId,auth.user.id,date,start,end,b.template?String(b.template).slice(0,20):null,String(b.note||'').slice(0,280),now());
      saveParticipants(id,participants);
    })();
    await pushCircle(db,request.params.circleId,{title:'Neuer Besuch',body:'Jemand hat einen Besuch angekündigt.'});
    return visitWithPeople(db.prepare('SELECT v.*,u.display_name,u.avatar_url FROM visits v JOIN users u ON u.id=v.user_id WHERE v.id=? AND v.circle_id=?').get(id,request.params.circleId),request.params.circleId);
  });

  app.put('/api/circles/:circleId/visits/:visitId', async(request,reply)=>{
    const auth=requireMember(request,reply,request.params.circleId); if(!auth)return;
    const visit=db.prepare('SELECT * FROM visits WHERE id=? AND circle_id=?').get(request.params.visitId,request.params.circleId);
    if(!visit) return reply.code(404).send({error:'not_found'});
    if(auth.membership.role!=='admin' && visit.user_id!==auth.user.id) return reply.code(403).send({error:'forbidden'});
    const b=request.body||{}, date=/^\d{4}-\d{2}-\d{2}$/.test(String(b.date||visit.date))?(b.date||visit.date):visit.date;
    const start=String(b.start_time||visit.start_time), end=String(b.end_time||visit.end_time);
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end)||end<start) return reply.code(400).send({error:'invalid_visit'});
    if(b.participants!==undefined && !validateParticipants(request.params.circleId,visit.user_id,b.participants)) return reply.code(400).send({error:'invalid_participants'});
    db.transaction(()=>{
      db.prepare('UPDATE visits SET date=?,start_time=?,end_time=?,template=?,note=? WHERE id=? AND circle_id=?')
        .run(date,start,end,b.template===undefined?visit.template:String(b.template).slice(0,20),b.note===undefined?visit.note:String(b.note).slice(0,280),request.params.visitId,request.params.circleId);
      if(b.participants!==undefined) {
        db.prepare('DELETE FROM visit_participants WHERE visit_id=?').run(visit.id);
        saveParticipants(visit.id,b.participants);
      }
    })();
    await pushCircle(db,request.params.circleId,{title:'Besuch geändert',body:'Ein Besuch wurde aktualisiert.'});
    return visitWithPeople(db.prepare('SELECT v.*,u.display_name,u.avatar_url FROM visits v JOIN users u ON u.id=v.user_id WHERE v.id=? AND v.circle_id=?').get(request.params.visitId,request.params.circleId),request.params.circleId);
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
