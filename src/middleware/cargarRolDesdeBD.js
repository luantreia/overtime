import Usuario from "../models/Usuario.js";

export const cargarRolDesdeBD = async (req, res, next) => {
  try {
    const uid = req.user?.id;
    if (!uid) {
      console.warn('No se encontró UID en req.user');
      return res.status(401).json({ message: 'No autorizado' });
    }

    const usuario = await Usuario.findById(uid);
    console.log('Usuario obtenido para permisos:', usuario);

    if (!usuario) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    // Conservar el rol de mayor privilegio entre el token y la BD
    const rolToken = (req.user.rol || '').toLowerCase?.() || 'lector';
    const rolDB = (usuario.rol || '').toLowerCase?.() || 'lector';
    const niveles = { lector: 0, editor: 1, admin: 2 };
    const finalRol = (niveles[rolToken] ?? 0) >= (niveles[rolDB] ?? 0) ? rolToken : rolDB;
    req.user.rol = finalRol;

    next();
  } catch (error) {
    console.error('Error al cargar rol:', error);
    return res.status(500).json({ message: 'Error interno' });
  }
};
