import express from 'express';
import JugadorTemporada from '../../models/Jugador/JugadorTemporada.js';
import JugadorCompetencia from '../../models/Jugador/JugadorCompetencia.js';
import ParticipacionTemporada from '../../models/Equipo/ParticipacionTemporada.js';
import verificarToken from '../../middleware/authMiddleware.js';
import JugadorEquipo from '../../models/Jugador/JugadorEquipo.js';
import { cargarRolDesdeBD } from '../../middleware/cargarRolDesdeBD.js';
import { validarObjectId } from '../../middleware/validacionObjectId.js';
import mongoose from 'mongoose';
import Equipo from '../../models/Equipo/Equipo.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: JugadorTemporada
 *   description: Gestión de la relación entre jugadores y temporadas
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     JugadorTemporada:
 *       type: object
 *       required:
 *         - jugadorEquipo
 *         - participacionTemporada
 *         - estado
 *         - rol
 *       properties:
 *         _id:
 *           type: string
 *           description: ID único de la relación jugador-temporada
 *         jugadorEquipo:
 *           type: string
 *           description: Referencia al jugador en el equipo
 *         participacionTemporada:
 *           type: string
 *           description: Referencia a la participación en la temporada
 *         estado:
 *           type: string
 *           enum: [activo, inactivo, lesionado, suspendido]
 *           description: Estado del jugador en la temporada
 *         rol:
 *           type: string
 *           description: Rol del jugador en el equipo durante la temporada
 *         jugador:
 *           type: string
 *           description: Referencia al jugador
 *         creadoPor:
 *           type: string
 *           description: ID del usuario que creó el registro
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Fecha de creación
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Fecha de última actualización
 *       example:
 *         _id: 5f8d0f3b5d7a8e4c3c8d4f5a
 *         jugadorEquipo: 5f8d0f3b5d7a8e4c3c8d4f5b
 *         participacionTemporada: 5f8d0f3b5d7a8e4c3c8d4f5c
 *         estado: "activo"
 *         rol: "delantero"
 *         jugador: 5f8d0f3b5d7a8e4c3c8d4f5d
 *         creadoPor: "auth0|1234567890"
 *         createdAt: "2023-01-15T10:30:00.000Z"
 *         updatedAt: "2023-01-15T10:30:00.000Z"
 */

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

/**
 * @swagger
 * /api/jugador-temporada:
 *   get:
 *     summary: Obtiene las relaciones jugador-temporada
 *     description: |
 *       Retorna una lista de relaciones entre jugadores y temporadas.
 *       Permite filtrar por jugadorCompetencia y/o participacionTemporada.
 *     tags: [JugadorTemporada]
 *     parameters:
 *       - in: query
 *         name: jugadorCompetencia
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: ID de la relación jugador-competencia para filtrar
 *         example: 5f8d0f3b5d7a8e4c3c8d4f5b
 *       - in: query
 *         name: participacionTemporada
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: ID de la participación en temporada para filtrar
 *         example: 5f8d0f3b5d7a8e4c3c8d4f5c
 *     responses:
 *       200:
 *         description: Lista de relaciones jugador-temporada obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/JugadorTemporada'
 *       400:
 *         description: Error en los parámetros de consulta
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor al obtener los datos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
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

/**
 * @swagger
 * /api/jugador-temporada/opciones:
 *   get:
 *     summary: Opciones de JugadorEquipo para una ParticipacionTemporada
 *     description: Lista JugadorEquipo del equipo de la ParticipacionTemporada indicada, excluyendo los ya asignados en esa ParticipacionTemporada.
 *     tags: [JugadorTemporada]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: participacionTemporada
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Filtro por nombre o alias del jugador
 *     responses:
 *       200:
 *         description: Lista de opciones
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Error del servidor
 */
router.get('/opciones', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const { participacionTemporada, q } = req.query;
    if (!participacionTemporada || !mongoose.Types.ObjectId.isValid(participacionTemporada)) {
      return res.status(400).json({ message: 'participacionTemporada inválida' });
    }

    const pt = await ParticipacionTemporada.findById(participacionTemporada).populate('equipo', 'creadoPor administradores nombre');
    if (!pt) return res.status(404).json({ message: 'ParticipacionTemporada no encontrada' });

    const uid = req.user?.uid;
    const rol = (req.user?.rol || '').toLowerCase?.();
    const equipo = pt.equipo;
    const esAdminEquipo = rol === 'admin' || equipo.creadoPor?.toString() === uid || (equipo.administradores || []).map(id => id?.toString?.()).includes(uid);
    if (!esAdminEquipo) return res.status(403).json({ message: 'No autorizado' });

    // Jugadores ya asignados en esta PT
    const asignados = await JugadorTemporada.find({ participacionTemporada }).select('jugadorEquipo').lean();
    const usados = new Set(asignados.map(jt => jt.jugadorEquipo?.toString()));

    // Jugadores del equipo con contrato aceptado
    const filtroJE = { equipo: equipo._id, estado: 'aceptado' };
    let queryJE = JugadorEquipo.find(filtroJE)
      .populate('jugador', 'nombre alias foto nacionalidad')
      .sort({ 'jugador.nombre': 1 })
      .lean();
    const lista = await queryJE;

    let opciones = lista
      .filter(je => je?._id && !usados.has(je._id.toString()))
      .map(je => ({
        _id: je._id,
        jugador: je.jugador ? { _id: je.jugador._id, nombre: je.jugador.nombre, alias: je.jugador.alias, foto: je.jugador.foto, nacionalidad: je.jugador.nacionalidad } : null,
        rol: je.rol,
      }));

    if (q) {
      const regex = new RegExp(q, 'i');
      opciones = opciones.filter(o => (o.jugador?.nombre && regex.test(o.jugador.nombre)) || (o.jugador?.alias && regex.test(o.jugador.alias)));
    }

    return res.json(opciones);
  } catch (error) {
    console.error('Error en GET /jugador-temporada/opciones:', error);
    res.status(500).json({ message: 'Error al obtener opciones', error: error.message });
  }
});


/**
 * @swagger
 * /api/jugador-temporada/{id}:
 *   get:
 *     summary: Obtiene una relación jugador-temporada por su ID
 *     description: |
 *       Retorna los detalles de una relación específica entre un jugador y una temporada.
 *     tags: [JugadorTemporada]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: ID de la relación jugador-temporada a obtener
 *         example: 5f8d0f3b5d7a8e4c3c8d4f5a
 *     responses:
 *       200:
 *         description: Relación jugador-temporada encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/JugadorTemporada'
 *       400:
 *         description: ID inválido o con formato incorrecto
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: "ID inválido"
 *               error: "Cast to ObjectId failed for value \"invalid-id\" at path \"_id\" for model \"JugadorTemporada\""
 *       404:
 *         description: No se encontró la relación con el ID proporcionado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "No encontrado"
 *       500:
 *         description: Error del servidor al obtener los datos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/:id', validarObjectId, async (req, res) => {
  try {
    const item = await JugadorTemporada.findById(req.params.id).lean();
    if (!item) return res.status(404).json({ error: 'No encontrado' });
    res.json(item);
  } catch {
    res.status(500).json({ error: 'Error al obtener' });
  }
});

/**
 * @swagger
 * /api/jugador-temporada:
 *   post:
 *     summary: Crea una nueva relación jugador-temporada
 *     description: |
 *       Crea una nueva relación entre un jugador y una temporada.
 *       Requiere autenticación y permisos de administrador.
 *     tags: [JugadorTemporada]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - jugadorEquipo
 *               - participacionTemporada
 *               - estado
 *               - rol
 *             properties:
 *               jugadorEquipo:
 *                 type: string
 *                 format: ObjectId
 *                 description: ID de la relación jugador-equipo
 *                 example: 5f8d0f3b5d7a8e4c3c8d4f5b
 *               participacionTemporada:
 *                 type: string
 *                 format: ObjectId
 *                 description: ID de la participación en la temporada
 *                 example: 5f8d0f3b5d7a8e4c3c8d4f5c
 *               estado:
 *                 type: string
 *                 enum: [activo, inactivo, lesionado, suspendido]
 *                 description: Estado del jugador en la temporada
 *                 example: activo
 *               rol:
 *                 type: string
 *                 description: Rol del jugador en el equipo durante la temporada
 *                 example: delantero
 *     responses:
 *       201:
 *         description: Relación jugador-temporada creada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/JugadorTemporada'
 *       400:
 *         description: Datos de entrada inválidos o faltantes
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "jugador y participacionTemporada son requeridos"
 *       401:
 *         description: No autorizado - Se requiere autenticación
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Prohibido - No tiene permisos para realizar esta acción
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor al crear la relación
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
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

/**
 * @swagger
 * /api/jugador-temporada/{id}:
 *   put:
 *     summary: Actualiza una relación jugador-temporada existente
 *     description: |
 *       Actualiza los campos de una relación existente entre un jugador y una temporada.
 *       Requiere autenticación y permisos de administrador.
 *     tags: [JugadorTemporada]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: ID de la relación jugador-temporada a actualizar
 *         example: 5f8d0f3b5d7a8e4c3c8d4f5a
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               estado:
 *                 type: string
 *                 enum: [activo, inactivo, lesionado, suspendido]
 *                 description: Estado actualizado del jugador en la temporada
 *                 example: lesionado
 *               rol:
 *                 type: string
 *                 description: Rol actualizado del jugador en el equipo durante la temporada
 *                 example: suplente
 *     responses:
 *       200:
 *         description: Relación jugador-temporada actualizada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/JugadorTemporada'
 *       400:
 *         description: Datos de entrada inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: No autorizado - Se requiere autenticación
 *       403:
 *         description: Prohibido - No tiene permisos para realizar esta acción
 *       404:
 *         description: No se encontró la relación con el ID proporcionado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor al actualizar la relación
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
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

/**
 * @swagger
 * /api/jugador-temporada/{id}:
 *   delete:
 *     summary: Elimina una relación jugador-temporada
 *     description: |
 *       Elimina permanentemente una relación entre un jugador y una temporada.
 *       Requiere autenticación y permisos de administrador.
 *     tags: [JugadorTemporada]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: ID de la relación jugador-temporada a eliminar
 *         example: 5f8d0f3b5d7a8e4c3c8d4f5a
 *     responses:
 *       200:
 *         description: Relación jugador-temporada eliminada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mensaje:
 *                   type: string
 *                   example: "Eliminado"
 *       400:
 *         description: ID inválido o con formato incorrecto
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: No autorizado - Se requiere autenticación
 *       403:
 *         description: Prohibido - No tiene permisos para realizar esta acción
 *       404:
 *         description: No se encontró la relación con el ID proporcionado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor al eliminar la relación
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
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
