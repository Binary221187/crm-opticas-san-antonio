'use client';
import { CalendarDays, Plus, Pencil, Trash2, MessageCircle, Package, Check, Building2, Glasses } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { modules, permissionActions, actionNames, expandedPermissions, allowed, ageAt, today, Row } from '@/lib/model';

export function Pick({ value, onChange, options, label }: any) {
  return <Select value={value || '_none'} onValueChange={v => onChange(v === '_none' ? '' : v)}>
    <SelectTrigger aria-label={label} className="picker"><SelectValue /></SelectTrigger>
    <SelectContent>
      {options.map((o: any) => <SelectItem key={o.value || '_none'} value={o.value || '_none'}>{o.label}</SelectItem>)}
    </SelectContent>
  </Select>;
}

export function Field({ label, children }: any) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

export function PermissionGrid({ value, onChange, user }: any) {
  const values = expandedPermissions(value);
  const isDev = user?.role === 'desarrollador';
  const availableModules = isDev
    ? Object.entries(modules)
    : Object.entries(modules).filter(([k]) =>
        ['patients', 'clinical', 'appointments', 'products', 'sales', 'jobs',
         'providers', 'purchases', 'branches', 'schedules', 'movements', 'reminders', 'cash'].includes(k));
  function toggle(k: string, a: string, checked: boolean) {
    let next = values.filter(v => v !== `${k}:${a}`);
    if (checked) { next.push(`${k}:${a}`); if (a !== 'read') next.push(`${k}:read`); }
    else if (a === 'read') next = next.filter(v => !v.startsWith(k + ':'));
    onChange([...new Set(next)]);
  }
  return (
    <div className="permission-matrix">
      <p>Elige cada acción. Desmarcar «Ver» retira todas las acciones de esa área.</p>
      <Table>
        <TableHeader>
          <TableRow><TableHead>Área</TableHead>{['read', 'create', 'update', 'delete', 'logo'].map(a => <TableHead key={a}>{actionNames[a]}</TableHead>)}</TableRow>
        </TableHeader>
        <TableBody>
          {availableModules.map(([k, name]) => (
            <TableRow key={k}>
              <TableCell>{name}</TableCell>
              {['read', 'create', 'update', 'delete', 'logo'].map(a => (
                <TableCell key={a}>
                  {permissionActions[k].includes(a)
                    ? <Checkbox aria-label={`${actionNames[a]} ${name}`} checked={values.includes(`${k}:${a}`)} onCheckedChange={v => toggle(k, a, !!v)}/>
                    : <span className="permission-na">—</span>}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <small>{isDev ? 'El desarrollador tiene acceso total a todas las áreas.' : 'Cada rol solo ve las áreas asignadas en su perfil.'} Las sucursales delimitan el acceso.</small>
    </div>
  );
}

const weekdays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export function SchedulePanel({ rows, users, user, onEdit, onDelete }: any) {
  return <section className="panel">
    <div className="panel-heading">
      <div>
        <h2>{user.role === 'tecnologo' ? 'Mis días y horarios' : 'Disponibilidad de tecnólogos'}</h2>
        <p>Los horarios se aplican a la sucursal seleccionada. Las excepciones por fecha reemplazan el horario habitual de ese día.</p>
      </div>
    </div>
    {rows.length ? (
      <Table>
        <TableHeader><TableRow>{['Tecnólogo', 'Día', 'Atención', 'Tipo', ''].map(h => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
        <TableBody>
          {rows.map((r: Row) => (
            <TableRow key={r.id}>
              <TableCell>{users.find((u: Row) => u.id === r.providerId)?.name || 'Tecnólogo'}</TableCell>
              <TableCell>{r.type === 'weekly' ? weekdays[r.weekday] : r.date}</TableCell>
              <TableCell>{r.available ? `${r.start} – ${r.end}` : 'No atiende'}</TableCell>
              <TableCell><span className="badge">{r.type === 'weekly' ? 'Semanal' : 'Excepción'}</span></TableCell>
              <TableCell>
                <div className="row-actions">
                  {(user.role === 'desarrollador' || user.id === r.providerId) && (
                    <>
                      {allowed(user, 'schedules', 'update') && <button className="icon-button" aria-label="Editar horario" onClick={() => onEdit(r)}><Pencil size={16}/></button>}
                      {allowed(user, 'schedules', 'delete') && <button className="icon-button danger" aria-label="Eliminar horario" onClick={() => onDelete(r)}><Trash2 size={16}/></button>}
                    </>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    ) : (
      <div className="empty"><CalendarDays size={32}/>
        <h3>Define los horarios de atención</h3>
        <p>Agrega bloques semanales. Puedes crear dos bloques en un día para dejar una pausa entre ellos.</p>
      </div>
    )}
  </section>;
}

export function ScheduleFields({ value, onChange, users, user }: any) {
  const options = users.filter((u: Row) =>
    u.role === 'tecnologo' && u.active && u.branches.includes(value.branchId) &&
    (user.role === 'desarrollador' || u.id === user.id)
  ).map((u: Row) => ({ value: u.id, label: u.name }));
  return (
    <>
      <div className="full">
        <Field label="Tecnólogo médico">
          <Pick label="Tecnólogo del horario" value={value.providerId} onChange={(v: string) => onChange('providerId', v)}
            options={[{ value: '', label: 'Seleccionar tecnólogo' }, ...options]}/>
        </Field>
      </div>
      <Field label="Tipo de horario">
        <Pick label="Tipo de horario" value={value.type} onChange={(v: string) => { onChange('type', v); if (v === 'weekly') onChange('available', true); }}
          options={[{ value: 'weekly', label: 'Horario semanal' }, { value: 'date', label: 'Excepción por fecha' }]}/>
      </Field>
      {value.type === 'weekly' ? (
        <Field label="Día de atención">
          <Pick label="Día de atención" value={String(value.weekday)} onChange={(v: string) => onChange('weekday', Number(v))}
            options={weekdays.map((v, i) => ({ value: String(i), label: v }))}/>
        </Field>
      ) : (
        <>
          <Field label="Fecha"><input required type="date" value={value.date || ''} onChange={e => onChange('date', e.target.value)}/></Field>
          <Field label="Disponibilidad">
            <Pick label="Disponibilidad" value={value.available === false ? 'off' : 'on'} onChange={(v: string) => onChange('available', v === 'on')}
              options={[{ value: 'on', label: 'Atiende en este horario' }, { value: 'off', label: 'No atiende este día' }]}/>
          </Field>
        </>
      )}
      {value.available !== false && (
        <>
          <Field label="Desde"><input required type="time" value={value.start || ''} onChange={e => onChange('start', e.target.value)}/></Field>
          <Field label="Hasta"><input required type="time" value={value.end || ''} onChange={e => onChange('end', e.target.value)}/></Field>
        </>
      )}
      <p className="full form-note">No se permiten cruces entre sucursales ni cambios que dejen citas vigentes fuera del horario.</p>
    </>
  );
}

export function ClinicalFields({ value, onChange, patient }: any) {
  const text = (k: string, label: string, rows = 3) => (
    <Field label={label}><textarea rows={rows} maxLength={5000} value={value[k] || ''} onChange={e => onChange(k, e.target.value)}/></Field>
  );
  const input = (k: string, label: string) => (
    <Field label={label}><input value={value[k] || ''} onChange={e => onChange(k, e.target.value)} maxLength={300}/></Field>
  );
  return (
    <>
      <div className="full clinical-identity">
        <div><small>NOMBRE</small><b>{patient?.name || 'Selecciona un paciente'}</b></div>
        <div><small>RUT</small><b>{patient?.rut || 'Sin RUT'}</b></div>
        <div><small>EDAD A LA ATENCIÓN</small><b>{ageAt(patient?.birthDate, value.date) ?? patient?.age ?? value.age ?? 'Sin edad'}{(ageAt(patient?.birthDate, value.date) ?? patient?.age ?? value.age) != null ? ' años' : ''}</b></div>
      </div>
      <Field label="Fecha de atención"><input required type="date" value={value.date || ''} onChange={e => onChange('date', e.target.value)}/></Field>
      <Field label="Edad (si no se registró nacimiento)">
        <input type="number" min="0" max="129" value={value.age ?? patient?.age ?? ''} disabled={!!patient?.birthDate}
          onChange={e => onChange('age', e.target.value)}/>
      </Field>
      <div className="full">
        <Field label="Motivo de consulta"><input required value={value.reason || ''} onChange={e => onChange('reason', e.target.value)}/></Field>
        {text('history', 'Antecedentes mórbidos y oftalmológicos')}
        {text('previousPrescription', 'Receta anterior')}
        {text('lensometry', 'Lensometría (si dispone): OD, OI y adición')}
      </div>
      <div className="full section-label">REFRACCIÓN</div>
      <div className="full clinical-identity"><b>OD</b></div>
      {input('odSphere', 'OD · Esfera')}
      {input('odCylinder', 'OD · Astigmatismo (cilindro)')}
      {input('odAxis', 'OD · Eje')}
      <div className="full clinical-identity"><b>OI</b></div>
      {input('oiSphere', 'OI · Esfera')}
      {input('oiCylinder', 'OI · Astigmatismo (cilindro)')}
      {input('oiAxis', 'OI · Eje')}
      {input('add', 'ADD · Adición')}
      {input('dp', 'DP · Distancia pupilar')}
      {input('vaOD', 'VA OD · Agudeza visual')}
      {input('vaOI', 'VA OI · Agudeza visual')}
    </>
  );
}

export function ClinicalExtra({ entry }: any) {
  return (
    <>
      <div className="clinical-identity">
        <div><small>NOMBRE</small><b>{entry.patientName || 'En ficha de paciente'}</b></div>
        <div><small>RUT</small><b>{entry.rut || 'En ficha de paciente'}</b></div>
        <div><small>EDAD A LA ATENCIÓN</small><b>{entry.age != null ? `${entry.age} años` : 'No registrada'}</b></div>
      </div>
      <b>Lensometría</b><p>{entry.lensometry || 'No registrada'}</p>
      <b>Receta anterior</b><p>{entry.previousPrescription || 'No registrada'}</p>
      <div className="rx-grid">
        <div><small>ADD · ADICIÓN</small><b>{entry.add || 'No registrada'}</b></div>
        <div><small>DP · DISTANCIA PUPILAR</small><b>{entry.dp || 'No registrada'}</b></div>
        <div><small>AGUDEZA VISUAL OD</small><b>{entry.visualAcuityOD || 'No registrada'}</b></div>
        <div><small>AGUDEZA VISUAL OI</small><b>{entry.visualAcuityOI || 'No registrada'}</b></div>
      </div>
      <b>Observaciones</b><p>{entry.observations || 'Sin observaciones'}</p>
      <b>Consideraciones para próxima consulta</b><p>{entry.followUpNotes || 'Sin notas adicionales'}</p>
    </>
  );
}

export function MovementsPanel({ rows }: any) {
  return <section className="panel">
    <div className="panel-heading">
      <div><h2>Entradas, salidas y consumo de materiales</h2>
        <p>Cada movimiento conserva el responsable y el saldo resultante.</p></div>
    </div>
    {rows.length ? (
      <Table>
        <TableHeader><TableRow>{['Fecha', 'Producto', 'Movimiento', 'Saldo', 'Motivo / orden', 'Responsable'].map(h => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
        <TableBody>
          {[...rows].reverse().map((m: Row) => (
            <TableRow key={m.id}>
              <TableCell>{new Date(m.createdAt).toLocaleString('es-CL', { timeZone: 'America/Santiago' })}</TableCell>
              <TableCell>{m.productName}</TableCell>
              <TableCell><span className={'badge ' + (m.delta < 0 ? 'stock-out' : '')}>{m.delta > 0 ? '+' : ''}{m.delta}</span></TableCell>
              <TableCell>{m.balance}</TableCell>
              <TableCell>{m.reason}{m.jobId && <small className="block">Orden {m.jobId.slice(0, 6)}</small>}</TableCell>
              <TableCell>{m.author}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    ) : (
      <div className="empty"><Package size={32}/>
        <h3>Sin movimientos todavía</h3>
        <p>Registra recepciones de stock o materiales utilizados en una orden de trabajo.</p>
      </div>
    )}
  </section>;
}

export function ReminderPanel({ appointments, reminders, patients, user, busy, onPrepare, onSent, onConfirm }: any) {
  return <section className="panel">
    <div className="panel-heading">
      <div><h2>Solicitar confirmación por WhatsApp</h2>
        <p>Prepara el mensaje, envíalo desde WhatsApp y registra la respuesta del paciente.</p></div>
      <MessageCircle size={24}/>
    </div>
    <div className="reminder-help">El CRM no envía mensajes automáticamente. «Preparado» no significa «Enviado». La confirmación se registra cuando el paciente responde.</div>
    {appointments.length ? (
      <Table>
        <TableHeader><TableRow>{['Cita', 'Paciente', 'Confirmación', 'Recordatorio', 'Acciones'].map(h => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
        <TableBody>
          {appointments.filter((a: Row) => a.date >= today() && !['Cancelada', 'Completada'].includes(a.status))
            .sort((a: Row, b: Row) => (a.date + a.time).localeCompare(b.date + b.time))
            .map((a: Row) => {
              const reminder = [...reminders].reverse().find((r: Row) => r.appointmentId === a.id);
              return (
                <TableRow key={a.id}>
                  <TableCell>{a.date}<b className="block">{a.time}</b></TableCell>
                  <TableCell>{patients.find((p: Row) => p.id === a.patientId)?.name || 'Paciente'}</TableCell>
                  <TableCell><span className="badge">{a.status}</span></TableCell>
                  <TableCell>{reminder?.status || 'Sin preparar'}{reminder?.sentAt && <small className="block">{new Date(reminder.sentAt).toLocaleString('es-CL')}</small>}</TableCell>
                  <TableCell>
                    <div className="reminder-actions">
                      {allowed(user, 'reminders', 'create') && <button className="secondary" disabled={busy} onClick={() => onPrepare(a)}>Preparar mensaje</button>}
                      {reminder && (
                        <>
                          <a className="primary" href={reminder.url} target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>
                          {reminder.status !== 'Enviado manualmente' && allowed(user, 'reminders', 'update') && (
                            <button className="text-button" disabled={busy} onClick={() => onSent(reminder)}>Ya lo envié</button>
                          )}
                        </>
                      )}
                      {a.status !== 'Confirmada' && allowed(user, 'appointments', 'update') && (
                        <button className="text-button" disabled={busy} onClick={() => onConfirm(a)}>Confirmar cita</button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
        </TableBody>
      </Table>
    ) : (
      <div className="empty"><MessageCircle size={32}/>
        <h3>Sin citas próximas</h3>
        <p>Las citas de hoy o futuras aparecerán aquí para enviar recordatorios.</p>
      </div>
    )}
  </section>;
}

const styles = [
  { id: 'clinical', name: 'Clínica Clara', subtitle: 'Blanco · Azul cobalto · Celeste', description: 'Navegación clara, tarjetas amplias y fichas clínicas con mayor espacio. Pensada para leer y registrar atenciones.', colors: ['#ffffff', '#215bea', '#e7f2ff'] },
  { id: 'luxury', name: 'San Antonio Signature', subtitle: 'Marfil · Grafito · Dorado', description: 'Barra lateral oscura, encabezados editoriales y líneas finas. Una identidad premium para recepción y ventas.', colors: ['#fcfaf5', '#20282c', '#997033'] },
  { id: 'studio', name: 'Óptica Studio', subtitle: 'Azul noche · Violeta · Turquesa', description: 'Paneles compactos, indicadores destacados y contraste nocturno. Enfocada en caja y seguimiento de laboratorio.', colors: ['#121c2c', '#a78bfa', '#54d6c6'] }
];

export function AppearancePanel({ theme, onTheme }: any) {
  return (
    <>
      <div className="style-options">
        {styles.map((s, i) => (
          <article className={'style-card style-' + s.id} key={s.id}>
            <div className="style-demo">
              <div className="demo-nav"><Glasses size={22}/><span>San Antonio</span></div>
              <div className="demo-content">
                <span>BUEN DÍA, EQUIPO</span>
                <h3>{s.id === 'luxury' ? 'Una atención excepcional.' : s.id === 'studio' ? 'Centro de operaciones' : 'Tu jornada de atención'}</h3>
                <div className="demo-stats">
                  <div><small>Citas de hoy</small><b>12</b></div>
                  <div><small>Trabajos listos</small><b>08</b></div>
                </div>
                <div className="demo-appointment"><CalendarDays size={18}/>
                  <div><b>09:30 · Evaluación visual</b><small>Vista de ejemplo · Sin datos de pacientes</small></div>
                  <Check size={16}/>
                </div>
              </div>
            </div>
            <div className="style-description">
              <span className="eyebrow">OPCIÓN {i + 1}</span>
              <h2>{s.name}</h2>
              <div className="swatches">{s.colors.map(c => <span key={c} style={{ background: c }} aria-label={c}/>)}<small>{s.subtitle}</small></div>
              <p>{s.description}</p>
              <button className={theme === s.id ? 'primary' : 'secondary'} onClick={() => onTheme(s.id)}>
                {theme === s.id ? 'Estilo en prueba' : 'Probar este estilo'}
              </button>
            </div>
          </article>
        ))}
      </div>
      <div className="theme-note">
        <p>Liquid Glass se mantiene como la capa visual de los tres estilos. La vista previa se guarda solo en este navegador.</p>
        <button className="secondary" onClick={() => onTheme('original')}>Volver a Liquid Glass</button>
      </div>
    </>
  );
}
