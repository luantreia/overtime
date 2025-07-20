import express from 'express';
import mongoose from 'mongoose';
import ParticipacionTemporada from '../../models/Equipo/ParticipacionTemporada.js';
import Equipo from '../../models/Equipo/Equipo.js';
import EquipoCompetencia from '../../models/Equipo/EquipoCompetencia.js';
import Temporada from '../../models/Competencia/Temporada.js';
import verificarToken from '../../middlewares/authMiddleware.js';
import { validarObjectId } from '../../middlewares/validacionObjectId.js';
import { crearEquipoCompetenciaAuto } from '../../services/equipoCompetenciaService.js';
import { cargarRolDesdeBD } from '../../middlewares/cargarRolDesdeBD.js';
import ParticipacionFase from '../../models/Equipo/ParticipacionFase.js';
import Fase from '../../models/Competencia/Fase.js';

const router = express.Router();
const { Types } = mongoose;

function validarCamposManual(req, res, next) {
  const { temporada, equipo } = req.query;

  // Validar ObjectId en query params si están presentes
  if (temporada && !Types.ObjectId.isValid(temporada)) {
    return res.status(400).json({ message: 'temporada inválida' });
  }
  if (equipo && !Types.ObjectId.isValid(equipo)) {
    return res.status(400).json({ message: 'equipo inválido' });
  }

  // Solo validar body si existe (en POST/PUT)
  if (req.body) {
    if (req.body.equipo && !Types.ObjectId.isValid(req.body.equipo)) {
      return res.status(400).json({ message: 'equipo inválido' });
    }
    if (req.body.temporada && !Types.ObjectId.isValid(req.body.temporada)) {
      return res.status(400).json({ message: 'temporada inválida' });
    }
    const estadosValidos = ['activo', 'baja', 'expulsado'];
    if (req.body.estado && !estadosValidos.includes(req.body.estado)) {
      return res.status(400).json({ message: 'estado inválido' });
    }
    if (req.body.observaciones && typeof req.body.observaciones !== 'string') {
      return res.status(400).json({ message: 'observaciones debe ser texto' });
    }
    if (req.body.observaciones && req.body.observaciones.length > 500) {
      return res.status(400).json({ message: 'observaciones demasiado largo' });
    }
  }

  next();
}
// GET /api/participacion-temporada?temporada=&equipo=
router.get('/', verificarToken, validarCamposManual, async (req, res) => {
  try {
    const { temporada, equipo } = req.query;
    const filtro = {};
    if (temporada) filtro.temporada = temporada;
    if (equipo) filtro.equipo = equipo;

    const participaciones = await ParticipacionTemporada.find(filtro)
      .populate('equipo', 'nombre escudo tipo pais')
      .populate('temporada', 'nombre fechaInicio fechaFin competencia')
      .populate('creadoPor', 'nombre email')
      .sort('-createdAt');

    res.json(participaciones);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener participaciones', error: err.message });
  }
});


// GET /api/participacion-temporada/:id
router.get('/:id', verificarToken, validarObjectId, async (req, res) => {
  try {
    const participacion = await ParticipacionTemporada.findById(req.params.id)
      .populate('equipo', 'nombre escudo tipo pais')
      .populate('temporada', 'nombre fechaInicio fechaFin competencia')
      .populate('creadoPor', 'nombre email');

    if (!participacion) {
      return res.status(404).json({ message: 'Participación no encontrada' });
    }

    res.json(participacion);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al buscar participación', error: err.message });
  }
});


// POST /api/participacion-temporada
router.post('/', verificarToken, validarCamposManual, async (req, res) => {
  try {
    console.log('POST /participacion-temporada body:', req.body);

    const { equipo, temporada } = req.body;

    if (!equipo || !temporada) {
      return res.status(400).json({ message: 'equipo y temporada son obligatorios' });
    }

    // Validar que equipo y temporada existen
    const [equipoDB, temporadaDB] = await Promise.all([
      Equipo.findById(equipo),
      Temporada.findById(temporada),
    ]);
    if (!equipoDB) return res.status(400).json({ message: 'Equipo no encontrado' });
    if (!temporadaDB) return res.status(400).json({ message: 'Temporada no encontrada' });

    // Verificar que no exista ya una participación con el mismo equipo-temporada
    const existe = await ParticipacionTemporada.findOne({ equipo, temporada });
    if (existe) {
      return res.status(409).json({ message: 'Ya existe una participación para este equipo y temporada' });
    }

    const nueva = new ParticipacionTemporada({
      ...req.body,
      creadoPor: req.user?.uid || 'sistema',
    });

    await nueva.save();

    // Crear automáticamente la relación en EquipoCompetencia y ParticipacionesFase
    if (temporadaDB.competencia) {
      try {
        const nuevoEC = await crearEquipoCompetenciaAuto({
          equipo,
          competencia: temporadaDB.competencia,
          creadoPor: req.user?.uid || 'sistema',
        });
        console.log('EquipoCompetencia creado automáticamente:', nuevoEC._id);

        // Obtener todas las fases de esa competencia
        const fases = await Fase.find({ competencia: temporadaDB.competencia });

        // Crear ParticipacionesFase para cada fase
        const promesasParticipacionesFase = fases.map(fase => {
          const participacionFase = new ParticipacionFase({
            participacionTemporada: nueva._id,
            fase: fase._id,
            // Aquí podés agregar lógica para grupo y división si aplica
          });
          return participacionFase.save();
        });

        const participacionesFaseCreadas = await Promise.all(promesasParticipacionesFase);
        console.log(`Se crearon ${participacionesFaseCreadas.length} participaciones en fases automáticamente.`);

      } catch (ecErr) {
        console.warn('No se pudo crear EquipoCompetencia o ParticipacionesFase:', ecErr.message);
      }
    }

    // Finalmente responder con la nueva ParticipacionTemporada creada
    res.status(201).json(nueva);

  } catch (err) {
    console.error(err);
    res.status(400).json({ message: 'Error al crear participación', error: err.message });
  }
});

// PUT /api/participacion-temporada/:id
router.put('/:id', verificarToken, validarObjectId, validarCamposManual, async (req, res) => {
  try {
    const item = await ParticipacionTemporada.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Participación no encontrada' });

    // Si actualizan equipo o temporada validar que existan
    if (req.body.equipo) {
      const equipoDB = await Equipo.findById(req.body.equipo);
      if (!equipoDB) return res.status(400).json({ message: 'Equipo no encontrado' });
    }
    if (req.body.temporada) {
      const temporadaDB = await Temporada.findById(req.body.temporada);
      if (!temporadaDB) return res.status(400).json({ message: 'Temporada no encontrada' });
    }

    // Actualizar
    Object.assign(item, req.body);
    const actualizado = await item.save();
    res.json(actualizado);
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: 'Error al actualizar participación', error: err.message });
  }
});

// DELETE /api/participacion-temporada/:id
router.delete('/:id', verificarToken, validarObjectId, async (req, res) => {
  try {
    const eliminada = await ParticipacionTemporada.findByIdAndDelete(req.params.id);
    if (!eliminada) {
      return res.status(404).json({ message: 'Participación no encontrada' });
    }

    res.json({ message: 'Participación eliminada correctamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al eliminar participación', error: err.message });
  }
});

export default router;
