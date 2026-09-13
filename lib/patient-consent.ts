export function appendConsent(history: any[] = [], entry: any, actor: any) {
  if (!entry) return history;
  const fail = (message: string): never => { throw Object.assign(new Error(message), {status: 400}); };
  for (const key of ['status','channel','response','version','text','respondedAt']) if (!String(entry[key] || '').trim()) fail('Completa todos los datos del consentimiento.');
  if (!['Aceptado','Rechazado','Revocado'].includes(entry.status)) fail('Respuesta inválida.');
  if (!['WhatsApp','Presencial','Correo electrónico','Formulario web','Otro'].includes(entry.channel)) fail('Canal inválido.');
  const date = new Date(entry.respondedAt);
  if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now()) fail('Fecha de respuesta inválida o futura.');
  if (entry.text.length > 15000 || entry.response.length > 5000 || entry.version.length > 100) fail('El texto supera el límite permitido.');
  if (entry.status === 'Aceptado' && (/borrador/i.test(entry.version) || /\[(razón social|enlace|rut)/i.test(entry.text))) fail('Completa el texto definitivo antes de registrar su aceptación.');
  if (history.some(x => x.version === entry.version && x.text !== entry.text)) fail('Usa otra versión para un texto diferente.');
  return [...history, {id: crypto.randomUUID(), status: entry.status, channel: entry.channel, response: entry.response, version: entry.version, text: entry.text, respondedAt: date.toISOString(), recordedAt: new Date().toISOString(), recordedBy: actor.id, recordedByName: actor.name}];
}
