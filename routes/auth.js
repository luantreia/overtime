// routes/auth.js
import express from 'express';
import bcrypt from 'bcryptjs';
import Usuario from '../models/Usuario.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import mongoose from 'mongoose';

const router = express.Router();

// Registro local
router.post('/registro', async (req, res) => {
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

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    res.status(201).json({
      user: { id: user._id, email: user.email, nombre: user.nombre, rol: user.rol },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error('Error en registro:', err);
    res.status(500).json({ error: 'No se pudo registrar' });
  }
});

// Login local
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
      user: { id: user._id, email: user.email, nombre: user.nombre, rol: user.rol },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ error: 'No se pudo iniciar sesión' });
  }
});

// Refresh token
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

export default router;
