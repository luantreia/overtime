import express from 'express';
import Partido from '../models/Partido/Partido.js';
import verificarToken from '../middlewares/authMiddleware.js';
import { cargarRolDesdeBD } from '../middlewares/cargarRolDesdeBD.js';
import { validarObjectId } from '../middlewares/validacionObjectId.js';
import EquipoPartido from '../models/Equipo/EquipoPartido.js'; // asegurate de importar el modelo


const router = express.Router();

// GET /api/partidos - Listar partidos, opcionalmente filtrados por fase o competencia
router.get('/', verificarToken, async (req, res) => {
  try {
    const { fase, competencia, tipo, equipo } = req.query;
    const filtro = {};

    if (tipo === 'amistoso') {
      filtro.competencia = null;
    } else {
      if (fase) filtro.fase = fase;
      if (competencia) filtro.competencia = competencia;
    }

    if (equipo) {
      filtro.$or = [
        { equipoLocal: equipo },
        { equipoVisitante: equipo }
      ];
    }

    const partidos = await Partido.find(filtro)
      .populate([
        'competencia',
        'fase',
        'equipoLocal',
        'equipoVisitante',
        'participacionFaseLocal',
        'participacionFaseVisitante'
      ])
      .sort({ fecha: 1 });

    res.json(partidos);
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener partidos', error: err.message });
  }
});

// GET /api/partidos/:id - Obtener partido por ID
router.get('/:id', verificarToken, validarObjectId, async (req, res) => {
  try {
    const partido = await Partido.findById(req.params.id)
      .populate([
        'competencia',
        'fase',
        'equipoLocal',
        'equipoVisitante',
        'participacionFaseLocal',
        'participacionFaseVisitante'
      ]);

    if (!partido) return res.status(404).json({ message: 'Partido no encontrado' });
    res.json(partido);
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener el partido', error: err.message });
  }
});

// POST /api/partidos
router.post('/', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const { participacionFaseLocal, participacionFaseVisitante } = req.body;
    const data = {
      ...req.body,
      creadoPor: req.user.uid,
    };
    const ParticipacionFase = (await import('../models/Equipo/ParticipacionFase.js')).default;
    const Fase = (await import('../models/Competencia/Fase.js')).default;
    const Competencia = (await import('../models/Competencia/Competencia.js')).default;


    // Resolver equipoLocal y equipoVisitante si no vienen
    if (participacionFaseLocal) {
      const pfLocal = await ParticipacionFase.findById(participacionFaseLocal).populate({
        path: 'participacionTemporada',
        populate: {
          path: 'equipoCompetencia',
          populate: 'equipo',
        },
      });
      data.equipoLocal = pfLocal?.participacionTemporada?.equipoCompetencia?.equipo?._id;
    }

    if (participacionFaseVisitante) {
      const pfVisitante = await ParticipacionFase.findById(participacionFaseVisitante).populate({
        path: 'participacionTemporada',
        populate: {
          path: 'equipoCompetencia',
          populate: 'equipo',
        },
      });
      data.equipoVisitante = pfVisitante?.participacionTemporada?.equipoCompetencia?.equipo?._id;
    }

  // --- Completar competencia desde fase ---
  if (!data.competencia && data.fase) {
    const fase = await Fase.findById(data.fase)
      .populate({
        path: 'temporada',
        populate: { path: 'competencia' }
      });

    if (fase?.temporada?.competencia?._id) {
      data.competencia = fase.temporada.competencia._id;
    }
  }

  // --- Completar modalidad y categoría desde competencia ---
  if (data.competencia && (!data.modalidad || !data.categoria)) {
    const comp = await Competencia.findById(data.competencia);
    if (comp) {
      if (!data.modalidad) data.modalidad = comp.modalidad;
      if (!data.categoria) data.categoria = comp.categoria;
    }
  }

  console.log('Datos para crear partido:', data);
    const nuevoPartido = new Partido(data);
    await nuevoPartido.save();


    // Crear equipo local
    await EquipoPartido.create({
      partido: nuevoPartido._id,
      equipo: nuevoPartido.equipoLocal,
      participacionFase: nuevoPartido.participacionFaseLocal,
      esLocal: true,
      creadoPor: req.user.uid,  
    });

    // Crear equipo visitante
    await EquipoPartido.create({
      partido: nuevoPartido._id,
      equipo: nuevoPartido.equipoVisitante,
      participacionFase: nuevoPartido.participacionFaseVisitante,
      esLocal: false,
      creadoPor: req.user.uid,
    });

    // Después de crear EquipoPartido local y visitante
    if (nuevoPartido.estado === 'finalizado') {
      await nuevoPartido.recalcularMarcador(); // Opcional, si querés calcular por sets
      await nuevoPartido.save(); // Esto dispara el post('save') y asigna resultado a los equipos
    }

    res.status(201).json(nuevoPartido);
  } catch (err) {
    console.error('Error creando partido:', err);
    res.status(400).json({ message: 'Error al crear el partido', error: err.message });
  }
});

// PUT /api/partidos/:id - Actualizar partido
router.put('/:id', verificarToken, cargarRolDesdeBD, validarObjectId, async (req, res) => {
  try {
    const partido = await Partido.findById(req.params.id);
    if (!partido) return res.status(404).json({ message: 'Partido no encontrado' });

    // Permite editar solo si es creador, admin del partido o rol admin global
    if (
      partido.creadoPor !== req.user.uid &&
      !partido.administradores.includes(req.user.uid) &&
      req.user.rol !== 'admin'
    ) {
      return res.status(403).json({ message: 'No tiene permiso para editar este partido' });
    }

    // Opcional: Podés filtrar campos que sí pueden editarse, para mayor seguridad
    Object.assign(partido, req.body);

    await partido.save();
    res.json(partido);
  } catch (err) {
    res.status(400).json({ message: 'Error al actualizar el partido', error: err.message });
  }
});

// DELETE /api/partidos/:id - Eliminar partido
router.delete('/:id', verificarToken, cargarRolDesdeBD, validarObjectId, async (req, res) => {
  try {
    const partido = await Partido.findById(req.params.id);
    if (!partido) return res.status(404).json({ message: 'Partido no encontrado' });

    if (
      partido.creadoPor !== req.user.uid &&
      !partido.administradores.includes(req.user.uid) &&
      req.user.rol !== 'admin'
    ) {
      return res.status(403).json({ message: 'No tiene permiso para eliminar este partido' });
    }

    await partido.deleteOne();
    res.json({ message: 'Partido eliminado correctamente' });
  } catch (err) {
    res.status(500).json({ message: 'Error al eliminar el partido', error: err.message });
  }
});

export default router;
