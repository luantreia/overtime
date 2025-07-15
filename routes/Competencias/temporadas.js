import express from 'express';
import Temporada from '../../models/Competencia/Temporada.js';
import Competencia from '../../models/Competencia/Competencia.js';
import verificarToken from '../../middlewares/authMiddleware.js';
import { cargarRolDesdeBD } from '../../middlewares/cargarRolDesdeBD.js';
import { validarObjectId } from '../../middlewares/validacionObjectId.js';
import { esAdminDeEntidad } from '../../middlewares/esAdminDeEntidad.js';

const router = express.Router();

// Listar temporadas de una competencia (público)
router.get('/', async (req, res) => {
  const { competencia } = req.query;
  if (!competencia) return res.status(400).json({ error: 'Falta el parámetro competencia' });

  try {
    const temporadas = await Temporada.find({ competencia }).lean();
    res.json(temporadas);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener temporadas' });
  }
});

// Obtener temporada por ID (público)
router.get('/:id', validarObjectId, async (req, res) => {
  try {
    const temporada = await Temporada.findById(req.params.id).lean();
    if (!temporada) return res.status(404).json({ error: 'Temporada no encontrada' });
    res.json(temporada);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener temporada' });
  }
});

// Crear temporada (solo usuarios autenticados y admins/administradores competencia)
router.post('/',
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      const { competencia, nombre, descripcion, fechaInicio, fechaFin } = req.body;
      if (!competencia || !nombre ) {
        return res.status(400).json({ error: 'Faltan datos obligatorios' });
      }

      // Validar competencia existe y permisos
      const competenciaObj = await Competencia.findById(competencia);
      if (!competenciaObj) return res.status(404).json({ error: 'Competencia no encontrada' });

      const esAdminGlobal = req.user.rol === 'admin';
      const esAdminCompetencia = competenciaObj.administradores?.includes(req.user.uid);
      const esCreadorCompetencia = competenciaObj.creadoPor?.toString() === req.user.uid;

      if (!esAdminGlobal && !esAdminCompetencia && !esCreadorCompetencia) {
        return res.status(403).json({ error: 'No tienes permisos para crear temporadas en esta competencia' });
      }

      const nuevaTemporada = new Temporada({
        competencia,
        nombre,
        descripcion,
        fechaInicio,
        fechaFin,
        creadoPor: req.user.uid,
        administradores: [req.user.uid]
      });

      const guardada = await nuevaTemporada.save();
      res.status(201).json(guardada);
    } catch (error) {
      res.status(400).json({ error: error.message || 'Error al crear temporada' });
    }
  }
);

// Middleware para cargar temporada y validar permisos admin (para PUT y DELETE)
async function cargarTemporadaYValidarAdmin(req, res, next) {
  try {
    const temporada = await Temporada.findById(req.params.id);
    if (!temporada) return res.status(404).json({ error: 'Temporada no encontrada' });

    // Cargar competencia para validar admins
    const competencia = await Competencia.findById(temporada.competencia);

    const esAdminGlobal = req.user.rol === 'admin';
    const esAdminCompetencia = competencia.administradores?.includes(req.user.uid);
    const esAdminTemporada = temporada.administradores?.includes(req.user.uid);
    const esCreadorCompetencia = competencia.creadoPor?.toString() === req.user.uid;
    const esCreadorTemporada = temporada.creadoPor?.toString() === req.user.uid;

    const tienePermiso = esAdminGlobal ||
      esAdminCompetencia ||
      esAdminTemporada ||
      esCreadorCompetencia ||
      esCreadorTemporada;

    if (!tienePermiso) {
      return res.status(403).json({ error: 'No tienes permisos para modificar esta temporada' });
    }

    req.temporada = temporada;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Error en validación de permisos' });
  }
}

// Actualizar temporada
router.put('/:id',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  cargarTemporadaYValidarAdmin,
  async (req, res) => {
    try {
      Object.assign(req.temporada, req.body);
      const actualizada = await req.temporada.save();
      res.json(actualizada);
    } catch (error) {
      res.status(400).json({ error: error.message || 'Error al actualizar temporada' });
    }
  }
);

// Eliminar temporada
router.delete('/:id',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  cargarTemporadaYValidarAdmin,
  async (req, res) => {
    try {
      await req.temporada.deleteOne();
      res.json({ mensaje: 'Temporada eliminada correctamente' });
    } catch (error) {
      res.status(400).json({ error: 'Error al eliminar temporada' });
    }
  }
);

export default router;
