import logger from '../utils/logger.js';

/**
 * Envío de mails transaccionales.
 *
 * El proyecto todavía no tiene proveedor de mail contratado, así que esto es un
 * adaptador: si hay SMTP configurado usa nodemailer, y si no deja el link en el
 * log del servidor para poder probar el flujo completo en desarrollo.
 *
 * Para activar el envío real:
 *   1. npm install nodemailer
 *   2. definir SMTP_URL (ej: smtps://usuario:pass@smtp.dominio.com:465)
 *      y MAIL_FROM (ej: "Overtime <no-reply@overtime.com>")
 *
 * Mientras SMTP_URL no esté definido, `enviarMail` devuelve delivered:false.
 * Las rutas que lo usan NO fallan por eso: el flujo sigue funcionando y el link
 * queda visible en los logs.
 */

let transportCache;

async function obtenerTransport() {
  if (transportCache !== undefined) return transportCache;

  if (!process.env.SMTP_URL) {
    transportCache = null;
    return transportCache;
  }

  try {
    const nodemailer = await import('nodemailer');
    transportCache = nodemailer.default.createTransport(process.env.SMTP_URL);
    return transportCache;
  } catch (error) {
    logger.warn(
      'SMTP_URL está definido pero no se pudo cargar nodemailer. Instalalo con "npm install nodemailer".'
    );
    transportCache = null;
    return transportCache;
  }
}

export async function enviarMail({ to, subject, text, html }) {
  const transport = await obtenerTransport();

  if (!transport) {
    logger.info(
      `[mail no enviado - sin SMTP configurado] Para: ${to} | Asunto: ${subject}\n${text}`
    );
    return { delivered: false, reason: 'sin-smtp' };
  }

  try {
    await transport.sendMail({
      from: process.env.MAIL_FROM || 'Overtime <no-reply@overtime.local>',
      to,
      subject,
      text,
      html: html || undefined,
    });
    return { delivered: true };
  } catch (error) {
    logger.error('Error enviando mail:', error);
    return { delivered: false, reason: 'error-envio' };
  }
}

/** Base para armar los links que van en los mails (el frontend, no la API). */
export function baseUrlApp() {
  const origen = process.env.CLIENT_ORIGIN || '';
  // CLIENT_ORIGIN puede traer varias URLs separadas por coma; usamos la primera.
  return origen.split(',')[0].trim() || 'http://localhost:3000';
}

export async function enviarMailResetPassword({ to, nombre, token }) {
  const link = `${baseUrlApp()}/reset-password/${token}`;
  return enviarMail({
    to,
    subject: 'Restablecer tu contraseña de Overtime',
    text:
      `Hola ${nombre || ''},\n\n` +
      `Pediste restablecer tu contraseña. Entrá acá para elegir una nueva:\n${link}\n\n` +
      `El link vence en 1 hora. Si no fuiste vos, ignorá este mail.`,
  });
}

export async function enviarMailVerificacion({ to, nombre, token }) {
  const link = `${baseUrlApp()}/verificar-email/${token}`;
  return enviarMail({
    to,
    subject: 'Confirmá tu email en Overtime',
    text:
      `Hola ${nombre || ''},\n\n` +
      `Confirmá tu dirección de email entrando acá:\n${link}\n\n` +
      `El link vence en 24 horas.`,
  });
}
