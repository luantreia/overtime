// routes/auth.js
import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import Usuario from '../models/Usuario.js';
import TokenUsuario from '../models/TokenUsuario.js';
import verificarToken from '../middleware/authMiddleware.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import mongoose from 'mongoose';
import { validateUserCreation, handleValidationErrors } from '../validators/userValidator.js';
import { enviarMailResetPassword, enviarMailVerificacion } from '../services/mailService.js';
import { validatePassword } from '../validators/userValidator.js';

const router = express.Router();

const RESET_TTL_MS = 60 * 60 * 1000;          // 1 hora
const VERIFICACION_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/**
 * Genera un token de un solo uso, invalidando los anteriores del mismo tipo.
 * Devuelve el valor en claro (solo se guarda el hash).
 */
async function emitirToken(usuarioId, tipo, ttlMs) {
  await TokenUsuario.deleteMany({ usuario: usuarioId, tipo, usedAt: null });

  const rawToken = crypto.randomBytes(32).toString('hex');
  await TokenUsuario.create({
    usuario: usuarioId,
    tipo,
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + ttlMs),
  });

  return rawToken;
}

async function consumirToken(rawToken, tipo) {
  if (!rawToken || typeof rawToken !== 'string') return null;

  const registro = await TokenUsuario.findOne({
    tokenHash: hashToken(rawToken),
    tipo,
    usedAt: null,
  });

  if (!registro) return null;
  if (registro.expiresAt.getTime() < Date.now()) return null;

  return registro;
}

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Autenticación de usuarios (registro, login, refresh)
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     AuthUser:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         email:
 *           type: string
 *           format: email
 *         nombre:
 *           type: string
 *         rol:
 *           type: string
 *     AuthTokens:
 *       type: object
 *       properties:
 *         accessToken:
 *           type: string
 *         refreshToken:
 *           type: string
 *     AuthResponse:
 *       type: object
 *       properties:
 *         user:
 *           $ref: '#/components/schemas/AuthUser'
 *         accessToken:
 *           type: string
 *         refreshToken:
 *           type: string
 */

// Registro local
/**
 * @swagger
 * /api/auth/registro:
 *   post:
 *     summary: Registro de usuario (modo local)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, nombre]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *               nombre:
 *                 type: string
 *     responses:
 *       201:
 *         description: Usuario registrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Datos inválidos o email ya registrado
 *       500:
 *         description: Error del servidor
 */
router.post('/registro', validateUserCreation, handleValidationErrors, async (req, res) => {
  try {
    const { email, password, nombre } = req.body || {};
    if (!email || !password || !nombre) {
      return res.status(400).json({ error: 'email, password y nombre son requeridos' });
    }

    const existente = await Usuario.findOne({ email }).lean();
    if (existente) {
      return res.status(409).json({ error: 'El email ya está registrado' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const _id = new mongoose.Types.ObjectId().toString();

    const user = new Usuario({ _id, email, nombre, rol: 'lector', passwordHash, provider: 'local' });
    await user.save();

    // El mail de verificación no puede hacer fallar el alta: si no hay SMTP
    // configurado el usuario entra igual y puede reenviarlo después.
    try {
      const tokenVerificacion = await emitirToken(user._id, 'verificacion-email', VERIFICACION_TTL_MS);
      await enviarMailVerificacion({ to: user.email, nombre: user.nombre, token: tokenVerificacion });
    } catch (mailErr) {
      console.error('No se pudo enviar el mail de verificación:', mailErr);
    }

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    res.status(201).json({
      user: {
        id: user._id,
        email: user.email,
        nombre: user.nombre,
        rol: user.rol,
        emailVerificado: false,
      },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error('Error en registro:', err);
    res.status(500).json({ error: 'No se pudo registrar' });
  }
});

// Login local
/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Inicio de sesión (modo local)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Sesión iniciada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Faltan credenciales
 *       401:
 *         description: Credenciales inválidas
 *       500:
 *         description: Error del servidor
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email y password son requeridos' });
    }

    const user = await Usuario.findOne({ email, provider: 'local' }).select('+passwordHash');
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    res.json({
      user: {
        id: user._id,
        email: user.email,
        nombre: user.nombre,
        rol: user.rol,
        emailVerificado: Boolean(user.emailVerificado),
      },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ error: 'No se pudo iniciar sesión' });
  }
});

// Refresh token
/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresca el access token usando un refresh token válido
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Tokens actualizados
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthTokens'
 *       400:
 *         description: Faltan datos
 *       401:
 *         description: refreshToken inválido
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) return res.status(400).json({ error: 'refreshToken requerido' });

    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded || decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'refreshToken inválido' });
    }

    const user = await Usuario.findById(decoded.sub).lean();
    if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });

    const accessToken = signAccessToken(user);
    const newRefreshToken = signRefreshToken(user);

    res.json({ accessToken, refreshToken: newRefreshToken });
  } catch (err) {
    console.error('Error en refresh:', err);
    res.status(401).json({ error: 'refreshToken inválido' });
  }
});

/**
 * @swagger
 * /api/auth/olvide-password:
 *   post:
 *     summary: Pide un link para restablecer la contraseña
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Si el email existe, se envió el link. La respuesta es siempre la misma.
 *       400:
 *         description: Falta el email
 */
router.post('/olvide-password', async (req, res) => {
  // Respuesta única para no revelar qué emails están registrados.
  const respuestaGenerica = {
    message: 'Si ese email está registrado, te mandamos un link para restablecer la contraseña.',
  };

  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ error: 'email es requerido' });
    }

    const user = await Usuario.findOne({ email, provider: 'local' });
    if (!user) {
      return res.json(respuestaGenerica);
    }

    const rawToken = await emitirToken(user._id, 'reset-password', RESET_TTL_MS);
    await enviarMailResetPassword({ to: user.email, nombre: user.nombre, token: rawToken });

    return res.json(respuestaGenerica);
  } catch (err) {
    console.error('Error en olvide-password:', err);
    // Tampoco filtramos el error: la respuesta no cambia.
    return res.json(respuestaGenerica);
  }
});

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Define una contraseña nueva usando el token recibido por mail
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, password]
 *             properties:
 *               token:
 *                 type: string
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Contraseña actualizada
 *       400:
 *         description: Token inválido o vencido, o contraseña que no cumple los requisitos
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) {
      return res.status(400).json({ error: 'token y password son requeridos' });
    }

    const errorPassword = validatePassword(password);
    if (errorPassword) {
      return res.status(400).json({ error: errorPassword });
    }

    const registro = await consumirToken(token, 'reset-password');
    if (!registro) {
      return res.status(400).json({ error: 'El link no es válido o ya venció. Pedí uno nuevo.' });
    }

    const user = await Usuario.findById(registro.usuario);
    if (!user) {
      return res.status(400).json({ error: 'El link no es válido o ya venció. Pedí uno nuevo.' });
    }

    user.passwordHash = await bcrypt.hash(password, 10);
    await user.save();

    registro.usedAt = new Date();
    await registro.save();

    return res.json({ message: 'Listo, ya podés entrar con tu contraseña nueva.' });
  } catch (err) {
    console.error('Error en reset-password:', err);
    return res.status(500).json({ error: 'No se pudo restablecer la contraseña' });
  }
});

/**
 * @swagger
 * /api/auth/verificar-email:
 *   post:
 *     summary: Confirma la dirección de email con el token recibido
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Email verificado
 *       400:
 *         description: Token inválido o vencido
 */
router.post('/verificar-email', async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) {
      return res.status(400).json({ error: 'token es requerido' });
    }

    const registro = await consumirToken(token, 'verificacion-email');
    if (!registro) {
      return res.status(400).json({ error: 'El link no es válido o ya venció. Pedí uno nuevo.' });
    }

    const user = await Usuario.findById(registro.usuario);
    if (!user) {
      return res.status(400).json({ error: 'El link no es válido o ya venció. Pedí uno nuevo.' });
    }

    user.emailVerificado = true;
    user.emailVerificadoEn = new Date();
    await user.save();

    registro.usedAt = new Date();
    await registro.save();

    return res.json({ message: 'Email verificado', emailVerificado: true });
  } catch (err) {
    console.error('Error en verificar-email:', err);
    return res.status(500).json({ error: 'No se pudo verificar el email' });
  }
});

/**
 * @swagger
 * /api/auth/verificar-email/reenviar:
 *   post:
 *     summary: Reenvía el mail de verificación al usuario autenticado
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Mail reenviado (o el email ya estaba verificado)
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post('/verificar-email/reenviar', verificarToken, async (req, res) => {
  try {
    const user = await Usuario.findById(req.user.uid);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    if (user.emailVerificado) {
      return res.json({ message: 'Tu email ya está verificado', emailVerificado: true });
    }

    const rawToken = await emitirToken(user._id, 'verificacion-email', VERIFICACION_TTL_MS);
    const resultado = await enviarMailVerificacion({
      to: user.email,
      nombre: user.nombre,
      token: rawToken,
    });

    return res.json({
      message: resultado.delivered
        ? 'Te reenviamos el mail de verificación.'
        : 'Generamos el link, pero el envío de mails todavía no está configurado en el servidor.',
      delivered: resultado.delivered,
    });
  } catch (err) {
    console.error('Error reenviando verificación:', err);
    return res.status(500).json({ error: 'No se pudo reenviar el mail' });
  }
});

export default router;
