import express from 'express';
import EquipoPartido from '../../models/Equipo/EquipoPartido.js';
import ParticipacionFase from '../../models/Equipo/ParticipacionFase.js';
import mongoose from 'mongoose';
import verificarToken from '../../middlewares/authMiddleware.js';
import { validarObjectId } from '../../middlewares/validacionObjectId.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: EquipoPartido
 *   description: Vínculos entre equipos y partidos
 */


// ✅ GET - Obtener todos (opcionalmente filtrados por partido o equipo)
/**
 * @swagger
 * /api/equipo-partido:
 *   get:
 *     summary: Lista vínculos equipo-partido
 *     tags: [EquipoPartido]
 *     parameters:
 *       - in: query
 *         name: partido
 *         schema:
 *           type: string
 *           format: ObjectId
 *       - in: query
 *         name: equipo
 *         schema:
 *           type: string
 *           format: ObjectId
 *     responses:
 *       200:
 *         description: Lista de vínculos
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/EquipoPartido'
 *       500:
 *         description: Error del servidor
 */
router.get('/', async (req, res) => {
  try {
    const filtro = {};
    if (req.query.partido) filtro.partido = req.query.partido;
    if (req.query.equipo) filtro.equipo = req.query.equipo;

    const resultados = await EquipoPartido.find(filtro)
      .populate('partido')
      .populate('equipo')
      .populate('equipoCompetencia')
      .populate('participacionTemporada')
      .populate('participacionFase');

    res.json(resultados);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * @swagger
 * /api/equipo-partido/opciones:
 *   get:
 *     summary: Opciones de ParticipacionFase para una Fase
 *     description: Lista las participaciones de equipos en la fase indicada. Permite filtrar por nombre de equipo.
 *     tags: [EquipoPartido]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: fase
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Filtro por nombre de equipo
 *     responses:
 *       200:
 *         description: Lista de opciones
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Error del servidor
 */
router.get('/opciones', verificarToken, async (req, res) => {
  try {
    const { fase, q } = req.query;
    if (!fase || !mongoose.Types.ObjectId.isValid(fase)) {
      return res.status(400).json({ message: 'fase inválida' });
    }

    const lista = await ParticipacionFase.find({ fase })
      .populate({
        path: 'participacionTemporada',
        populate: { path: 'equipo', select: 'nombre escudo tipo pais' }
      })
      .lean();

    let opciones = lista.map(pf => ({
      _id: pf._id,
      equipo: pf.participacionTemporada?.equipo ? {
        _id: pf.participacionTemporada.equipo._id,
        nombre: pf.participacionTemporada.equipo.nombre,
        escudo: pf.participacionTemporada.equipo.escudo,
        tipo: pf.participacionTemporada.equipo.tipo,
        pais: pf.participacionTemporada.equipo.pais,
      } : null,
      grupo: pf.grupo,
      division: pf.division,
    }));

    if (q) {
      const regex = new RegExp(q, 'i');
      opciones = opciones.filter(o => o.equipo?.nombre && regex.test(o.equipo.nombre));
    }

    return res.json(opciones);
  } catch (err) {
    console.error('Error en GET /equipo-partido/opciones:', err);
    res.status(500).json({ message: 'Error al obtener opciones', error: err.message });
  }
});

// ✅ GET - Obtener uno por ID
/**
 * @swagger
 * /api/equipo-partido/{id}:
 *   get:
 *     summary: Obtiene un vínculo equipo-partido por ID
 *     tags: [EquipoPartido]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *     responses:
 *       200:
 *         description: Vínculo obtenido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EquipoPartido'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Error del servidor
 */
router.get('/:id', validarObjectId, async (req, res) => {
  try {
    const resultado = await EquipoPartido.findById(req.params.id)
      .populate('partido')
      .populate('equipo')
      .populate('equipoCompetencia')
      .populate('participacionTemporada')
      .populate('participacionFase');

    if (!resultado) return res.status(404).json({ message: 'No encontrado' });
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ POST - Crear uno nuevo
/**
 * @swagger
 * /api/equipo-partido:
 *   post:
 *     summary: Crea un vínculo equipo-partido
 *     tags: [EquipoPartido]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EquipoPartido'
 *     responses:
 *       201:
 *         description: Creado
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Error del servidor
 */
router.post('/', verificarToken, async (req, res) => {
  try {
    const nuevo = new EquipoPartido({
      ...req.body,
      creadoPor: req.usuarioId,
    });

    const guardado = await nuevo.save();

    // Crear automáticamente estadísticas iniciales para este equipo en el partido
    try {
      const { default: EstadisticasEquipoPartido } = await import('../../models/Equipo/EstadisticasEquipoPartido.js');

      const estadisticasIniciales = new EstadisticasEquipoPartido({
        partido: req.body.partido,
        equipo: req.body.equipo,
        throws: 0,
        hits: 0,
        outs: 0,
        catches: 0,
        efectividad: 0,
        jugadores: 0,
        creadoPor: req.usuarioId,
      });

      await estadisticasIniciales.save();
      console.log('✅ EstadisticasEquipoPartido iniciales creadas para equipo:', req.body.equipo);
    } catch (statsError) {
      console.error('⚠️ Error creando estadísticas iniciales de equipo:', statsError);
      // No fallar la petición principal
    }

    res.status(201).json(guardado);
  } catch (err) {
    if (err.code === 11000) {
      res.status(400).json({ message: 'Ya existe un vínculo para ese partido y equipo' });
    } else {
      res.status(500).json({ message: err.message });
    }
  }
});

// ✅ PUT - Editar uno existente
/**
 * @swagger
 * /api/equipo-partido/{id}:
 *   put:
 *     summary: Actualiza un vínculo equipo-partido
 *     tags: [EquipoPartido]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EquipoPartido'
 *     responses:
 *       200:
 *         description: Actualizado
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Error del servidor
 */
router.put('/:id', verificarToken, validarObjectId, async (req, res) => {
  try {
    const actualizado = await EquipoPartido.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (!actualizado) return res.status(404).json({ message: 'No encontrado' });
    res.json(actualizado);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ DELETE - Eliminar uno
/**
 * @swagger
 * /api/equipo-partido/{id}:
 *   delete:
 *     summary: Elimina un vínculo equipo-partido
 *     tags: [EquipoPartido]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *     responses:
 *       200:
 *         description: Eliminado correctamente
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Error del servidor
 */
router.delete('/:id', verificarToken, validarObjectId, async (req, res) => {
  try {
    const equipoPartido = await EquipoPartido.findById(req.params.id);
    if (!equipoPartido) return res.status(404).json({ message: 'No encontrado' });

    // Eliminar también las estadísticas asociadas
    try {
      const { default: EstadisticasEquipoPartido } = await import('../../models/Equipo/EstadisticasEquipoPartido.js');
      await EstadisticasEquipoPartido.deleteMany({
        partido: equipoPartido.partido,
        equipo: equipoPartido.equipo
      });
      console.log('✅ EstadisticasEquipoPartido eliminadas para equipo:', equipoPartido.equipo);
    } catch (statsError) {
      console.error('⚠️ Error eliminando estadísticas de equipo:', statsError);
      // No fallar la petición principal
    }

    await EquipoPartido.findByIdAndDelete(req.params.id);
    res.json({ message: 'Eliminado correctamente' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ GET - Obtener estadísticas de equipo por partido
/**
 * @swagger
 * /api/equipo-partido/estadisticas/{partidoId}:
 *   get:
 *     summary: Obtiene estadísticas de equipos para un partido
 *     tags: [EquipoPartido]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: partidoId
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *     responses:
 *       200:
 *         description: Lista de estadísticas
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Error del servidor
 */
router.get('/estadisticas/:partidoId', verificarToken, async (req, res) => {
  try {
    const { partidoId } = req.params;
    
    const estadisticas = await EstadisticasEquipoPartido.find({ partido: partidoId })
      .populate('equipo', 'nombre escudo')
      .populate('partido', 'nombrePartido fecha')
      .lean();

    // Formatear respuesta para incluir equipo en nivel superior
    const estadisticasFormateadas = estadisticas.map(stat => ({
      ...stat,
      equipo: stat.equipo,
      partido: stat.partido
    }));

    res.json(estadisticasFormateadas);
  } catch (err) {
    console.error('Error obteniendo estadísticas de equipo:', err);
    res.status(500).json({ message: 'Error al obtener estadísticas de equipo', error: err.message });
  }
});

export default router;
