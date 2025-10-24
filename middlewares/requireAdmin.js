export default function requireAdmin(req, res, next) {
  try {
    const rol = req.user?.rol || req.user?.customClaims?.rol;
    if (rol !== 'admin') return res.status(403).json({ error: 'Requiere rol admin' });
    next();
  } catch (e) {
    res.status(403).json({ error: 'Acceso denegado' });
  }
}