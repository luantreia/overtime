// utils/jwt.js
import jwt from 'jsonwebtoken';

const ACCESS_TTL = process.env.JWT_ACCESS_TTL || '20m';
const REFRESH_TTL = process.env.JWT_REFRESH_TTL || '30d';
const ACCESS_SECRET = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;

if (!ACCESS_SECRET) {
  console.warn('JWT_SECRET no está definido. Define JWT_SECRET en el entorno.');
}

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
