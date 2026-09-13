# Código fuente — Ópticas San Antonio CRM

Este paquete contiene el proyecto de la CRM y el registro manual de consentimientos. No incluye la página pública independiente, los datos de pacientes, usuarios de producción, contraseñas, secretos ni respaldos privados.

## Instalación para desarrollo

Requiere Node.js >=22.13, pnpm (versión indicada en package.json) y entorno Bash, por ejemplo Linux o WSL en Windows.

1. Instalar dependencias: `pnpm install --frozen-lockfile`.
2. Iniciar desarrollo: `pnpm dev`.
3. Compilar: `pnpm build`.
4. Ejecutar pruebas: `node tests/crm.mjs`.

El código está preparado para Vinext y Cloudflare Workers, con D1 (DB) y R2 (BUCKET). Las migraciones están en drizzle/. No es un HTML que se abra haciendo doble clic.

## Configuración y traslado

La autenticación actual depende del acceso privado de Sites y de las cuentas internas de la CRM. Para alojarlo fuera de Sites hay que configurar o sustituir esa integración de identidad, aprovisionar D1 y R2, aplicar migraciones y configurar el dominio. No basta con subir el ZIP a un hosting PHP.

PUBLIC_BOOKING_URL apunta a la web pública independiente. BOOKING_SYNC_SECRET es un secreto compartido que se configura en el alojamiento y no se incluye aquí. La sincronización de reservas requiere también el servidor de esa web; este paquete entrega solo la CRM solicitada. No copies ni publiques credenciales privadas de Sites.

## Consentimientos

Pacientes → Editar → Consentimiento de datos personales y de salud. Se guardan respuesta, fecha/hora, canal, versión, copia del texto y usuario que registró la respuesta. El historial se conserva al editar la ficha. Es un registro manual; no recibe respuestas de WhatsApp automáticamente. El mensaje legal permanece pendiente de razón social, RUT y aviso de privacidad. Esta función por sí sola no certifica cumplimiento legal.

## Datos y documentación

Para trasladar datos reales se necesita un respaldo separado y un procedimiento de migración verificado. README.md contiene notas históricas de versiones; este documento describe el alcance de esta entrega. Conserva los avisos y licencias de dependencias.
