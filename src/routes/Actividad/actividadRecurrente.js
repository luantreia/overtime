import express from 'express';
import ActividadRecurrente from '../../models/Actividad/ActividadRecurrente.js';
import verificarToken from '../../middleware/authMiddleware.js';
import { cargarRolDesdeBD } from '../../middleware/cargarRolDesdeBD.js';
import { validarObjectId } from '../../middleware/validacionObjectId.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: ActividadesRecurrentes
 *   description: Gestión de plantillas de actividades recurrentes (ej. "los viernes")
 */

// Listar plantillas recurrentes
/**
 * @swagger
 * /api/actividades-recurrentes:
 *   get:
 *     summary: Lista plantillas de actividades recurrentes
 *     tags: [ActividadesRecurrentes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: sede
 *         schema:
 *           type: string
 *           format: ObjectId
 *     responses:
 *       200:
 *         description: Lista de plantillas
 *       500:
 *         description: Error al obtener plantillas
 */
router.get('/', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const filtro = {};
    if (req.query.sede) filtro.sede = req.query.sede;
    const plantillas = await ActividadRecurrente.find(filtro).lean();
    res.json(plantillas);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener plantillas' });
  }
});

// Obtener plantilla por ID
/**
 * @swagger
 * /api/actividades-recurrentes/{id}:
 *   get:
 *     summary: Obtiene una plantilla recurrente por ID
 *     tags: [ActividadesRecurrentes]
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
 *         description: Plantilla obtenida
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Error al obtener plantilla
 */
router.get('/:id', validarObjectId, verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const plantilla = await ActividadRecurrente.findById(req.params.id).lean();
    if (!plantilla) return res.status(404).json({ error: 'Plantilla no encontrada' });
    res.json(plantilla);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener plantilla' });
  }
});

// Crear plantilla recurrente (solo admin global, por ahora)
/**
 * @swagger
 * /api/actividades-recurrentes:
 *   post:
 *     summary: Crea una nueva plantilla de actividad recurrente
 *     tags: [ActividadesRecurrentes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre, tipo, diaSemana, horaInicio, horaFin]
 *             properties:
 *               nombre:
 *                 type: string
 *               tipo:
 *                 type: string
 *                 enum: [lod, recreativo, jornada, evento, taller]
 *               sede:
 *                 type: string
 *                 format: ObjectId
 *               ubicacion:
 *                 type: string
 *               organizacion:
 *                 type: string
 *                 format: ObjectId
 *               diaSemana:
 *                 type: string
 *                 enum: [lunes, martes, miercoles, jueves, viernes, sabado, domingo]
 *               horaInicio:
 *                 type: string
 *               horaFin:
 *                 type: string
 *               abiertoA:
 *                 type: string
 *                 enum: [cualquiera, inscriptos, solo_competencia]
 *               permiteEspectadores:
 *                 type: boolean
 *               descripcion:
 *                 type: string
 *               visibilidadPublica:
 *                 type: boolean
 *               activa:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Plantilla creada
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.post('/', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    if (req.user.rol !== 'admin') {
      return res.status(403).json({ error: 'No tenés permisos para crear plantillas recurrentes' });
    }

    const {
      nombre, tipo, sede, ubicacion, organizacion,
      diaSemana, horaInicio, horaFin, abiertoA, permiteEspectadores,
      descripcion, visibilidadPublica, activa,
    } = req.body;

    if (!nombre || !tipo || !diaSemana || !horaInicio || !horaFin) {
      return res.status(400).json({ error: 'Faltan datos obligatorios' });
    }

    const nuevaPlantilla = new ActividadRecurrente({
      nombre,
      tipo,
      sede: sede || null,
      ubicacion,
      organizacion: organizacion || null,
      diaSemana,
      horaInicio,
      horaFin,
      abiertoA,
      permiteEspectadores,
      descripcion,
      visibilidadPublica,
      activa,
      creadoPor: req.user.uid,
      administradores: [req.user.uid],
    });

    const guardada = await nuevaPlantilla.save();
    res.status(201).json(guardada);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Error al crear plantilla' });
  }
});

// Actualizar plantilla recurrente (solo admin global, por ahora)
/**
 * @swagger
 * /api/actividades-recurrentes/{id}:
 *   put:
 *     summary: Actualiza una plantilla de actividad recurrente
 *     tags: [ActividadesRecurrentes]
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
 *         description: Plantilla actualizada
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.put('/:id', validarObjectId, verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    if (req.user.rol !== 'admin') {
      return res.status(403).json({ error: 'No tenés permisos para modificar plantillas recurrentes' });
    }

    const plantilla = await ActividadRecurrente.findById(req.params.id);
    if (!plantilla) return res.status(404).json({ error: 'Plantilla no encontrada' });

    Object.assign(plantilla, req.body);
    const actualizada = await plantilla.save();
    res.json(actualizada);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Error al actualizar plantilla' });
  }
});

// Eliminar plantilla recurrente (solo admin global, por ahora)
/**
 * @swagger
 * /api/actividades-recurrentes/{id}:
 *   delete:
 *     summary: Elimina una plantilla de actividad recurrente
 *     tags: [ActividadesRecurrentes]
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
 *         description: Plantilla eliminada
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.delete('/:id', validarObjectId, verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    if (req.user.rol !== 'admin') {
      return res.status(403).json({ error: 'No tenés permisos para eliminar plantillas recurrentes' });
    }

    const plantilla = await ActividadRecurrente.findByIdAndDelete(req.params.id);
    if (!plantilla) return res.status(404).json({ error: 'Plantilla no encontrada' });
    res.json({ mensaje: 'Plantilla eliminada' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar plantilla' });
  }
});

export default router;
