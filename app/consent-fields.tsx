'use client';
export function ConsentFields({value, onChange}: any) {
 const entry=value.consentEntry;
 const change=(key: string, val: string)=>onChange('consentEntry',{...entry,[key]:val});
 return <section className="full"><h3>Consentimiento de datos personales y de salud</h3><p className="hint">Registro manual de una respuesta recibida, independiente de recordatorios y publicidad. El mensaje de la óptica sigue en borrador hasta completar razón social, RUT y aviso de privacidad.</p>
 {!entry ? <button type="button" className="secondary" onClick={()=>onChange('consentEntry',{})}>Registrar respuesta de consentimiento</button> : <div className="form-grid">
 <label>Respuesta<select required value={entry.status||''} onChange={e=>change('status',e.target.value)}><option value="">Seleccionar</option>{['Aceptado','Rechazado','Revocado'].map(x=><option key={x}>{x}</option>)}</select></label>
 <label>Canal<select required value={entry.channel||''} onChange={e=>change('channel',e.target.value)}><option value="">Seleccionar</option>{['WhatsApp','Presencial','Correo electrónico','Formulario web','Otro'].map(x=><option key={x}>{x}</option>)}</select></label>
 <label>Fecha y hora de respuesta (hora de este dispositivo)<input required type="datetime-local" value={entry.localDate||''} onChange={e=>{const date=new Date(e.target.value);onChange('consentEntry',{...entry,localDate:e.target.value,respondedAt:Number.isFinite(date.getTime())?date.toISOString():''});}}/></label>
 <label>Versión del texto<input required maxLength={100} value={entry.version||''} onChange={e=>change('version',e.target.value)}/></label>
 <label className="full">Respuesta literal o constancia del paciente<textarea required rows={3} maxLength={5000} value={entry.response||''} onChange={e=>change('response',e.target.value)}/></label>
 <label className="full">Texto completo presentado<textarea required rows={5} maxLength={15000} value={entry.text||''} onChange={e=>change('text',e.target.value)}/></label>
 <p className="hint full">Guarda los cambios de la ficha para incorporar la respuesta al historial.</p><button type="button" className="secondary" onClick={()=>onChange('consentEntry',null)}>Descartar respuesta</button></div>}
 <h4>Historial de respuestas</h4>{!(value.consents||[]).length&&<p className="hint">Sin consentimiento registrado.</p>}{[...(value.consents||[])].reverse().map((x:any)=><details key={x.id}><summary>{x.status} · {x.channel} · {new Date(x.respondedAt).toLocaleString('es-CL')} · {x.version}</summary><p style={{whiteSpace:'pre-wrap'}}>{x.response}</p><p>Registrado por {x.recordedByName} el {new Date(x.recordedAt).toLocaleString('es-CL')}</p><p style={{whiteSpace:'pre-wrap'}}>{x.text}</p></details>)}</section>;
}
