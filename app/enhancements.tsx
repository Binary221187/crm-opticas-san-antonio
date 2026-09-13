'use client';
import { useEffect, useState } from 'react';
import { money, today, Row } from '@/lib/model';
import { toast } from 'sonner';

export function Welcome() {
  const [visible, setVisible] = useState(true);
  useEffect(() => { const timer = setTimeout(() => setVisible(false), 1800); return () => clearTimeout(timer); }, []);
  if (!visible) return null;
  return <div className="welcome-screen" role="status"><img src="/optica-welcome.jpeg" alt="Óptica San Antonio"/><p>Bienvenido a tu óptica</p><button onClick={() => setVisible(false)}>Continuar</button></div>;
}

export function BarcodeReader({ products, onAdd, disabled }: { products: Row[]; onAdd: (p: Row) => void; disabled: boolean }) {
  const [code, setCode] = useState('');
  function scan(e: React.FormEvent) {
    e.preventDefault();
    if (disabled || !code.trim()) return;
    const matches = products.filter(p => p.active !== false && (p.barcode === code.trim() || p.sku === code.trim()));
    if (matches.length !== 1) toast.error(matches.length ? 'Código ambiguo. Revisa el inventario.' : 'Código no encontrado en esta sucursal.');
    else onAdd(matches[0]);
    setCode('');
  }
  return <form className="barcode-reader" onSubmit={scan}><label htmlFor="barcode-reader">Lector de código de barras</label><div><input id="barcode-reader" autoComplete="off" value={code} disabled={disabled} onChange={e => setCode(e.target.value)} placeholder="Escanea aquí o escribe el código"/><button className="secondary" disabled={disabled || !code.trim()}>Agregar</button></div><small>Conecta una pistola USB o Bluetooth en modo teclado, selecciona este campo y escanea. Configura el lector para terminar con Enter.</small></form>;
}

function dateInChile(value: string) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value)); }
export function PeriodSales({ sales }: { sales: Row[] }) {
  const [period, setPeriod] = useState('day'), [date, setDate] = useState(today());
  const anchor = new Date(date + 'T12:00:00Z');
  let start = date, end = date;
  if (period === 'week') { const day = (anchor.getUTCDay() + 6) % 7; anchor.setUTCDate(anchor.getUTCDate() - day); start = anchor.toISOString().slice(0,10); anchor.setUTCDate(anchor.getUTCDate() + 6); end = anchor.toISOString().slice(0,10); }
  if (period === 'month') { start = date.slice(0,7) + '-01'; end = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0)).toISOString().slice(0,10); }
  const inPeriod = (d: string) => !!d && dateInChile(d) >= start && dateInChile(d) <= end;
  const valid = sales.filter(s => !s.voidedAt);
  const selected = valid.filter(s => inPeriod(s.createdAt));
  const total = selected.reduce((n,s) => n + s.total, 0);
  const payments = valid.flatMap(s => s.payments || []).filter(p => inPeriod(p.date));
  return <section className="panel period-sales"><div className="panel-heading"><h2>Resumen de ventas</h2><div className="period-controls"><select aria-label="Periodo" value={period} onChange={e=>setPeriod(e.target.value)}><option value="day">Diario</option><option value="week">Semanal</option><option value="month">Mensual</option></select><input aria-label="Fecha del resumen" type="date" required value={date} onChange={e=>e.target.value && setDate(e.target.value)}/></div></div><p className="hint">{start} al {end} · Hora de Chile · Semana de lunes a domingo · Sucursal seleccionada</p><div className="period-metrics">{[['Ventas', String(selected.length)], ['Total vendido', money(total)], ['Cobrado en el período', money(payments.reduce((n,p)=>n+p.amount,0))], ['Saldo actual de estas ventas', money(selected.reduce((n,s)=>n+(s.balance||0),0))]].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><p className="hint">Cobrado incluye abonos recibidos en estas fechas, incluso de ventas anteriores. Se excluyen ventas anuladas.</p></section>;
}
