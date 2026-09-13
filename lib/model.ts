export const roles = ['desarrollador', 'administrador', 'tecnologo', 'vendedor', 'montajista'];
export const roleNames: Record<string, string> = { desarrollador: 'Desarrollador', administrador: 'Administrador', tecnologo: 'Tecnólogo médico', vendedor: 'Vendedor / cajero', montajista: 'Montajista' };
export const modules: Record<string, string> = { patients: 'Pacientes', clinical: 'Historial clínico', appointments: 'Agenda', products: 'Inventario', sales: 'Punto de venta', jobs: 'Laboratorio', providers: 'Proveedores', purchases: 'Compras y recepción', branches: 'Sucursales', schedules: 'Horarios de atención', movements: 'Movimientos de inventario', reminders: 'Recordatorios', cash: 'Caja diaria' };
export const defaults: Record<string, string[]> = {
  desarrollador: Object.keys(modules),
  administrador: ['patients', 'clinical', 'appointments', 'products', 'sales', 'jobs', 'providers', 'purchases', 'branches', 'schedules:read', 'movements', 'reminders', 'cash'],
  tecnologo: ['patients', 'clinical', 'appointments', 'schedules'],
  vendedor: ['patients', 'appointments', 'products', 'sales', 'reminders', 'cash'],
  montajista: ['jobs', 'products:read', 'movements']
};
export type Row = Record<string, any>;
export type State = Record<string, Row[]>;
export const initialState = (): State => ({ schedules: [], movements: [], reminders: [], cash: [], providers: [], purchases: [], patients: [], clinical: [], appointments: [], products: [], sales: [], jobs: [], branches: [{ id: 'central', name: 'San Antonio · Casa matriz', address: 'Luis Reuss Bernal 246, San Antonio', phone: '+56 9 3319 5445', active: true }], audit: [] });
export const money = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n || 0);
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const permissionActions: Record<string, string[]> = { patients: ['read', 'create', 'update', 'delete'], clinical: ['read', 'create', 'update'], appointments: ['read', 'create', 'update'], products: ['read', 'create', 'update'], sales: ['read', 'create', 'update'], jobs: ['read', 'create', 'update'], providers: ['read', 'create', 'update'], purchases: ['read', 'create'], branches: ['read', 'create', 'update', 'logo'], schedules: ['read', 'create', 'update', 'delete'], movements: ['read', 'create'], reminders: ['read', 'create', 'update'], cash: ['read', 'create', 'update'] };
export const actionNames: Record<string, string> = { read: 'Ver', create: 'Crear', update: 'Editar', delete: 'Eliminar', logo: 'Subir logo' };
export function expandedPermissions(values: string[] = []) { return [...new Set(values.flatMap(v => v.includes(':') ? [v] : (permissionActions[v] || []).map(a => `${v}:${a}`)))].filter(v => { const [k, a] = v.split(':'); return permissionActions[k]?.includes(a); }); }
export function allowed(u: Row | undefined, k: string, action = 'read') {
  if (!u) return false;
  if (u.role === 'desarrollador') return true;
  const expanded = expandedPermissions(u.permissions || []);
  return expanded.includes(`${k}:${action}`);
}
export function ageAt(birth: string, date = today()) { if (!birth || !date)
    return null; const years = Number(date.slice(0, 4)) - Number(birth.slice(0, 4)) - (date.slice(5) < birth.slice(5) ? 1 : 0); return years >= 0 && years < 130 ? years : null; }
export const minuteOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
export function isAvailable(schedules: Row[], providerId: string, branchId: string, date: string, time: string, duration: number) { const specific = schedules.filter(s => s.providerId === providerId && s.type === 'date' && s.date === date); const weekday = new Date(date + 'T12:00:00Z').getUTCDay(); const applicable = specific.length ? specific : schedules.filter(s => s.providerId === providerId && s.type === 'weekly' && s.weekday === weekday); return applicable.some(s => s.available !== false && s.branchId === branchId && minuteOf(time) >= minuteOf(s.start) && minuteOf(time) + duration <= minuteOf(s.end)); }
