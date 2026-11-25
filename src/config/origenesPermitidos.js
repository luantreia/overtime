/**
 * Frontends que pueden hablar con la API. Lo usa el CORS de server.js y también mailService, para
 * mandar los links de los mails (reset de contraseña, verificación) a la app desde la que se
 * pidieron y no siempre a la misma.
 */
export const origenesPermitidos = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:3004',
  'http://localhost:3005',
  'https://overtime-public.vercel.app',
  'https://overtime-manager.vercel.app',
  'https://overtime-dt.vercel.app',
  'https://overtime-admin.vercel.app',
  'https://overtime-organizaciones.vercel.app',
  'https://overtime-dodgeball.vercel.app', // legacy
  'https://overtime-ddyl.onrender.com', // el propio backend
  'https://overtime-partido.vercel.app',
];

const sinBarraFinal = (o) => String(o || '').trim().replace(/\/+$/, '');

export const esOrigenPermitido = (origin) => {
  const o = sinBarraFinal(origin);
  if (!o) return false;
  if (o.startsWith('http://localhost:') || o.startsWith('https://localhost:')) return true;
  return origenesPermitidos.includes(o);
};
