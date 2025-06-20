// authMiddleware.js
import admin from '../utils/firebaseAdmin.js';

const verificarToken = async (req, res, next) => {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).json({ mensaje: 'Token requerido' });

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    console.log('Decoded UID:', decodedToken.uid);
    req.user = { uid: decodedToken.uid };
    next();
  } catch (error) {
    console.error('Token inválido:', error);
    return res.status(401).json({ error: 'Token inválido' });
  }
};

export default verificarToken;
