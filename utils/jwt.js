// utils/jwt.js
import jwt from 'jsonwebtoken';

const ACCESS_TTL = process.env.JWT_ACCESS_TTL || '30d';
const REFRESH_TTL = process.env.JWT_REFRESH_TTL || '30d';

const resolveSecret = () => {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }

  if (process.env.JWT_SECRET_FALLBACK) {
    console.warn('⚠️  Usando JWT_SECRET_FALLBACK, define JWT_SECRET lo antes posible.');
    return process.env.JWT_SECRET_FALLBACK;
  }

  if (process.env.NODE_ENV !== 'production') {
    console.warn('⚠️  JWT_SECRET no definido. Usando valor por defecto SOLO para desarrollo.');
    return 'dev-secret-change-me';
  }

  throw new Error('JWT_SECRET no está definido. Configura JWT_SECRET en el entorno.');
};

const ACCESS_SECRET = resolveSecret();
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || ACCESS_SECRET;

export function signAccessToken(user) {
  const payload = {
    sub: user._id,
    rol: user.rol,
    email: user.email,
  };
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_TTL });
}

export function signRefreshToken(user) {
  const payload = {
    sub: user._id,
    type: 'refresh',
  };
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_TTL });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET);
}
