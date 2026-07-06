// oauth-bridge.js — OAuth 2.0 / OIDC login bridge
const fs=require("fs");const path=require("path");const crypto=require("crypto");const https=require("https");
const BASE=path.resolve(__dirname,"..");
const JWT_SECRET=process.env.JWT_SECRET||process.env.JWT_SECRECT||"ecompany-dev-secret-key-2026";
function signJWT(p){var h={alg:"HS256",typ:"JWT"};var n=Math.floor(Date.now()/1000);var d=Object.assign({},p,{iat:n,exp:n+86400});var b64=function(o){return Buffer.from(JSON.stringify(o)).toString("base64url")};var s=crypto.createHmac("sha256",JWT_SECRET).update(b64(h)+"."+b64(d)).digest("base64url");return b64(h)+"."+b64(d)+"."+s}
function verifyJWT(t){try{var p=t.split(".");if(p.length!==3)return null;var s=crypto.createHmac("sha256",JWT_SECRET).update(p[0]+"."+p[1]).digest("base64url");if(s!==p[2])return null;var pl=JSON.parse(Buffer.from(p[1],"base64url").toString());if(pl.exp<Date.now()/1000)return null;return pl}catch(e){return null}}
function registerRoutes(rr,pb,json){
rr(["GET"],/^\/api\/security\/status$/,function(r,s){json(s,{ok:true,https:r.socket&&r.socket.encrypted,jwt:{configured:JWT_SECRET!=="ecompany_jwt_2026"},oauth:[],recommendations:["Set JWT_SECRET env var","Configure GOOGLE_CLIENT_ID","Deploy behind Nginx with SSL"]})});
rr(["GET"],/^\/api\/oauth\/providers$/,function(r,s){json(s,{ok:true,providers:[]})});
rr(["POST"],/^\/api\/auth\/verify$/,async function(r,s){var b=await pb(r);var p=verifyJWT(b.token||"");if(p)json(s,{ok:true,verified:true,user:p});else json(s,{ok:false,verified:false},401)});
rr(["GET"],/^\/api\/auth\/me$/,function(r,s){var auth=r.headers["authorization"]||"";var tk;if(auth.startsWith("***"))tk=auth.slice(3);else if(auth.startsWith("Bearer "))tk=auth.slice(7);else tk="";var u=new URL(r.url,"http://"+(r.headers.host||"localhost"));var t=verifyJWT(tk||u.searchParams.get("token")||"");if(t)json(s,{ok:true,loggedIn:true,user:t});else json(s,{ok:false,loggedIn:false,user:null},401)});
}
module.exports={registerRoutes:registerRoutes,verifyJWT:verifyJWT,signJWT:signJWT};
