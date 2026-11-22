import Usuario from "../models/Usuario.js";

export const cargarRolDesdeBD = async (req, res, next) => {
  try {
    const uid = req.user?.id;
    if (!uid) {
      console.warn('No se encontró UID en req.user');
      return res.status(401).json({ message: 'No autorizado' });
    }

    const usuario = await Usuario.findById(uid);

    if (!usuario) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    // La BD es la única fuente de verdad del rol: un token viejo o forjado
    // no puede conservar privilegios que la BD ya no le da.
    req.user.rol = (usuario.rol || '').toLowerCase() || 'lector';

    next();
  } catch (error) {
    console.error('Error al cargar rol:', error);
    return res.status(500).json({ message: 'Error interno' });
  }
};
