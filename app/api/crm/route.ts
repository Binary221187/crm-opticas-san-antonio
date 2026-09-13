import { appendConsent } from '@/lib/patient-consent';
import { env } from 'cloudflare:workers';
import { cookies } from 'next/headers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { defaults, roles, modules, initialState, State, Row, allowed, expandedPermissions, ageAt, isAvailable, minuteOf, today } from '@/lib/model';
import { db, scope, publicUser, digest, me, gate } from '@/lib/server-auth';
function fail(message: string, status = 400): never { throw Object.assign(new Error(message), { status }); }
const clean = (x: any, max = 300) => String(x ?? '').trim().slice(0, max);
const required = (x: any, label: string) => { const s = clean(x); if (!s)
    fail(`Completa ${label}.`); return s; };
const num = (x: any, min = 0, max = 1e9) => { const n = Number(x); if (!Number.isFinite(n) || n < min || n > max)
    fail('Valor numérico fuera de rango.'); return n; };
const integer = (x: any, min = 0, max = 1e9) => { const n = num(x, min, max); if (!Number.isInteger(n))
    fail('Ingresa un número entero.'); return n; };
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');
async function hash(password: string, salt = crypto.randomUUID()) { const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']); return salt + ':' + hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256)); }
async function check(p: string, h: string) { const v = await hash(p, h.split(':')[0]); let diff = v.length ^ h.length; for (let i = 0; i < v.length; i++)
    diff |= v.charCodeAt(i) ^ (h.charCodeAt(i) || 0); return diff === 0; }
const can = allowed;
async function snapshot(state: State, version: number) { if (!env.BUCKET)
    return; const now = new Date(), slot = Math.floor(now.getUTCMinutes() / 15) * 15, stamp = `${now.toISOString().slice(0, 13)}-${String(slot).padStart(2, '0')}`; const body = JSON.stringify({ exportedAt: now.toISOString(), version, state }); try {
    await Promise.all([env.BUCKET.put('workspace-backups/latest.json', body, { httpMetadata: { contentType: 'application/json' } }), env.BUCKET.put(`workspace-backups/${stamp}.json`, body, { httpMetadata: { contentType: 'application/json' } })]);
}
catch (e) {
    console.error('No se pudo guardar el respaldo automático.', e);
} }
async function commit(state: State, version: number) { const saved = await db().prepare('UPDATE workspace SET data=?,version=version+1 WHERE id=1 AND version=?').bind(JSON.stringify(state), version).run(); if (!saved.meta.changes)
    fail('Otro usuario actualizó los datos. Recarga y vuelve a intentar.', 409); await snapshot(state, version + 1); }
async function load() { const r: any = await db().prepare('SELECT * FROM workspace WHERE id=1').first(); if (!r)
    fail('Completa la configuración inicial.', 409); const state = JSON.parse(r.data) as State; for (const k of ['schedules', 'movements', 'reminders', 'cash', 'providers', 'purchases'])
    state[k] ||= []; return { state, version: r.version }; }
let lastAvailabilityPush = 0;
const syncConfig = () => ({ url: String(env.PUBLIC_BOOKING_URL || '').replace(/\/$/, ''), secret: String(env.BOOKING_SYNC_SECRET || '') });
async function bookingRequest(path: string, init: RequestInit = {}) { const { url, secret } = syncConfig(); if (!url || secret.length < 32) return null; return fetch(url + path, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}`, ...(init.headers || {}) } }); }
async function syncPublicBookings(loaded: { state: State; version: number }) {
    const { state: s, version } = loaded; const result = await bookingRequest('/api/booking-sync'); if (!result?.ok) return loaded;
    const data: any = await result.json(); const bookings = Array.isArray(data.bookings) ? data.bookings : []; if (!bookings.length) return loaded;
    const users = await db().prepare("SELECT id,name,role,branches,active FROM users WHERE role='tecnologo' AND active=1").all();
    const outcomes: any[] = []; let changed = false; const now = new Date().toISOString();
    for (const b of bookings) {
        const provider: any = users.results.find((x: any) => x.id === b.provider_id && JSON.parse(x.branches).includes(b.branch_id));
        const branch = s.branches.find(x => x.id === b.branch_id && x.active !== false); const duration = 30;
        const conflict = s.appointments.some(a => a.providerId === b.provider_id && a.date === b.date && a.status !== 'Cancelada' && minuteOf(a.time) < minuteOf(b.time) + duration && minuteOf(a.time) + a.duration > minuteOf(b.time));
        if (!provider || !branch || b.date < today() || !isAvailable(s.schedules, b.provider_id, b.branch_id, b.date, b.time, duration) || conflict) { outcomes.push({ id: b.id, status: 'rejected' }); continue; }
        const rut = clean(b.rut); const key = rut.replace(/[^0-9k]/gi, '').toLowerCase(); let patient = s.patients.find(p => p.branchId === b.branch_id && p.rut?.replace(/[^0-9k]/gi, '').toLowerCase() === key);
        if (!patient) { patient = { id: crypto.randomUUID(), branchId: b.branch_id, name: clean(b.full_name), rut, phone: clean(b.phone), birthDate: clean(b.birth_date), age: ageAt(clean(b.birth_date)), insurer: clean(b.insurance), reminderConsent: false, active: true, source: 'Reserva web', createdAt: now, updatedAt: now }; s.patients.push(patient); }
        else { Object.assign(patient, { name: clean(b.full_name), phone: clean(b.phone), birthDate: clean(b.birth_date), age: ageAt(clean(b.birth_date)), insurer: clean(b.insurance), active: true, updatedAt: now }); }
        s.appointments.push({ id: crypto.randomUUID(), branchId: b.branch_id, patientId: patient.id, providerId: b.provider_id, date: b.date, time: b.time, duration, reason: clean(b.service) || 'Reserva web', status: 'Pendiente', source: 'Página web', createdAt: now, updatedAt: now });
        s.audit.push({ id: crypto.randomUUID(), date: now, userId: 'public-web', action: 'create', kind: 'appointments', recordId: b.id }); outcomes.push({ id: b.id, status: 'synced' }); changed = true;
    }
    if (changed) { try { await commit(s, version); loaded = { state: s, version: version + 1 }; } catch { return loaded; } }
    if (outcomes.length) await bookingRequest('/api/booking-sync', { method: 'PATCH', body: JSON.stringify({ results: outcomes }) });
    return loaded;
}
async function publishAvailability(s: State) {
    if (Date.now() - lastAvailabilityPush < 60000) return; lastAvailabilityPush = Date.now();
    const users = await db().prepare("SELECT id,name,branches FROM users WHERE role='tecnologo' AND active=1").all(); const slots: any[] = []; const base = today();
    for (let day = 0; day < 30; day++) { const d = new Date(base + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + day); const date = d.toISOString().slice(0, 10);
        for (const provider of users.results as any[]) for (const branchId of JSON.parse(provider.branches)) { const branch = s.branches.find(x => x.id === branchId && x.active !== false); if (!branch) continue;
            for (let minute = 8 * 60; minute <= 20 * 60; minute += 30) { const time = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`; if (day === 0 && time <= new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())) continue;
                if (!isAvailable(s.schedules, provider.id, branchId, date, time, 30)) continue; const busy = s.appointments.some(a => a.providerId === provider.id && a.date === date && a.status !== 'Cancelada' && minuteOf(a.time) < minute + 30 && minuteOf(a.time) + a.duration > minute); if (busy) continue;
                slots.push({ slotKey: `${branchId}|${provider.id}|${date}|${time}`, branchId, branchName: branch.name, providerId: provider.id, providerName: provider.name, date, time, expiresAt: new Date(Date.now() + 120000).toISOString() });
            }
        }
    }
    const response = await bookingRequest('/api/booking-sync', { method: 'POST', body: JSON.stringify({ slots }) }); if (!response?.ok) lastAvailabilityPush = 0;
}
function visible(s: State, u: Row) { const result: State = {}; for (const k of Object.keys(modules)) {
    result[k] = can(u, k) ? s[k].filter(r => k === 'branches' ? scope(u, r.id) : scope(u, r.branchId)) : [];
} result.branches = s.branches.filter(r => scope(u, r.id)).map(({ id, name, address, phone, active, logoKey }) => ({ id, name, address, phone, active, logoKey })); if (can(u, 'appointments') || u.role === 'tecnologo')
    result.schedules = s.schedules.filter(r => scope(u, r.branchId)); if (can(u, 'reminders'))
    result.appointments = s.appointments.filter(r => scope(u, r.branchId)); if (!can(u, 'patients') && ['clinical', 'jobs', 'sales', 'appointments', 'reminders'].some(k => can(u, k)))
    result.patients = s.patients.filter(r => scope(u, r.branchId)).map(r => ({ id: r.id, name: r.name, branchId: r.branchId, active: r.active, ...(can(u, 'clinical') ? { rut: r.rut, birthDate: r.birthDate, age: r.age } : {}) })); if ((can(u, 'sales') || can(u, 'movements')) && !can(u, 'products'))
    result.products = s.products.filter(r => scope(u, r.branchId)); if (u.role === 'desarrollador')
    result.audit = s.audit.slice(-500); return result; }
const response = (x: any, status = 200) => Response.json(x, { status, headers: { 'Cache-Control': 'no-store' } });
export async function GET() { try {
    // Sin gate de ChatGPT: login directo por cookie
    const count: any = await db().prepare('SELECT COUNT(*) AS n FROM users').first();
    if (!count.n)
        return response({ setup: true });
    const user = await me();
    if (!user)
        return response({ login: true });
    let { state, version } = await syncPublicBookings(await load());
    await publishAvailability(state);
    const users = await db().prepare('SELECT id,name,role,branches,active,username,permissions FROM users').all();
    return response({ user, version, state: visible(state, user), users: users.results.filter((r: any) => user.role === 'desarrollador' || JSON.parse(r.branches).some((b: string) => scope(user, b))).map((r: any) => user.role === 'desarrollador' ? publicUser(r) : { id: r.id, name: r.name, role: r.role, branches: JSON.parse(r.branches), active: !!r.active }) });
}
catch (e: any) {
    console.error(e.message);
    return response({ error: e.status ? e.message : 'No se pudo cargar el CRM. Inténtalo nuevamente.' }, e.status || 503);
} }
export async function POST(req: Request) {
    try {
        // Sin gate de ChatGPT: login directo por cookie
        const origin = req.headers.get('origin');
        if (!origin || origin !== new URL(req.url).origin)
            fail('Origen de solicitud no válido.', 403);
        if (Number(req.headers.get('content-length')) > 100000)
            fail('Solicitud demasiado grande.');
        const { action, data = {} } = await req.json() as any;
        if (action === 'setup' || action === 'login') {
            const username = required(data.username, 'usuario').toLowerCase();
            const password = required(data.password, 'contraseña');
            let row: any;
            if (action === 'setup') {
                if (password.length < 12)
                    fail('Usa una contraseña de al menos 12 caracteres.');
                const h = await hash(password);
                const id = 'owner';
                const result = await db().batch([db().prepare("INSERT INTO users (id,username,name,role,password,permissions,branches) SELECT ?,?,?, 'desarrollador',?,?,? WHERE NOT EXISTS(SELECT 1 FROM users)").bind(id, username, required(data.name, 'nombre'), h, JSON.stringify(defaults.desarrollador), JSON.stringify(['central'])), db().prepare('INSERT OR IGNORE INTO workspace(id,version,data) VALUES(1,0,?)').bind(JSON.stringify(initialState()))]);
                if (!result[0].meta.changes)
                    fail('El CRM ya fue configurado.', 409);
                row = await db().prepare('SELECT * FROM users WHERE id=?').bind(id).first();
            }
            else {
                row = await db().prepare('SELECT * FROM users WHERE username=?').bind(username).first();
                if (!row) {
                    await hash(password, 'dummy-constant-salt');
                    fail('Usuario o contraseña incorrectos.', 401);
                }
                if (row.locked_until > Date.now())
                    fail('Demasiados intentos. Espera 15 minutos.', 429);
                if (!row.active || !await check(password, row.password)) {
                    await db().prepare('UPDATE users SET failures=failures+1, locked_until=CASE WHEN failures>=4 THEN ? ELSE 0 END WHERE id=?').bind(Date.now() + 900000, row.id).run();
                    fail('Usuario o contraseña incorrectos.', 401);
                }
                await db().prepare('UPDATE users SET failures=0,locked_until=0 WHERE id=?').bind(row.id).run();
            }
            const token = crypto.randomUUID() + crypto.randomUUID();
            await db().prepare('INSERT INTO sessions(id,user_id,expires) VALUES(?,?,?)').bind(await digest(token), row.id, Date.now() + 28800000).run();
            (await cookies()).set('osa_session', token, { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: 28800 });
            return response({ ok: true });
        }
        const u = await me();
        if (!u)
            fail('La sesión terminó. Vuelve a ingresar.', 401);
        if (action === 'logout') {
            const c = await cookies();
            const token = c.get('osa_session')?.value;
            if (token)
                await db().prepare('DELETE FROM sessions WHERE id=?').bind(await digest(token)).run();
            c.delete('osa_session');
            return response({ ok: true });
        }
        const { state: s, version } = await load();
        if (action === 'user') {
            if (u!.role !== 'desarrollador')
                fail('Solo el desarrollador administra usuarios y permisos.', 403);
            const role = clean(data.role);
            if (!roles.includes(role))
                fail('Rol no válido.');
            const permissions = Array.isArray(data.permissions) ? expandedPermissions(data.permissions) : defaults[role];
            const branches = Array.isArray(data.branches) ? data.branches.filter((b: string) => s.branches.some(x => x.id === b)) : [];
            if (role !== 'desarrollador' && !branches.length)
                fail('Asigna al menos una sucursal.');
            const id = data.id || crypto.randomUUID();
            const existing: any = await db().prepare('SELECT * FROM users WHERE id=?').bind(id).first();
            if (id === u!.id && (role !== 'desarrollador' || data.active === false))
                fail('No puedes retirar tu propio acceso de desarrollador.');
            const p = clean(data.password);
            if ((!existing || p) && p.length < 12)
                fail('Usa una contraseña de al menos 12 caracteres.');
            await db().prepare('INSERT INTO users(id,username,name,role,password,permissions,branches,active) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET username=excluded.username,name=excluded.name,role=excluded.role,password=excluded.password,permissions=excluded.permissions,branches=excluded.branches,active=excluded.active').bind(id, required(data.username, 'usuario').toLowerCase(), required(data.name, 'nombre'), role, p ? await hash(p) : existing.password, JSON.stringify(permissions), JSON.stringify(branches), data.active === false ? 0 : 1).run();
            await db().prepare('DELETE FROM sessions WHERE user_id=?').bind(id).run();
            return response({ ok: true });
        }
        if (action === 'backup') {
            if (u!.role !== 'desarrollador') fail('Solo el desarrollador puede descargar respaldos.', 403);
            return response({ ok: true, exportedAt: new Date().toISOString(), state: s });
        }
        if (action === 'import') {
            if (u!.role !== 'desarrollador') fail('Solo el desarrollador puede importar datos.', 403);
            const incoming = data.state;
            if (!incoming || !Array.isArray(incoming.patients) || !Array.isArray(incoming.products)) fail('El archivo de respaldo no tiene un formato válido.');
            for (const k of ['patients', 'products']) for (const row of incoming[k].slice(0, 5000)) {
                if (!row?.id || !row.branchId || !s.branches.some(b => b.id === row.branchId)) continue;
                const index = s[k].findIndex((x: Row) => x.id === row.id);
                if (index >= 0) s[k][index] = row; else s[k].push(row);
            }
            s.audit.push({ id: crypto.randomUUID(), date: new Date().toISOString(), userId: u!.id, action, kind: 'data', recordId: null });
            await commit(s, version);
            return response({ ok: true });
        }
        if (action === 'import-patients') {
            if (u!.role !== 'desarrollador') fail('Solo el desarrollador puede importar pacientes.', 403);
            const branchId = clean(data.branchId);
            if (!s.branches.some(b => b.id === branchId && b.active !== false)) fail('Selecciona una sucursal habilitada.');
            if (!Array.isArray(data.patients) || data.patients.length > 5000) fail('El archivo debe incluir entre 1 y 5.000 pacientes.');
            let imported = 0, skipped = 0;
            const normalizeRut = (v: any) => clean(v).replace(/[^0-9k]/gi, '').toLowerCase();
            for (const incoming of data.patients) {
                const name = clean(incoming.name); const rut = clean(incoming.rut); const normalized = normalizeRut(rut);
                if (!name || (normalized && s.patients.some(p => normalizeRut(p.rut) === normalized))) { skipped++; continue; }
                s.patients.push({ id: crypto.randomUUID(), branchId, name, rut, phone: clean(incoming.phone), email: clean(incoming.email), birthDate: clean(incoming.birthDate), age: incoming.age === '' || incoming.age === undefined ? null : integer(incoming.age, 0, 129), reminderConsent: incoming.reminderConsent === true, active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), importedBy: u!.name }); imported++;
            }
            s.audit.push({ id: crypto.randomUUID(), date: new Date().toISOString(), userId: u!.id, action, kind: 'patients', recordId: null });
            await commit(s, version);
            return response({ ok: true, imported, skipped });
        }
        const kind = clean(data.kind);
        const operation = action === 'delete' ? 'delete' : data.id ? 'update' : 'create';
        if (!modules[kind] || !can(u!, kind, operation))
            fail('No tienes permiso para esta acción.', 403);
        if (action === 'payment') {
            if (kind !== 'sales' || !can(u!, 'sales', 'create'))
                fail('No tienes permiso para registrar abonos.', 403);
            const branchId = clean(data.branchId);
            if (!scope(u!, branchId))
                fail('No tienes acceso a esta sucursal.', 403);
            const sale = s.sales.find(x => x.id === data.saleId && x.branchId === branchId);
            if (!sale)
                fail('Venta no encontrada.', 404);
            const key = required(data.key, 'referencia de abono');
            if ((sale.payments || []).some((p: Row) => p.key === key))
                return response({ ok: true, sale });
            const amount = integer(data.amount, 1, sale.balance || 0);
            const method = clean(data.method);
            if (!['Efectivo', 'Tarjeta', 'Transferencia'].includes(method))
                fail('Medio de pago inválido.');
            sale.payments = [...(sale.payments || []), { id: crypto.randomUUID(), key, amount, method, date: new Date().toISOString(), author: u!.name }];
            sale.paid = (sale.paid ?? sale.received ?? 0) + amount;
            sale.balance = Math.max(0, sale.total - sale.paid);
            sale.status = sale.balance === 0 ? 'Pagada' : 'Abono pendiente';
            sale.lastPaymentMethod = method;
            sale.updatedAt = new Date().toISOString();
            s.audit.push({ id: crypto.randomUUID(), date: sale.updatedAt, userId: u!.id, action, kind, recordId: sale.id });
            await commit(s, version);
            return response({ ok: true, sale });
        }
        if (action === 'void-sale' || action === 'deliver-job') {
            const targetKind = action === 'void-sale' ? 'sales' : 'jobs';
            if (!can(u!, targetKind, 'update')) fail('No tienes permiso para esta acción.', 403);
            const record = s[targetKind].find(x => x.id === data.id);
            if (!record || !scope(u!, record.branchId)) fail('Registro no encontrado.', 404);
            if (action === 'void-sale') {
                if (!record.voidedAt) {
                    for (const item of record.items || []) { const p = s.products.find(x => x.id === item.id && x.branchId === record.branchId); if (p) { p.stock += item.qty; p.updatedAt = new Date().toISOString(); s.movements.push({ id: crypto.randomUUID(), branchId: record.branchId, productId: p.id, productName: p.name, delta: item.qty, balance: p.stock, reason: 'Anulación venta #' + record.number, author: u!.name, createdAt: new Date().toISOString() }); } }
                    Object.assign(record, { voidedAt: new Date().toISOString(), voidedBy: u!.name, voidReason: required(data.reason, 'motivo de anulación'), status: 'Anulada', balance: 0 });
                }
            } else {
                const now = new Date().toISOString(), recipient = required(data.recipient, 'nombre de quien recibe');
                const note = clean(data.note, 1000), fitNotes = clean(data.fitNotes, 1000);
                Object.assign(record, { status: 'Entregado', deliveredAt: now, deliveredBy: u!.name, deliveredTo: recipient, deliveryNote: note, fitNotes, timeline: [...(record.timeline || []), { status: 'Entregado', note: [recipient, note, fitNotes].filter(Boolean).join(' · '), date: now, author: u!.name }] });
            }
            s.audit.push({ id: crypto.randomUUID(), date: new Date().toISOString(), userId: u!.id, action, kind: targetKind, recordId: record.id });
            await commit(s, version);
            return response({ ok: true, sale: action === 'void-sale' ? record : undefined, job: action === 'deliver-job' ? record : undefined });
        }
        const old = s[kind].find(r => r.id === data.id);
        if (data.id && !old)
            fail('Registro no encontrado.', 404);
        if (old && !scope(u!, kind === 'branches' ? old.id : old.branchId))
            fail('No tienes acceso a esta sucursal.', 403);
        if (old && data.updatedAt && old.updatedAt !== data.updatedAt)
            fail('Este registro cambió. Cierra el formulario, revisa los cambios y vuelve a editar.', 409);
        if (action === 'delete') {
            if (kind === 'schedules') {
                if (u!.role !== 'desarrollador' && old!.providerId !== u!.id)
                    fail('Solo puedes editar tus propios horarios.', 403);
                const proposed = s.schedules.filter(x => x.id !== old!.id);
                if (s.appointments.some(a => a.providerId === old!.providerId && a.date >= today() && !['Cancelada', 'Completada'].includes(a.status) && !isAvailable(proposed, a.providerId, a.branchId, a.date, a.time, a.duration)))
                    fail('Este cambio dejaría citas fuera del horario. Reagenda esas citas primero.');
                s.schedules = proposed;
            }
            else {
                if (kind !== 'patients')
                    fail('Esta eliminación no está disponible.');
                if (s.clinical.some(x => x.patientId === old!.id) || s.sales.some(x => x.patientId === old!.id) || s.jobs.some(x => x.patientId === old!.id) || s.appointments.some(x => x.patientId === old!.id))
                    fail('Este paciente tiene historial o movimientos. Puedes desactivarlo para conservar sus registros.');
                s.patients = s.patients.filter(x => x.id !== old!.id);
            }
        }
        else if (action === 'save') {
            const r: Row = { id: old?.id || crypto.randomUUID(), branchId: clean(data.branchId), createdAt: old?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
            if (kind !== 'branches' && (!s.branches.some(b => b.id === r.branchId && b.active !== false) || !scope(u!, r.branchId)))
                fail('Selecciona una sucursal habilitada.', 403);
            if (old && kind === 'patients' && old.branchId !== r.branchId && ['clinical', 'appointments', 'sales', 'jobs'].some(k => s[k].some(x => x.patientId === old.id)))
                fail('No se puede cambiar de sucursal un paciente con movimientos asociados.');
            if (kind === 'branches') {
                Object.assign(r, { name: required(data.name, 'nombre'), address: clean(data.address), phone: clean(data.phone), active: data.active !== false, logoKey: old?.logoKey || null });
                if (data.active === false && s.branches.filter(b => b.active !== false && b.id !== r.id).length === 0)
                    fail('Debe existir una sucursal activa.');
            }
            else if (kind === 'patients') {
                r.consents = appendConsent(old?.consents || [], data.consentEntry, u!);
                Object.assign(r, { name: required(data.name, 'nombre'), rut: clean(data.rut), phone: clean(data.phone), email: clean(data.email), birthDate: clean(data.birthDate), age: data.age === '' || data.age === undefined ? null : integer(data.age, 0, 129), insurer: clean(data.insurer, 20), reminderConsent: data.reminderConsent === true, active: data.active !== false });
                if (r.birthDate && (!/^\d{4}-\d{2}-\d{2}$/.test(r.birthDate) || r.birthDate > today()))
                    fail('Fecha de nacimiento inválida.');
                if (r.rut && s.patients.some(p => p.id !== r.id && p.rut.replace(/[^0-9k]/gi, '').toLowerCase() === r.rut.replace(/[^0-9k]/gi, '').toLowerCase()))
                    fail('Ya existe un paciente con ese RUT.');
            }
            else if (kind === 'providers') {
                Object.assign(r, { name: required(data.name, 'proveedor'), contact: clean(data.contact), phone: clean(data.phone), email: clean(data.email), notes: clean(data.notes, 2000), active: data.active !== false });
            }
            else if (kind === 'purchases') {
                if (old) fail('Una recepción no puede editarse. Registra un ajuste compensatorio.');
                const product = s.products.find(p => p.id === data.productId && p.branchId === r.branchId && p.active !== false);
                if (!product) fail('Selecciona un producto activo de la sucursal.');
                const provider = s.providers.find(p => p.id === data.providerId && p.branchId === r.branchId);
                if (!provider) fail('Selecciona un proveedor de la sucursal.');
                const qty = integer(data.qty, 1, 100000), unitCost = integer(data.unitCost, 0);
                product.stock += qty; product.updatedAt = new Date().toISOString();
                s.movements.push({ id: crypto.randomUUID(), branchId: r.branchId, productId: product.id, productName: product.name, delta: qty, balance: product.stock, reason: 'Recepción ' + (clean(data.reference) || 'sin folio'), providerId: provider.id, author: u!.name, createdAt: new Date().toISOString() });
                Object.assign(r, { providerId: provider.id, providerName: provider.name, productId: product.id, productName: product.name, qty, unitCost, total: qty * unitCost, reference: clean(data.reference), receivedAt: clean(data.receivedAt) || today(), author: u!.name });
            }
            else if (kind === 'products') {
                Object.assign(r, { name: required(data.name, 'producto'), sku: required(data.sku, 'código SKU'), barcode: clean(data.barcode), category: clean(data.category), price: integer(data.price), stock: integer(data.stock), minStock: integer(data.minStock), active: data.active !== false });
                const delta = r.stock - (old?.stock || 0);
                if (delta)
                    s.movements.push({ id: crypto.randomUUID(), branchId: r.branchId, productId: r.id, productName: r.name, delta, balance: r.stock, reason: old ? 'Ajuste desde ficha de producto' : 'Stock inicial', author: u!.name, createdAt: new Date().toISOString() });
                if (s.products.some(p => p.id !== r.id && p.branchId === r.branchId && (p.sku === r.sku || (r.barcode && (p.barcode === r.barcode || p.sku === r.barcode)) || p.barcode === r.sku)))
                    fail('El código ya existe en esta sucursal.');
            }
            else if (kind === 'appointments' || kind === 'clinical' || kind === 'jobs') {
                const p = s.patients.find(p => p.id === data.patientId && p.branchId === r.branchId);
                if (!p)
                    fail('Selecciona un paciente de la sucursal.');
                if (p.active === false && !old && kind !== 'clinical')
                    fail('Este paciente está inactivo.');
                r.patientId = p.id;
                if (kind === 'appointments') {
                    const provider: any = await db().prepare("SELECT * FROM users WHERE id=? AND role='tecnologo' AND active=1").bind(data.providerId || '').first();
                    if (!provider || !JSON.parse(provider.branches).includes(r.branchId))
                        fail('Selecciona un tecnólogo de esta sucursal.');
                    Object.assign(r, { providerId: provider.id, date: clean(data.date), time: clean(data.time), duration: integer(data.duration, 15, 120), reason: required(data.reason, 'motivo'), status: clean(data.status) || 'Pendiente' });
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time))
                        fail('Fecha u hora inválida.');
                    if (!['Confirmada', 'Pendiente', 'En atención', 'Completada', 'Cancelada'].includes(r.status))
                        fail('Estado inválido.');
                    const scheduleChanged = !old || old.status === 'Cancelada' && r.status !== 'Cancelada' || ['providerId', 'branchId', 'date', 'time', 'duration'].some(k => old[k] !== r[k]);
                    if (r.status !== 'Cancelada' && scheduleChanged && !isAvailable(s.schedules, r.providerId, r.branchId, r.date, r.time, r.duration))
                        fail('La cita está fuera de los días u horarios de atención del tecnólogo.');
                    const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
                    if (minutes(r.time) + r.duration > 1440)
                        fail('La cita debe terminar el mismo día.');
                    if (r.status !== 'Cancelada' && s.appointments.some(a => a.id !== r.id && a.status !== 'Cancelada' && a.providerId === r.providerId && a.date === r.date && minutes(a.time) < minutes(r.time) + r.duration && minutes(a.time) + a.duration > minutes(r.time)))
                        fail('El tecnólogo ya tiene una cita en ese horario.');
                }
                else if (kind === 'clinical') {
                    Object.assign(r, { authorId: old?.authorId || u!.id, author: old?.author || u!.name, date: clean(data.date), reason: required(data.reason, 'motivo'), history: clean(data.history, 5000), od: clean(data.od), oi: clean(data.oi), odSphere: clean(data.odSphere), odCylinder: clean(data.odCylinder), odAxis: clean(data.odAxis), oiSphere: clean(data.oiSphere), oiCylinder: clean(data.oiCylinder), oiAxis: clean(data.oiAxis), diagnosis: clean(data.diagnosis, 5000), plan: clean(data.plan, 5000), patientName: p.name, rut: p.rut, age: ageAt(p.birthDate, clean(data.date)) ?? (data.age === '' || data.age === undefined ? (old?.age ?? p.age ?? null) : integer(data.age, 0, 129)), lensometry: clean(data.lensometry, 5000), followUpNotes: clean(data.followUpNotes, 5000), previousPrescription: clean(data.previousPrescription, 5000), add: clean(data.add), dp: clean(data.dp), visualAcuityOD: clean(data.visualAcuityOD), visualAcuityOI: clean(data.visualAcuityOI), observations: clean(data.observations, 5000) });
                    if (old && u!.role !== 'desarrollador' && old.authorId !== u!.id)
                        fail('Solo el autor o el desarrollador puede editar esta atención.', 403);
                }
                else {
                    const status = clean(data.status) || 'Recibido';
                    if (!['Recibido', 'En montaje', 'Control de calidad', 'Listo', 'Entregado'].includes(status))
                        fail('Estado inválido.');
                    Object.assign(r, { description: required(data.description, 'trabajo'), status, due: clean(data.due), progressNote: clean(data.progressNote, 1000), timeline: [...(old?.timeline || []), ...(old?.status === status && old?.progressNote === clean(data.progressNote, 1000) ? [] : [{ status, note: clean(data.progressNote, 1000), date: new Date().toISOString(), author: u!.name }])] });
                }
            }
            else if (kind === 'schedules') {
                const provider: any = await db().prepare("SELECT * FROM users WHERE id=? AND role='tecnologo' AND active=1").bind(data.providerId || u!.id).first();
                if (!provider || !JSON.parse(provider.branches).includes(r.branchId))
                    fail('El tecnólogo no está asignado a esta sucursal.');
                if (u!.role !== 'desarrollador' && (provider.id !== u!.id || (old && old.providerId !== u!.id)))
                    fail('Solo puedes editar tus propios horarios.', 403);
                const type = clean(data.type);
                if (!['weekly', 'date'].includes(type))
                    fail('Selecciona un tipo de horario.');
                Object.assign(r, { providerId: provider.id, type, weekday: integer(data.weekday ?? 1, 0, 6), date: type === 'date' ? required(data.date, 'fecha') : '', available: data.available !== false, start: clean(data.start), end: clean(data.end) });
                if (type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !Number.isFinite(Date.parse(r.date + 'T12:00:00Z'))))
                    fail('Fecha inválida.');
                if (r.available && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.end) || minuteOf(r.end) <= minuteOf(r.start)))
                    fail('La hora de término debe ser posterior al inicio.');
                if (type === 'weekly' && !r.available)
                    fail('Usa una excepción por fecha para bloquear un día.');
                const peers = s.schedules.filter(x => x.id !== r.id && x.providerId === r.providerId && x.type === type && (type === 'date' ? x.date === r.date : x.weekday === r.weekday));
                if (peers.some(x => !r.available || !x.available || minuteOf(x.start) < minuteOf(r.end) && minuteOf(x.end) > minuteOf(r.start)))
                    fail('Hay otro horario del tecnólogo que se cruza, incluso entre sucursales.');
                const proposed = [...s.schedules.filter(x => x.id !== r.id), r];
                if (s.appointments.some(a => a.providerId === r.providerId && a.date >= today() && !['Cancelada', 'Completada'].includes(a.status) && !isAvailable(proposed, a.providerId, a.branchId, a.date, a.time, a.duration)))
                    fail('Este cambio dejaría citas fuera del horario. Reagenda esas citas primero.');
            }
            else if (kind === 'movements') {
                if (old)
                    fail('Los movimientos no se editan. Registra un movimiento compensatorio.');
                const key = required(data.key, 'referencia');
                if (s.movements.some(m => m.key === key && m.branchId === r.branchId))
                    return response({ ok: true });
                const p = s.products.find(p => p.id === data.productId && p.branchId === r.branchId && p.active !== false);
                if (!p)
                    fail('Selecciona un producto de la sucursal.');
                const delta = integer(Math.abs(Number(data.delta)), 1, 100000) * (Number(data.delta) < 0 ? -1 : 1);
                if (p.stock + delta < 0)
                    fail('Stock insuficiente para esta salida.');
                const jobId = clean(data.jobId);
                if (jobId && !s.jobs.some(j => j.id === jobId && j.branchId === r.branchId))
                    fail('La orden no pertenece a esta sucursal.');
                p.stock += delta;
                p.updatedAt = new Date().toISOString();
                Object.assign(r, { key, productId: p.id, productName: p.name, delta, balance: p.stock, reason: required(data.reason, 'motivo'), jobId, author: u!.name });
            }
            else if (kind === 'cash') {
                const date = clean(data.date || today());
                const existing = old || s.cash.find(x => x.branchId === r.branchId && x.date === date);
                if (existing && !old) Object.assign(r, existing);
                const opening = integer(data.opening ?? existing?.opening ?? 0, 0);
                const withdrawals = integer(data.withdrawals ?? existing?.withdrawals ?? 0, 0);
                const counted = data.counted === '' || data.counted === undefined ? null : integer(data.counted, 0);
                const sales = s.sales.filter(x => x.branchId === r.branchId && x.createdAt?.slice(0, 10) === date && !x.voidedAt);
                const cashSales = sales.reduce((sum, x) => sum + (x.payments || []).filter((p: Row) => p.method === 'Efectivo').reduce((v: number, p: Row) => v + p.amount, 0), 0);
                Object.assign(r, { date, opening, counted, withdrawals, notes: clean(data.notes, 1000), cashSales, expected: opening + cashSales - withdrawals, difference: counted === null ? null : counted - (opening + cashSales - withdrawals), status: counted === null ? 'Abierta' : 'Cerrada', closedBy: counted === null ? '' : u!.name, closedAt: counted === null ? '' : new Date().toISOString() });
            }
            else if (kind === 'reminders') {
                const appointment = s.appointments.find(a => a.id === data.appointmentId && a.branchId === r.branchId);
                if (!appointment || appointment.date < today() || ['Cancelada', 'Completada'].includes(appointment.status))
                    fail('Selecciona una cita pendiente de atención.');
                if (old) {
                    if (data.status !== 'Enviado manualmente')
                        fail('Estado inválido.');
                    Object.assign(r, old, { status: 'Enviado manualmente', sentAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
                }
                else {
                    const p = s.patients.find(p => p.id === appointment.patientId);
                    if (!p?.reminderConsent)
                        fail('El paciente no tiene habilitados los recordatorios por WhatsApp.');
                    let phone = clean(p.phone).replace(/\D/g, '');
                    if (phone.length === 9 && phone.startsWith('9'))
                        phone = '56' + phone;
                    if (!/^[1-9]\d{7,14}$/.test(phone))
                        fail('Completa el teléfono con código de país.');
                    const b = s.branches.find(b => b.id === r.branchId)!;
                    const message = `Hola, ${p.name}. Te recordamos tu cita en ${b.name}, el ${appointment.date} a las ${appointment.time} (hora de Chile). Dirección: ${b.address || 'consulta con nuestra sucursal'}. Por favor responde CONFIRMO para confirmar, o REAGENDAR si necesitas cambiarla. Gracias, Ópticas San Antonio.`;
                    Object.assign(r, { appointmentId: appointment.id, patientId: p.id, message, url: 'https://wa.me/' + phone + '?text=' + encodeURIComponent(message), status: 'Preparado', author: u!.name });
                }
            }
            else if (kind === 'sales') {
                if (data.paymentOf)
                    fail('Usa el registro de abono para actualizar una venta.');
                if (old)
                    fail('Una venta registrada no puede editarse.');
                const lines = data.lines;
                if (!Array.isArray(lines) || !lines.length || lines.length > 100)
                    fail('Agrega productos a la venta.');
                const key = required(data.key, 'referencia');
                const duplicate = s.sales.find(x => x.key === key);
                if (duplicate) {
                    if (!scope(u!, duplicate.branchId))
                        fail('Referencia de venta no disponible.', 403);
                    if (duplicate.branchId !== r.branchId)
                        fail('La referencia corresponde a otra sucursal.', 409);
                    return response({ ok: true, sale: duplicate });
                }
                const items: Row[] = [];
                for (const line of lines) {
                    const p = s.products.find(p => p.id === line.id && p.branchId === r.branchId && p.active !== false);
                    if (!p)
                        fail('Producto no disponible.');
                    const qty = integer(line.qty, 1, 10000);
                    if (p.stock < qty)
                        fail(`Stock insuficiente: ${p.name}.`);
                    p.stock -= qty;
                    p.updatedAt = new Date().toISOString();
                    s.movements.push({ id: crypto.randomUUID(), branchId: r.branchId, productId: p.id, productName: p.name, delta: -qty, balance: p.stock, reason: 'Venta #' + (s.sales.length + 1), author: u!.name, createdAt: new Date().toISOString() });
                    items.push({ id: p.id, name: p.name, sku: p.sku, price: p.price, qty });
                }
        const subtotal = items.reduce((sum, x) => sum + x.price * x.qty, 0);
                const discountType = clean(data.discountType) || 'fixed';
                if (!['fixed', 'percent'].includes(discountType))
                    fail('Tipo de descuento inválido.');
                const discountRate = discountType === 'percent' ? num(data.discountRate, 0, 100) : 0;
                const discount = discountType === 'percent' ? Math.round(subtotal * discountRate / 100) : integer(data.discount, 0, subtotal);
                if (discount > subtotal)
                    fail('El descuento no puede superar el subtotal.');
        const total = subtotal - discount;
        const method = clean(data.method);
        if (!['Efectivo', 'Tarjeta', 'Transferencia'].includes(method))
            fail('Medio de pago inválido.');
        const paidInput = integer(data.paid ?? data.received, 0, method === 'Efectivo' ? 1000000000 : total);
        const paid = Math.min(paidInput, total);
        const received = paidInput;
                const change = method === 'Efectivo' ? Math.max(0, received - total) : 0;
                const patientId = clean(data.patientId);
                if (patientId && !s.patients.some(p => p.id === patientId && p.branchId === r.branchId))
                    fail('Paciente inválido.');
                const clinicalId = clean(data.clinicalId);
                const clinical = clinicalId ? s.clinical.find(x => x.id === clinicalId && x.patientId === patientId) : null;
                Object.assign(r, { key, number: s.sales.length + 1, items, subtotal, discount, discountType, discountRate, total, paid, balance: total - paid, status: paid === total ? 'Pagada' : 'Abono pendiente', method, received, change, patientId, author: u!.name, clinicalId: clinical?.id || '', prescription: clinical ? { od: clinical.od, oi: clinical.oi, add: clinical.add, dp: clinical.dp, date: clinical.date } : null, payments: paid ? [{ id: crypto.randomUUID(), amount: paid, method, date: new Date().toISOString(), author: u!.name }] : [] });
                if (data.createJob === true && patientId) {
                    const jobId = crypto.randomUUID(), now = new Date().toISOString();
                    s.jobs.push({ id: jobId, branchId: r.branchId, patientId, saleId: r.id, description: required(data.jobDescription || 'Pedido asociado a venta', 'descripción de orden'), status: 'Recibido', due: clean(data.due), progressNote: '', createdAt: now, updatedAt: now, timeline: [{ status: 'Recibido', note: 'Orden creada desde venta #' + r.number, date: now, author: u!.name }] });
                    r.jobId = jobId;
                }
            }
            const replace = old || (kind === 'cash' && s.cash.some(x => x.id === r.id));
            s[kind] = replace ? s[kind].map(x => x.id === r.id ? r : x) : [...s[kind], r];
        }
        else
            fail('Acción desconocida.');
        s.audit.push({ id: crypto.randomUUID(), date: new Date().toISOString(), userId: u!.id, action, kind, recordId: data.id || null });
        await commit(s, version);
        return response({ ok: true, patientId: kind === 'patients' ? (data.id || s.patients.at(-1)?.id) : undefined, sale: kind === 'sales' ? s.sales.at(-1) : undefined, reminder: kind === 'reminders' ? s.reminders.find(x => x.id === data.id) || s.reminders.at(-1) : undefined });
    }
    catch (e: any) {
        console.error(e.message);
        return response({ error: e.status ? e.message : e.message?.includes('UNIQUE') ? 'Ese usuario ya existe.' : 'No se pudo guardar. Inténtalo nuevamente.' }, e.status || 400);
    }
}
