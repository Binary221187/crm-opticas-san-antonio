import { env } from 'cloudflare:workers';
import { db } from '@/lib/server-auth';
import { State, isAvailable, minuteOf, today } from '@/lib/model';

export async function GET(request: Request) {
  const secret = String(env.BOOKING_SYNC_SECRET || '');
  if (secret.length < 32 || request.headers.get('authorization') !== `Bearer ${secret}`) return Response.json({ error: 'No autorizado.' }, { status: 401 });
  const row: any = await db().prepare('SELECT data FROM workspace WHERE id=1').first(); if (!row) return Response.json({ slots: [] });
  const state = JSON.parse(row.data) as State; const users = await db().prepare("SELECT id,name,branches FROM users WHERE role='tecnologo' AND active=1").all();
  const slots: any[] = []; const base = today(); const currentTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  for (let day = 0; day < 30; day++) { const d = new Date(base + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + day); const date = d.toISOString().slice(0, 10);
    for (const provider of users.results as any[]) for (const branchId of JSON.parse(provider.branches)) { const branch = state.branches.find(x => x.id === branchId && x.active !== false); if (!branch) continue;
      for (let minute = 8 * 60; minute <= 20 * 60; minute += 30) { const time = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`; if (day === 0 && time <= currentTime) continue;
        if (!isAvailable(state.schedules || [], provider.id, branchId, date, time, 30)) continue;
        const busy = (state.appointments || []).some(a => a.providerId === provider.id && a.date === date && a.status !== 'Cancelada' && minuteOf(a.time) < minute + 30 && minuteOf(a.time) + a.duration > minute); if (busy) continue;
        slots.push({ slotKey: `${branchId}|${provider.id}|${date}|${time}`, branchId, branchName: branch.name, providerId: provider.id, providerName: provider.name, date, time, expiresAt: new Date(Date.now() + 120000).toISOString() });
      }
    }
  }
  return Response.json({ slots }, { headers: { 'Cache-Control': 'no-store' } });
}
