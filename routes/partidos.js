import express from 'express';
import Partido from '../models/Partido/Partido.js';
import verificarToken from '../middlewares/authMiddleware.js';
import { cargarRolDesdeBD } from '../middlewares/cargarRolDesdeBD.js';
import { validarObjectId } from '../middlewares/validacionObjectId.js';
import EquipoPartido from '../models/Equipo/EquipoPartido.js'; // asegurate de importar el modelo


const router = express.Router();

// GET /api/partidos/admin - partidos que el usuario puede administrar
router.get('/admin', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const uid = req.user.uid;
    const rol = req.user.rol;

    let partidos;

    if (rol === 'admin') {
      partidos = await Partido.find({}, 'nombrePartido _id fecha estado equipoLocal equipoVisitante competencia fase creadoPor administradores').lean();
    } else {
      partidos = await Partido.find({
        $or: [
          { creadoPor: uid },
          { administradores: uid }
        ]
      }, 'nombrePartido _id fecha estado equipoLocal equipoVisitante competencia fase creadoPor administradores').lean();
    }

    res.status(200).json(partidos);
  } catch (error) {
    console.error('Error al obtener partidos administrables:', error);
    res.status(500).json({ message: 'Error al obtener partidos administrables' });
  }
});

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
        'participacionFaseVisitante',
        'creadoPor',
        'administradores'
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
        'participacionFaseVisitante',
        'creadoPor',
        'administradores'
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
        populate: 'equipo',
      });
      data.equipoLocal = pfLocal?.participacionTemporada?.equipo?._id;
    }

    if (participacionFaseVisitante) {
      const pfVisitante = await ParticipacionFase.findById(participacionFaseVisitante).populate({
        path: 'participacionTemporada',
        populate: 'equipo',
      });
      data.equipoVisitante = pfVisitante?.participacionTemporada?.equipo?._id;
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

import mongoose from 'mongoose';

// PUT /api/partidos/:id - Actualizar partido
router.put(
  '/:id',
  verificarToken,
  cargarRolDesdeBD,
  validarObjectId,
  async (req, res) => {
    try {
      const partido = await Partido.findById(req.params.id);
      if (!partido) {
        return res.status(404).json({ message: 'Partido no encontrado' });
      }

      const uid = req.user.uid;
      const esCreador = partido.creadoPor?.toString() === uid;
      const esAdminDelPartido = partido.administradores?.some(adminId => adminId.toString() === uid);
      const esAdminGlobal = req.user.rol === 'admin';

      if (!esCreador && !esAdminDelPartido && !esAdminGlobal) {
        return res.status(403).json({ message: 'No tiene permiso para editar este partido' });
      }

      const camposEditables = [
        'fecha',
        'ubicacion',
        'estado',
        'fase',
        'etapa',
        'participacionFaseLocal',
        'participacionFaseVisitante',
        'marcadorModificadoManualmente',
        'marcadorLocal',
        'marcadorVisitante',
        'modoEstadisticas',
        'modoVisualizacion',
        'grupo',
        'division',
        'nombrePartido',
        // Nuevos campos permitidos a editar
        'modalidad',
        'categoria',
        'competencia',
      ];

      const objectIdCampos = ['fase', 'participacionFaseLocal', 'participacionFaseVisitante', 'competencia'];

      for (const campo of camposEditables) {
        if (Object.prototype.hasOwnProperty.call(req.body, campo)) {
          if (objectIdCampos.includes(campo)) {
            if (req.body[campo] && !mongoose.Types.ObjectId.isValid(req.body[campo])) {
              return res.status(400).json({ message: `ID inválido para campo ${campo}` });
            }
            partido[campo] = req.body[campo] || null;
          } else {
            partido[campo] = req.body[campo];
          }
        }
      }

      await partido.save();
      res.json(partido);
    } catch (err) {
      console.error('[ERROR][PUT /partidos/:id]', err);
      res.status(500).json({ message: 'Error interno al actualizar el partido', error: err.message });
    }
  }
);

// PUT /api/partidos/:id/recalcular-marcador - Recalcular marcador desde sets
router.put(
  '/:id/recalcular-marcador',
  verificarToken,
  cargarRolDesdeBD,
  validarObjectId,
  async (req, res) => {
    try {
      const partido = await Partido.findById(req.params.id);
      if (!partido) {
        return res.status(404).json({ message: 'Partido no encontrado' });
      }

      const uid = req.user.uid;
      const esCreador = partido.creadoPor?.toString() === uid;
      const esAdminDelPartido = partido.administradores?.some(adminId => adminId.toString() === uid);
      const esAdminGlobal = req.user.rol === 'admin';

      if (!esCreador && !esAdminDelPartido && !esAdminGlobal) {
        return res.status(403).json({ message: 'No tiene permiso para recalcular el marcador de este partido' });
      }

      // Recalcular marcador desde sets
      await partido.recalcularMarcador();
      partido.marcadorModificadoManualmente = false;
      await partido.save();

      res.json(partido);
    } catch (err) {
      console.error('[ERROR][PUT /partidos/:id/recalcular-marcador]', err);
      res.status(500).json({ message: 'Error interno al recalcular marcador', error: err.message });
    }
  }
);

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
