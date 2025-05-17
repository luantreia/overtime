// middlewares/verificarRol.js
import Usuario from '../models/Usuario';

const verificarRol = (rolesPermitidos) => {
  return async (req, res, next) => {
    const uid = req.user.uid;
    const usuario = await Usuario.findOne({ firebaseUid: uid });

    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (!rolesPermitidos.includes(usuario.rol)) {
      return res.status(403).json({ error: 'Acceso denegado: permiso insuficiente' });
    }

    next();
  };
};

export default verificarRol;
