// authMiddleware.js
import admin from '../utils/firebaseAdmin.js';
import { verifyAccessToken } from '../utils/jwt.js';

const verificarToken = async (req, res, next) => {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).json({ mensaje: 'Token requerido' });

  try {
    // 1) Intentar validar JWT propio
    try {
      const decoded = verifyAccessToken(token);
      req.user = { id: decoded.sub, uid: decoded.sub, rol: decoded.rol, email: decoded.email, provider: 'local' };
      return next();
    } catch (e) {
      // Continuar a Firebase si no es un JWT válido
    }

    // 2) Fallback: validar token de Firebase
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = { id: decodedToken.uid, rol: decodedToken.rol, provider: 'firebase', uid: decodedToken.uid };
    return next();
  } catch (error) {
    console.error('Token inválido:', error);
    return res.status(401).json({ error: 'Token inválido' });
  }
};

export default verificarToken;
