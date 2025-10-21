import express from 'express';
import { validarObjectId } from '../../middlewares/validacionObjectId.js';
import verificarToken from '../../middlewares/authMiddleware.js';
import { cargarRolDesdeBD } from '../../middlewares/cargarRolDesdeBD.js';
import EstadisticasJugadorPartidoManual from '../../models/Jugador/EstadisticasJugadorPartidoManual.js';
import JugadorPartido from '../../models/Jugador/JugadorPartido.js';

const router = express.Router();

// GET /api/estadisticas/jugador-partido-manual
router.get(
  '/',
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      const { partido, jugadorPartido, jugador, equipo } = req.query;

      // Construir filtro dinámico
      const filtro = {};

      // Si se solicita por partido, buscar a través de jugadorPartido
      if (partido) {
        const { default: JugadorPartido } = await import('../../models/Jugador/JugadorPartido.js');
        const jugadoresDelPartido = await JugadorPartido.find({ partido }).select('_id');
        const idsJugadorPartido = jugadoresDelPartido.map(jp => jp._id);
        filtro.jugadorPartido = { $in: idsJugadorPartido };
      }

      if (jugadorPartido) filtro.jugadorPartido = jugadorPartido;
      if (jugador) filtro.jugador = jugador;
      if (equipo) filtro.equipo = equipo;

      const estadisticas = await EstadisticasJugadorPartidoManual.find(filtro)
        .populate({
          path: 'jugadorPartido',
          populate: [
            { path: 'jugador', select: 'nombre apellido email' },
            { path: 'equipo', select: 'nombre' },
            { path: 'partido', select: 'nombrePartido fecha' }
          ]
        })
        .lean()
        .sort({ createdAt: 1 });

      // Formatear respuesta para incluir jugador y equipo en el nivel superior
      const estadisticasFormateadas = estadisticas.map(stat => ({
        ...stat,
        jugador: stat.jugadorPartido?.jugador || null,
        equipo: stat.jugadorPartido?.equipo || null,
        partido: stat.jugadorPartido?.partido || null
      }));

      res.json(estadisticasFormateadas);
    } catch (err) {
      console.error('Error al obtener estadísticas manuales:', err);
      res.status(500).json({ error: err.message || 'Error al obtener estadísticas manuales' });
    }
  }
);

// POST /api/estadisticas/jugador-partido-manual
router.post(
  '/',
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      const { jugadorPartido, throws, hits, outs, catches, notas } = req.body;
      if (!jugadorPartido) {
        return res.status(400).json({ error: 'jugadorPartido es obligatorio' });
      }

      // Verificar si ya existe una estadística para este jugadorPartido
      const existente = await EstadisticasJugadorPartidoManual.findOne({ jugadorPartido });
      if (existente) {
        return res.status(409).json({
          error: 'Ya existe una estadística manual para este jugador en el partido',
          mensaje: 'Si deseas modificar las estadísticas existentes, usa el método PUT para actualizar.',
          estadisticaExistente: existente._id,
          tipo: 'duplicado'
        });
      }

      const nuevo = new EstadisticasJugadorPartidoManual({
        jugadorPartido,
        throws,
        hits,
        outs,
        catches,
        notas,
        ultimaActualizacion: new Date(),
        creadoPor: req.user.uid,
      });

      const guardado = await nuevo.save();
      res.status(201).json(guardado);
    } catch (err) {
      // Manejar específicamente errores de duplicado de MongoDB
      if (err.code === 11000 || err.message.includes('duplicate key')) {
        return res.status(409).json({
          error: 'Ya existe una estadística manual para este jugador en el partido',
          mensaje: 'No se pueden crear estadísticas duplicadas para el mismo jugador.',
          tipo: 'duplicado'
        });
      }

      console.error('Error al crear estadísticas manuales:', err);
      res.status(400).json({ error: err.message || 'Error al crear estadísticas manuales' });
    }
  }
);

// PUT /api/estadisticas/jugador-partido-manual/upsert
// Crear o actualizar estadísticas manuales (upsert)
router.put('/upsert', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const { jugadorPartido, throws, hits, outs, catches, notas } = req.body;
    if (!jugadorPartido) {
      return res.status(400).json({ error: 'jugadorPartido es obligatorio' });
    }

    // Usar upsert para crear o actualizar
    const estadistica = await EstadisticasJugadorPartidoManual.findOneAndUpdate(
      { jugadorPartido }, // Filtro
      {
        throws,
        hits,
        outs,
        catches,
        notas,
        ultimaActualizacion: new Date(),
        creadoPor: req.user.uid,
        version: { $inc: 1 } // Incrementar versión
      }, // Datos a actualizar
      {
        new: true, // Retornar documento actualizado
        upsert: true, // Crear si no existe
        runValidators: true, // Ejecutar validaciones
        setDefaultsOnInsert: true // Establecer valores por defecto al insertar
      }
    );

    // Determinar si fue creado o actualizado
    const fueCreado = estadistica.createdAt.getTime() === estadistica.updatedAt.getTime();

    res.status(fueCreado ? 201 : 200).json({
      ...estadistica.toObject(),
      operacion: fueCreado ? 'creado' : 'actualizado',
      mensaje: fueCreado
        ? 'Estadísticas manuales creadas exitosamente'
        : 'Estadísticas manuales actualizadas exitosamente'
    });

  } catch (err) {
    console.error('Error en upsert de estadísticas manuales:', err);
    res.status(400).json({ error: err.message || 'Error al guardar estadísticas manuales' });
  }
});
router.put(
  '/:id',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      const item = await EstadisticasJugadorPartidoManual.findById(req.params.id);
      if (!item) return res.status(404).json({ error: 'Estadísticas manuales no encontradas' });

      const campos = ['throws', 'hits', 'outs', 'catches', 'notas'];
      for (const c of campos) {
        if (Object.prototype.hasOwnProperty.call(req.body, c)) {
          item[c] = req.body[c];
        }
      }

      item.ultimaActualizacion = new Date();
      item.version = (item.version || 1) + 1; // Incrementar versión

      const actualizado = await item.save();
      res.json({
        ...actualizado.toObject(),
        operacion: 'actualizado',
        mensaje: 'Estadísticas manuales actualizadas exitosamente'
      });
    } catch (err) {
      console.error('Error al actualizar estadísticas manuales:', err);
      res.status(400).json({ error: err.message || 'Error al actualizar estadísticas manuales' });
    }
  }
);

// DELETE /api/estadisticas/jugador-partido-manual/:id
router.delete(
  '/:id',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  async (req, res) => {
    try {
      const item = await EstadisticasJugadorPartidoManual.findById(req.params.id);
      if (!item) return res.status(404).json({ error: 'Estadísticas manuales no encontradas' });

      await item.deleteOne();
      res.json({ mensaje: 'Estadísticas manuales eliminadas' });
    } catch (err) {
      res.status(500).json({ error: 'Error al eliminar estadísticas manuales' });
    }
  }
);

// GET /api/estadisticas/jugador-partido-manual/resumen-partido/:partidoId
router.get('/resumen-partido/:partidoId', verificarToken, async (req, res) => {
  try {
    const { partidoId } = req.params;
    console.log('🔍 Buscando estadísticas manuales para partido:', partidoId);

    // Primero obtener los JugadorPartido de este partido
    const jugadoresDelPartido = await JugadorPartido.find({ partido: partidoId }).select('_id');
    const jugadorPartidoIds = jugadoresDelPartido.map(jp => jp._id);
    console.log('👥 Jugadores del partido encontrados:', jugadorPartidoIds.length);

    // Obtener estadísticas manuales de jugadores del partido
    const jugadoresStats = await EstadisticasJugadorPartidoManual.find({
      jugadorPartido: { $in: jugadorPartidoIds }
    })
    .populate({
      path: 'jugadorPartido',
      populate: [
        { path: 'jugador', select: 'nombre apellido numero' },
        { path: 'equipo', select: 'nombre escudo' }
      ]
    });

    console.log('📊 Estadísticas manuales encontradas:', jugadoresStats.length);
    console.log('📈 Primera estadística:', jugadoresStats[0] || 'Ninguna');

    // Calcular estadísticas por equipo agregando las estadísticas de jugadores
    const equiposMap = {};

    jugadoresStats.forEach(stat => {
      const equipo = stat.jugadorPartido?.equipo;
      console.log('🏆 Procesando estadística para equipo:', equipo?.nombre || 'Sin equipo');
      if (equipo) {
        const equipoId = equipo._id || equipo;

        if (!equiposMap[equipoId]) {
          equiposMap[equipoId] = {
            _id: equipoId,
            nombre: equipo.nombre,
            escudo: equipo.escudo,
            throws: 0,
            hits: 0,
            outs: 0,
            catches: 0,
            jugadores: 0
          };
        }

        equiposMap[equipoId].throws += stat.throws || 0;
        equiposMap[equipoId].hits += stat.hits || 0;
        equiposMap[equipoId].outs += stat.outs || 0;
        equiposMap[equipoId].catches += stat.catches || 0;
        equiposMap[equipoId].jugadores += 1;
      }
    });

    // Calcular efectividad para cada equipo
    Object.values(equiposMap).forEach(equipo => {
      equipo.efectividad = equipo.throws > 0 ? ((equipo.hits / equipo.throws) * 100).toFixed(1) : 0;
    });

    const equiposStats = Object.values(equiposMap);
    console.log('🏆 Estadísticas de equipos calculadas:', equiposStats);

    res.json({
      jugadores: jugadoresStats,
      equipos: equiposStats
    });

  } catch (error) {
    console.error('Error en resumen de estadísticas manuales:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas manuales del partido' });
  }
});

export default router;
