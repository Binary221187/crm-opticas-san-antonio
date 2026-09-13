import {env} from 'cloudflare:workers';
import {cookies} from 'next/headers';
import {getChatGPTUser} from '@/app/chatgpt-auth';
export const db=()=>{if(!env.DB)throw new Error('Base de datos no disponible.');return env.DB};
export const scope=(u:any,b:string)=>u.role==='desarrollador'||u.branches.includes(b);
export const publicUser=(u:any)=>({id:u.id,username:u.username,name:u.name,role:u.role,active:!!u.active,permissions:JSON.parse(u.permissions),branches:JSON.parse(u.branches)});
export async function digest(s:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),x=>x.toString(16).padStart(2,'0')).join('')}
export async function me(){const token=(await cookies()).get('osa_session')?.value;if(!token)return null;const u=await db().prepare('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.id=? AND s.expires>? AND u.active=1').bind(await digest(token),Date.now()).first();return u?publicUser(u):null}
export async function gate(): Promise<void> {
  // Sin gate de ChatGPT: acceso libre
  return;
}
