// middlewares/authMiddleware.js

import admin from '../utils/firebaseAdmin.js'; // tu configuración de Firebase Admin SDK

const verificarToken = async (req, res, next) => {
  const token = req.headers.authorization?.split('Bearer ')[1];

  if (!token) return res.status(401).json({ mensaje: 'Token requerido' });

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = { 
      uid: decodedToken.uid,
      rol: decodedToken.rol || "lector",
    };
    next();
  } catch (error) {
    console.error('Token inválido:', error);
    return res.status(401).json({ error: 'Token inválido' });
  }
};

export default verificarToken;
