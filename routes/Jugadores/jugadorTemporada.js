import express from 'express';
import JugadorTemporada from '../../models/Jugador/JugadorTemporada.js';
import JugadorCompetencia from '../../models/Jugador/JugadorCompetencia.js';
import ParticipacionTemporada from '../../models/Equipo/ParticipacionTemporada.js';
import verificarToken from '../../middlewares/authMiddleware.js';
import JugadorEquipo from '../../models/Jugador/JugadorEquipo.js';
import { cargarRolDesdeBD } from '../../middlewares/cargarRolDesdeBD.js';
import { validarObjectId } from '../../middlewares/validacionObjectId.js';

const router = express.Router();

// Helper para obtener competencia desde participacionTemporada
export async function obtenerCompetenciaDesdeParticipacionTemporada(participacionTemporadaId) {
  const participacion = await ParticipacionTemporada.findById(participacionTemporadaId).populate('temporada');

  if (!participacion?.temporada?.competencia) {
    return null;
  }

  return participacion.temporada.competencia;
}

function sanitizarCamposString(obj, campos) {
  campos.forEach(campo => {
    if (obj[campo]) {
      obj[campo] = Array.isArray(obj[campo]) ? obj[campo][0] : obj[campo];
    }
  });
}

// GET /api/jugador-temporada?jugadorCompetencia=...&participacionTemporada=...
router.get('/', async (req, res) => {
  try {
    const filtro = {};
    if (req.query.jugadorCompetencia) filtro.jugadorCompetencia = req.query.jugadorCompetencia;
    if (req.query.participacionTemporada) filtro.participacionTemporada = req.query.participacionTemporada;

    const items = await JugadorTemporada.find(filtro)
      .populate({
        path: 'jugadorEquipo',
        populate: {
          path: 'jugador',
          select: 'nombre alias genero foto',
        },
      })
      .lean();

    res.json(items);
  } catch (err) {
    console.error('Error en GET jugador-temporada:', err);
    res.status(500).json({ error: 'Error al obtener datos' });
  }
});

// GET /api/jugador-temporada/:id
router.get('/:id', validarObjectId, async (req, res) => {
  try {
    const item = await JugadorTemporada.findById(req.params.id).lean();
    if (!item) return res.status(404).json({ error: 'No encontrado' });
    res.json(item);
  } catch {
    res.status(500).json({ error: 'Error al obtener' });
  }
});

// POST /api/jugador-temporada
router.post('/', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    console.log('req.body.estado antes sanitizar:', req.body.estado);
    console.log('req.body.rol antes sanitizar:', req.body.rol);

    sanitizarCamposString(req.body, ['estado', 'rol']);

    console.log('req.body.estado después sanitizar:', req.body.estado);
    console.log('req.body.rol después sanitizar:', req.body.rol);

    const { jugadorEquipo, participacionTemporada, estado, rol } = req.body;
    console.log('req.body:', req.body);

    if (!jugadorEquipo || !participacionTemporada) {
      return res.status(400).json({ error: 'jugador y participacionTemporada son requeridos' });
    }
    // Buscar jugadorEquipo y extraer jugador
    const jugadorEquipoDoc = await JugadorEquipo.findById(jugadorEquipo).select('jugador');
    console.log('JugadorEquipo encontrado:', jugadorEquipoDoc);
    if (!jugadorEquipoDoc) {
      return res.status(400).json({ error: 'jugadorEquipo no válido o no encontrado' });
    }
    const jugador = jugadorEquipoDoc.jugador;

    // Obtener competencia desde participacionTemporada
    const competenciaId = await obtenerCompetenciaDesdeParticipacionTemporada(participacionTemporada);
    console.log('Competencia obtenida:', competenciaId); 
    if (!competenciaId) {
      return res.status(400).json({ error: 'No se pudo obtener la competencia desde la participación' });
    }

    // Crear o reutilizar JugadorCompetencia
    const jugadorCompetencia = await JugadorCompetencia.findOneAndUpdate(
      { jugador, competencia: competenciaId },
      { jugador, competencia: competenciaId },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );


    // Crear nuevo JugadorTemporada
    const nuevo = new JugadorTemporada({
      jugadorEquipo,
      participacionTemporada,
      estado,
      rol,
      jugador: jugadorEquipoDoc.jugador,
      creadoPor: req.user.uid,
    });

    const guardado = await nuevo.save();

    res.status(201).json(guardado);
  } catch (err) {
    console.error('Error en POST jugador-temporada:', err);
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/jugador-temporada/:id
router.put('/:id', validarObjectId, verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const item = await JugadorTemporada.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'No encontrado' });

    sanitizarCamposString(req.body, ['estado', 'rol']);
    Object.assign(item, req.body);

    const actualizado = await item.save();
    res.json(actualizado);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/jugador-temporada/:id
router.delete('/:id', validarObjectId, verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const item = await JugadorTemporada.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'No encontrado' });

    await item.deleteOne();
    res.json({ mensaje: 'Eliminado' });
  } catch {
    res.status(500).json({ error: 'Error al eliminar' });
  }
});

// GET /api/jugador-temporada/temporadas-jugador?jugador=...
router.get('/temporadas-jugador', async (req, res) => {
  try {
    const { jugador } = req.query;
    if (!jugador) return res.status(400).json({ error: 'Falta el parámetro jugador' });

    // Buscar todas las JugadorTemporada del jugador
    const jugadorTemporadas = await JugadorTemporada.find({ jugador })
      .populate({
        path: 'participacionTemporada',
        populate: {
          path: 'temporada',
          populate: {
            path: 'competencia',
            select: 'nombre modalidad categoria organizacion'
          }
        }
      })
      .populate({
        path: 'jugadorEquipo',
        populate: {
          path: 'equipo',
          select: 'nombre'
        }
      })
      .lean();

    // Transformar los datos para el frontend
    const temporadasFormateadas = jugadorTemporadas.map(jt => {
      const participacionTemporada = jt.participacionTemporada;
      const temporada = participacionTemporada?.temporada;
      const competencia = temporada?.competencia;
      const equipo = jt.jugadorEquipo?.equipo;

      if (!temporada || !competencia || !equipo) return null;

      return {
        id: temporada._id,
        nombre: temporada.nombre,
        descripcion: temporada.descripcion,
        fechaInicio: temporada.fechaInicio,
        fechaFin: temporada.fechaFin,
        competencia: {
          id: competencia._id,
          nombre: competencia.nombre,
          modalidad: competencia.modalidad,
          categoria: competencia.categoria,
        },
        equipo: {
          id: equipo._id,
          nombre: equipo.nombre,
        },
        estado: jt.estado,
        rol: jt.rol,
      };
    }).filter(Boolean); // Remover nulls

    res.json(temporadasFormateadas);
  } catch (error) {
    console.error('Error obteniendo temporadas del jugador:', error);
    res.status(500).json({ error: 'Error al obtener temporadas' });
  }
});

export default router;
