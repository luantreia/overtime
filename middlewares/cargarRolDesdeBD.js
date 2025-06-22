import Usuario from "../models/Usuario.js";

export const cargarRolDesdeBD = async (req, res, next) => {
  try {
    const uid = req.user?.uid;
    if (!uid) {
      console.warn('No se encontró UID en req.user');
      return res.status(401).json({ message: 'No autorizado' });
    }

    const usuario = await Usuario.findById(uid);
    console.log('Usuario obtenido para permisos:', usuario);

    if (!usuario) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    req.user.rol = usuario.rol || 'lector'; // fallback si por alguna razón no tiene rol

    next();
  } catch (error) {
    console.error('Error al cargar rol:', error);
    return res.status(500).json({ message: 'Error interno' });
  }
};
