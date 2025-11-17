import express from 'express';
import mongoose from 'mongoose';
import JugadorEquipo from '../../models/Jugador/JugadorEquipo.js';
import  Jugador from '../../models/Jugador/Jugador.js';
import Equipo from '../../models/Equipo/Equipo.js';
import verificarToken from '../../middleware/authMiddleware.js';
import { cargarRolDesdeBD } from '../../middleware/cargarRolDesdeBD.js';
import { validarObjectId } from '../../middleware/validacionObjectId.js';

const router = express.Router();
const { Types } = mongoose;

/**
 * @swagger
 * tags:
 *   name: JugadorEquipo
 *   description: Gestión de las relaciones entre jugadores y equipos
 */

// --- Middleware: Verifica si usuario puede gestionar una solicitud
async function esAdminEquipoOJugadorSolicitante(req, res, next) {
  const { id } = req.params;
  const usuarioId = req.user.uid;
  const rol = (req.user.rol || '').toLowerCase?.() || 'lector';

  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'ID inválido' });

  const relacion = await JugadorEquipo.findById(id);
  if (!relacion) return res.status(404).json({ message: 'Relación no encontrada' });

  const [equipo, jugador] = await Promise.all([
    Equipo.findById(relacion.equipo),
    Jugador.findById(relacion.jugador),
  ]);

  if (!equipo || !jugador) return res.status(404).json({ message: 'Equipo o jugador no encontrados' });

  const esAdminEquipo =
    equipo.creadoPor?.toString() === usuarioId ||
    equipo.administradores?.includes(usuarioId) ||
    rol === 'admin';

  const esAdminJugador =
    jugador.creadoPor?.toString() === usuarioId ||
    jugador.administradores?.includes(usuarioId) ||
    rol === 'admin';

  const esSolicitante = relacion.solicitadoPor?.toString() === usuarioId;

  if (!esAdminEquipo && !esAdminJugador && !esSolicitante) {
    return res.status(403).json({ message: 'No tienes permisos para modificar esta relación' });
  }

  req.relacion = relacion;
  req.equipo = equipo;
  req.jugador = jugador;
  next();
}

// --- Utilidad: Determina si la solicitud fue hecha por el equipo
function fueHechaPorEquipo(relacion, equipo) {
  const solicitante = relacion.solicitadoPor?.toString();
  return equipo.creadoPor?.toString() === solicitante || equipo.administradores?.includes(solicitante);
}

/**
 * @swagger
 * /api/jugador-equipo:
 *   get:
 *     summary: Obtiene las relaciones entre jugadores y equipos
 *     description: |
 *       Retorna una lista de relaciones entre jugadores y equipos.
 *       Permite filtrar por ID de jugador o ID de equipo.
 *       Requiere autenticación.
 *     tags: [JugadorEquipo]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: jugador
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: ID del jugador para filtrar las relaciones
 *         example: 5f8d0f3b5d7a8e4c3c8d4f5b
 *       - in: query
 *         name: equipo
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: ID del equipo para filtrar las relaciones
 *         example: 5f8d0f3b5d7a8e4c3c8d4f5c
 *     responses:
 *       200:
 *         description: Lista de relaciones jugador-equipo obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/JugadorEquipo'
 *             example:
 *               - _id: 5f8d0f3b5d7a8e4c3c8d4f5a
 *                 jugador:
 *                   _id: 5f8d0f3b5d7a8e4c3c8d4f5b
 *                   nombre: "Juan Pérez"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Error del servidor al obtener las relaciones
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/', verificarToken, async (req, res) => {
  try {
    const { jugador, equipo } = req.query;
    if (!jugador && !equipo) return res.status(400).json({ message: 'Debe indicar jugador o equipo' });

    const filtro = {};
    if (jugador) filtro.jugador = jugador;
    if (equipo) filtro.equipo = equipo;

    const relaciones = await JugadorEquipo.find(filtro)
      .populate('jugador', 'nombre alias genero')
      .populate('equipo', 'nombre escudo')
      .lean();

    res.status(200).json(relaciones);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener contratos', error: error.message });
  }
});

/**
 * @swagger
 * /api/jugador-equipo/opciones:
 *   get:
 *     summary: Obtiene opciones disponibles para crear nuevas relaciones
 *     description: |
 *       Retorna una lista de jugadores disponibles para un equipo específico o
 *       una lista de equipos disponibles para un jugador específico.
 *       Requiere autenticación y permisos de administración.
 *     tags: [JugadorEquipo]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: equipo
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: ID del equipo para buscar jugadores disponibles
 *         example: 5f8d0f3b5d7a8e4c3c8d4f5c
 *       - in: query
 *         name: jugador
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: ID del jugador para buscar equipos disponibles
 *         example: 5f8d0f3b5d7a8e4c3c8d4f5b
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Término de búsqueda para filtrar resultados
 *     responses:
 *       200:
 *         description: Lista de opciones disponibles obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                     format: ObjectId
 *                     description: ID del jugador o equipo
 *                   nombre:
 *                     type: string
 *                     description: Nombre del jugador o equipo
 *                   alias:
 *                     type: string
 *                     description: Alias o tipo del jugador o equipo
 *                   foto:
 *                     type: string
 *                     description: URL de la foto del jugador (solo para jugadores)
 *                   nacionalidad:
 *                     type: string
 *                     description: Nacionalidad del jugador (solo para jugadores)
 *                   pais:
 *                     type: string
 *                     description: País del equipo (solo para equipos)
 *                   escudo:
 *                     type: string
 *                     description: URL del escudo del equipo (solo para equipos)
 *             examples:
 *               jugadores:
 *                 value:
 *                   - _id: 5f8d0f3b5d7a8e4c3c8d4f5b
 *                     nombre: "Juan Pérez"
 *                     alias: "JP"
 *                     foto: "https://ejemplo.com/fotos/juan-perez.jpg"
 *                     nacionalidad: "Argentina"
 *               equipos:
 *                 value:
 *                   - _id: 5f8d0f3b5d7a8e4c3c8d4f5c
 *                     nombre: "Equipo Rojo"
 *                     alias: "club"
 *                     pais: "Argentina"
 *                     escudo: "https://ejemplo.com/escudos/rojo.png"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         description: Error del servidor al obtener las opciones
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/opciones', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const { equipo, jugador, q } = req.query;
    const usuarioId = req.user.uid;
    const rol = (req.user.rol || '').toLowerCase?.();

    if ((equipo && jugador) || (!equipo && !jugador)) {
      return res.status(400).json({ message: 'Debe indicar solo jugador o equipo' });
    }

    if (equipo) {
      if (!Types.ObjectId.isValid(equipo)) {
        return res.status(400).json({ message: 'Equipo inválido' });
      }

      const equipoDB = await Equipo.findById(equipo).lean();
      if (!equipoDB) return res.status(404).json({ message: 'Equipo no encontrado' });

      const esAdminEquipo =
        rol === 'admin' ||
        equipoDB.creadoPor?.toString() === usuarioId ||
        (equipoDB.administradores || []).map(id => id?.toString?.()).includes(usuarioId);

      if (!esAdminEquipo) return res.status(403).json({ message: 'No autorizado' });

      const relaciones = await JugadorEquipo.find({
        equipo,
        estado: { $in: ['pendiente', 'aceptado'] }
      }).select('jugador').lean();

      const jugadoresOcupados = new Set(relaciones.map(rel => rel.jugador?.toString()));

      const filtrosJugador = {
        _id: { $nin: Array.from(jugadoresOcupados) }
      };

      if (q) {
        const regex = new RegExp(q, 'i');
        filtrosJugador.$or = [{ nombre: regex }];
        filtrosJugador.$or.push({ alias: regex });
      }

      const jugadoresDisponibles = await Jugador.find(filtrosJugador)
        .select('nombre alias foto nacionalidad')
        .sort({ nombre: 1 })
        .limit(50)
        .lean();

      const opciones = jugadoresDisponibles
        .filter(j => j?._id && !jugadoresOcupados.has(j._id.toString()))
        .map(j => ({
          _id: j._id,
          nombre: j.nombre,
          alias: j.alias,
          foto: j.foto,
          nacionalidad: j.nacionalidad
        }));

      return res.status(200).json(opciones);
    }

    if (!Types.ObjectId.isValid(jugador)) {
      return res.status(400).json({ message: 'Jugador inválido' });
    }

    const jugadorDB = await Jugador.findById(jugador).lean();
    if (!jugadorDB) return res.status(404).json({ message: 'Jugador no encontrado' });

    const esAdminJugador =
      rol === 'admin' ||
      jugadorDB.creadoPor?.toString() === usuarioId ||
      (jugadorDB.administradores || []).map(id => id?.toString?.()).includes(usuarioId);

    if (!esAdminJugador) return res.status(403).json({ message: 'No autorizado' });

    const relacionesJugador = await JugadorEquipo.find({
      jugador,
      estado: { $in: ['pendiente', 'aceptado'] }
    }).select('equipo').lean();

    const equiposOcupados = new Set(relacionesJugador.map(rel => rel.equipo?.toString()));

    const filtrosEquipo = {
      _id: { $nin: Array.from(equiposOcupados) }
    };

    if (q) {
      const regex = new RegExp(q, 'i');
      filtrosEquipo.$or = [{ nombre: regex }, { tipo: regex }, { pais: regex }];
    }

    const equiposDisponibles = await Equipo.find(filtrosEquipo)
      .select('nombre tipo pais escudo')
      .sort({ nombre: 1 })
      .limit(50)
      .lean();

    const opcionesEquipos = equiposDisponibles
      .filter(eq => eq?._id && !equiposOcupados.has(eq._id.toString()))
      .map(eq => ({
        _id: eq._id,
        nombre: eq.nombre,
        alias: eq.tipo,
        pais: eq.pais,
        escudo: eq.escudo
      }));

    return res.status(200).json(opcionesEquipos);
  } catch (error) {
    console.error('Error en GET /opciones jugador-equipo:', error);
    res.status(500).json({ message: 'Error al obtener opciones', error: error.message });
  }
});




/**
 * @swagger
 * /api/jugador-equipo/{id}:
 *   get:
 *     summary: Obtiene una relación jugador-equipo por ID
 *     description: |
 *       Obtiene los detalles de una relación específica entre un jugador y un equipo.
 *       El usuario debe ser administrador del jugador, administrador del equipo o el solicitante original.
 *       Requiere autenticación.
 *     tags: [JugadorEquipo]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: ID de la relación jugador-equipo
 *         example: 5f8d0f3b5d7a8e4c3c8d4f5a
 *     responses:
 *       200:
 *         description: Relación jugador-equipo obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/JugadorEquipo'
 *             example:
 *               _id: 5f8d0f3b5d7a8e4c3c8d4f5a
 *               jugador:
 *                 _id: 5f8d0f3b5d7a8e4c3c8d4f5b
 *                 nombre: "Juan Pérez"
 *                 alias: "JP"
 *                 creadoPor: "auth0|1234567890"
 *                 administradores: ["auth0|1234567890"]
 *               equipo:
 *                 _id: 5f8d0f3b5d7a8e4c3c8d4f5c
 *                 nombre: "Equipo Rojo"
 *                 escudo: "https://ejemplo.com/escudos/rojo.png"
 *                 creadoPor: "auth0|0987654321"
 *                 administradores: ["auth0|0987654321"]
 *               estado: "aceptado"
 *               rol: "delantero"
 *               desde: "2023-01-01"
 *               hasta: "2023-12-31"
 *               activo: true
 *               origen: "equipo"
 *               solicitadoPor: "auth0|0987654321"
 *               creadoPor: "auth0|0987654321"
 *               fechaAceptacion: "2023-01-15T10:30:00.000Z"
 *               createdAt: "2023-01-10T08:15:00.000Z"
 *               updatedAt: "2023-01-15T10:30:00.000Z"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Error del servidor al obtener la relación
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/:id', validarObjectId, verificarToken, async (req, res) => {
  try {
    const { id } = req.params;

    const relacion = await JugadorEquipo.findById(id)
      .populate('jugador', 'nombre alias creadoPor administradores')
      .populate('equipo', 'nombre escudo creadoPor administradores')
      .lean();

    if (!relacion) {
      return res.status(404).json({ message: 'Relación no encontrada' });
    }

    res.status(200).json(relacion);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener relación', error: error.message });
  }
});

/**
 * @swagger
 * /api/jugador-equipo/{id}:
 *   put:
 *     summary: Actualiza una relación jugador-equipo
 *     description: |
 *       Actualiza una relación existente entre un jugador y un equipo.
 *       Solo los administradores del jugador o del equipo pueden realizar esta acción.
 *       Para solicitudes pendientes, permite aceptar, rechazar o cancelar.
 *       Para relaciones activas, permite actualizar el rol, fechas y otros detalles.
 *       Requiere autenticación.
 *     tags: [JugadorEquipo]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: ID de la relación jugador-equipo a actualizar
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
 *                 enum: [pendiente, aceptado, rechazado, cancelado, baja]
 *                 description: Nuevo estado de la relación (opcional)
 *                 example: aceptado
 *               motivoRechazo:
 *                 type: string
 *                 description: Motivo del rechazo (requerido si estado es 'rechazado')
 *                 example: "Jugador no cumple con los requisitos"
 *               rol:
 *                 type: string
 *                 description: Rol del jugador en el equipo (opcional)
 *                 example: delantero
 *               desde:
 *                 type: string
 *                 format: date
 *                 description: Fecha de inicio del contrato (opcional)
 *                 example: 2023-01-01
 *               hasta:
 *                 type: string
 *                 format: date
 *                 description: Fecha de finalización del contrato (opcional)
 *                 example: 2023-12-31
 *     responses:
 *       200:
 *         description: Relación actualizada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/JugadorEquipo'
 *             example:
 *               _id: 5f8d0f3b5d7a8e4c3c8d4f5a
 *               jugador: 5f8d0f3b5d7a8e4c3c8d4f5b
 *               equipo: 5f8d0f3b5d7a8e4c3c8d4f5c
 *               estado: "aceptado"
 *               rol: "delantero"
 *               desde: "2023-01-01"
 *               hasta: "2023-12-31"
 *               activo: true
 *               origen: "equipo"
 *               solicitadoPor: "auth0|0987654321"
 *               creadoPor: "auth0|0987654321"
 *               fechaAceptacion: "2023-01-15T10:30:00.000Z"
 *               updatedAt: "2023-01-15T10:30:00.000Z"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: Conflicto - No se puede realizar la operación solicitada
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
router.put('/:id', verificarToken, cargarRolDesdeBD, esAdminEquipoOJugadorSolicitante, async (req, res) => {
  try {
    const { estado, motivoRechazo, rol: nuevoRol, foto, desde, hasta } = req.body;
    const relacion = req.relacion;
    const usuarioId = req.user.uid;
    const rol = req.user.rol;

    const estadoPrevio = relacion.estado;

    const validos = ['pendiente', 'aceptado', 'rechazado', 'cancelado', 'baja'];
    if (estado && !validos.includes(estado)) {
      return res.status(400).json({ message: 'Estado inválido' });
    }

    const fueEquipo = fueHechaPorEquipo(relacion, req.equipo);
    const esAdminEquipo = req.equipo?.creadoPor?.toString() === usuarioId || req.equipo?.administradores?.includes(usuarioId) || rol === 'admin';
    const esAdminJugador = req.jugador?.creadoPor?.toString() === usuarioId || req.jugador?.administradores?.includes(usuarioId) || rol === 'admin';

    // --- Cambios de estado si está pendiente
    if (estadoPrevio === 'pendiente') {
      if (estado === 'aceptado') {
        if ((fueEquipo && !esAdminJugador) || (!fueEquipo && !esAdminEquipo)) {
          return res.status(403).json({ message: 'No autorizado para aceptar solicitud' });
        }

        const yaActivo = await JugadorEquipo.findOne({
          jugador: relacion.jugador,
          equipo: relacion.equipo,
          estado: 'aceptado',
          _id: { $ne: relacion._id },
        });

        if (yaActivo) return res.status(400).json({ message: 'Ya hay un contrato activo entre jugador y equipo' });

        relacion.estado = 'aceptado';
        relacion.activo = true;
        relacion.fechaAceptacion = new Date();
        await relacion.save();
        return res.status(200).json(relacion);
      }

      if (['rechazado', 'cancelado'].includes(estado)) {
        if (motivoRechazo) relacion.motivoRechazo = motivoRechazo;
        await relacion.save();
        await JugadorEquipo.findByIdAndDelete(relacion._id);
        return res.status(200).json({ message: 'Solicitud eliminada por rechazo o cancelación' });
      }
    }

    // --- Edición de contrato aceptado o finalizado
    if (['aceptado', 'baja'].includes(estadoPrevio)) {
      if (!esAdminEquipo && !esAdminJugador) {
        return res.status(403).json({ message: 'No autorizado para editar contrato' });
      }

      if (nuevoRol !== undefined) relacion.rol = nuevoRol;
      if (foto !== undefined) relacion.foto = foto;
      if (desde !== undefined) relacion.desde = desde;
      if (hasta !== undefined) relacion.hasta = hasta;

      await relacion.save();
      return res.status(200).json(relacion);
    }

    // --- Otros estados no editables
    return res.status(400).json({ message: 'No se puede editar esta relación en su estado actual' });

  } catch (error) {
    console.error('💥 ERROR en PUT /jugador-equipo/:id:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ message: 'Error al actualizar solicitud o contrato', error: error.message });
  }
});

/**
 * @swagger
 * /api/jugador-equipo/{id}:
 *   delete:
 *     summary: Elimina una relación jugador-equipo
 *     description: |
 *       Elimina permanentemente una relación entre un jugador y un equipo.
 *       Solo se pueden eliminar relaciones que no estén en estado 'aceptado'.
 *       Para relaciones activas, se debe usar el endpoint PUT para cambiar el estado a 'baja'.
 *       Solo los administradores del jugador o del equipo pueden realizar esta acción.
 *       Requiere autenticación.
 *     tags: [JugadorEquipo]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: ID de la relación jugador-equipo a eliminar
 *         example: 5f8d0f3b5d7a8e4c3c8d4f5a
 *     responses:
 *       200:
 *         description: Relación eliminada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: Mensaje de confirmación
 *                   example: Relación eliminada correctamente
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Error del servidor al eliminar la relación
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete('/:id', validarObjectId, verificarToken, cargarRolDesdeBD, esAdminEquipoOJugadorSolicitante, async (req, res) => {
  try {
    if (req.relacion.estado === 'aceptado') {
      return res.status(403).json({ message: 'No se puede eliminar un contrato activo. Marcar como finalizado.' });
    }

    await JugadorEquipo.findByIdAndDelete(req.relacion._id);
    res.status(200).json({ message: 'Relación eliminada correctamente' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar relación', error: error.message });
  }
});

// --- DIAGNOSTIC: Test middleware without making changes
router.put('/diagnostic/:id', verificarToken, cargarRolDesdeBD, esAdminEquipoOJugadorSolicitante, async (req, res) => {
  try {
    console.log('🔬 DIAGNOSTIC: Middleware passed successfully');
    console.log('👤 User:', req.user.uid, 'Role:', req.user.rol);
    console.log('📄 Relation:', req.relacion._id, 'Status:', req.relacion.estado);
    console.log('🏟️ Team:', req.equipo.nombre, 'ID:', req.equipo._id);
    console.log('👤 Player:', req.jugador.nombre, 'ID:', req.jugador._id);

    res.json({
      success: true,
      message: 'Diagnostic completed - middleware working',
      user: req.user.uid,
      relation: req.relacion.estado,
      team: req.equipo.nombre,
      player: req.jugador.nombre
    });
  } catch (error) {
    console.error('💥 ERROR in diagnostic:', error);
    res.status(500).json({ error: 'Diagnostic failed', details: error.message });
  }
});

export default router;
