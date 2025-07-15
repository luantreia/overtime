import express from 'express';
import mongoose from 'mongoose';
import JugadorEquipo from '../../models/Jugador/JugadorEquipo.js';
import  Jugador from '../../models/Jugador/Jugador.js';
import Equipo from '../../models/Equipo/Equipo.js';
import verificarToken from '../../middlewares/authMiddleware.js';
import { cargarRolDesdeBD } from '../../middlewares/cargarRolDesdeBD.js';
import { validarObjectId } from '../../middlewares/validacionObjectId.js';

const router = express.Router();
const { Types } = mongoose;

// --- Middleware: Verifica si usuario puede gestionar una solicitud
async function esAdminEquipoOJugadorSolicitante(req, res, next) {
  const { id } = req.params;
  const usuarioId = req.user.uid;
  const rol = req.user.rol;

  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'ID inválido' });

  const relacion = await JugadorEquipo.findById(id);
  if (!relacion) return res.status(404).json({ message: 'Relación no encontrada' });

  const [equipo, jugador] = await Promise.all([
    Equipo.findById(relacion.equipo),
    Jugador.findById(relacion.jugador),
  ]);

  if (!equipo || !jugador) return res.status(404).json({ message: 'Equipo o jugador no encontrados' });

  const esAdminEquipo =
    equipo.creadoPor.toString() === usuarioId || equipo.administradores.includes(usuarioId) || rol === 'admin';

  const esAdminJugador =
    jugador.creadoPor.toString() === usuarioId || jugador.administradores.includes(usuarioId) || rol === 'admin';

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
  return equipo.creadoPor.toString() === solicitante || equipo.administradores.includes(solicitante);
}

// --- GET /api/jugador-equipo?jugador=...&equipo=...
router.get('/', verificarToken, async (req, res) => {
  try {
    const { jugador, equipo } = req.query;
    if (!jugador && !equipo) return res.status(400).json({ message: 'Debe indicar jugador o equipo' });

    const filtro = {};
    if (jugador) filtro.jugador = jugador;
    if (equipo) filtro.equipo = equipo;

    const relaciones = await JugadorEquipo.find(filtro)
      .populate('jugador', 'nombre alias')
      .populate('equipo', 'nombre escudo')
      .lean();

    res.status(200).json(relaciones);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener contratos', error: error.message });
  }
});

// --- POST /solicitar-equipo
router.post('/solicitar-equipo', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const { jugador, equipo } = req.body;
    const usuarioId = req.user.uid;

    if (!jugador || !equipo || !Types.ObjectId.isValid(jugador) || !Types.ObjectId.isValid(equipo)) {
      return res.status(400).json({ message: 'Jugador y equipo válidos requeridos' });
    }

    const [equipoDB, jugadorDB] = await Promise.all([
      Equipo.findById(equipo),
      Jugador.findById(jugador),
    ]);

    if (!equipoDB || !jugadorDB) return res.status(404).json({ message: 'Jugador o equipo no encontrados' });

    const esAdminEquipo =
      equipoDB.creadoPor.toString() === usuarioId || equipoDB.administradores.includes(usuarioId) || req.user.rol === 'admin';

    if (!esAdminEquipo) return res.status(403).json({ message: 'No autorizado' });

    const existe = await JugadorEquipo.findOne({ jugador, equipo, estado: { $in: ['pendiente', 'aceptado'] } });
    if (existe) return res.status(409).json({ message: 'Ya existe una relación o solicitud activa' });

    const solicitud = new JugadorEquipo({
      jugador,
      equipo,
      estado: 'pendiente',
      activo: false,
      creadoPor: usuarioId,
      solicitadoPor: usuarioId,
      origen: 'equipo',
    });

    await solicitud.save();
    res.status(201).json(solicitud);
  } catch (error) {
    res.status(500).json({ message: 'Error al crear solicitud', error: error.message });
  }
});

// --- POST /solicitar-jugador
router.post('/solicitar-jugador', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const { jugador, equipo } = req.body;
    const usuarioId = req.user.uid;

    if (!jugador || !equipo || !Types.ObjectId.isValid(jugador) || !Types.ObjectId.isValid(equipo)) {
      return res.status(400).json({ message: 'Jugador y equipo válidos requeridos' });
    }

    const [jugadorDB, equipoDB] = await Promise.all([
      Jugador.findById(jugador),
      Equipo.findById(equipo),
    ]);

    if (!jugadorDB || !equipoDB) return res.status(404).json({ message: 'Jugador o equipo no encontrados' });

    const esAdminJugador =
      jugadorDB.creadoPor.toString() === usuarioId || jugadorDB.administradores.includes(usuarioId) || req.user.rol === 'admin';

    if (!esAdminJugador) return res.status(403).json({ message: 'No autorizado' });

    const existe = await JugadorEquipo.findOne({ jugador, equipo, estado: { $in: ['pendiente', 'aceptado'] } });
    if (existe) return res.status(409).json({ message: 'Ya existe una relación o solicitud activa' });

    const solicitud = new JugadorEquipo({
      jugador,
      equipo,
      estado: 'pendiente',
      activo: false,
      creadoPor: usuarioId,
      solicitadoPor: usuarioId,
      origen: 'jugador',
    });

    await solicitud.save();
    res.status(201).json(solicitud);
  } catch (error) {
    res.status(500).json({ message: 'Error al crear solicitud', error: error.message });
  }
});

// --- GET /solicitudes (filtrado por admin/solicitante, y por jugador/equipo opcional)
router.get('/solicitudes', verificarToken, cargarRolDesdeBD, async (req, res) => {
  try {
    const usuarioId = req.user.uid;
    const rol = req.user.rol;
    const { estado, jugador, equipo } = req.query;

    // Filtro base
    const filtro = {
      ...(estado ? { estado } : { estado: 'pendiente' }),
      ...(jugador ? { jugador } : {}),
      ...(equipo ? { equipo } : {}),
    };

    const solicitudes = await JugadorEquipo.find(filtro)
      .populate('jugador', 'nombre alias creadoPor administradores')
      .populate('equipo', 'nombre creadoPor administradores')
      .lean();

    const solicitudesFiltradas = solicitudes.filter(s => {
      const uid = usuarioId.toString();
      const adminsJugador = (s.jugador.administradores || []).map(id => id?.toString?.());
      const adminsEquipo = (s.equipo.administradores || []).map(id => id?.toString?.());

      const esAdminJugador = s.jugador.creadoPor?.toString?.() === uid || adminsJugador.includes(uid);
      const esAdminEquipo = s.equipo.creadoPor?.toString?.() === uid || adminsEquipo.includes(uid);
      const esSolicitante = s.solicitadoPor?.toString?.() === uid;

      return esAdminJugador || esAdminEquipo || esSolicitante || rol === 'admin';
    });

    res.status(200).json(solicitudesFiltradas);
  } catch (error) {
    console.error('Error en GET /solicitudes jugador-equipo:', error);
    res.status(500).json({ message: 'Error al obtener solicitudes', error: error.message });
  }
});

// --- GET /api/jugador-equipo/:id (obtener una relación por ID)
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

router.put('/:id', verificarToken, cargarRolDesdeBD, esAdminEquipoOJugadorSolicitante, async (req, res) => {
  try {
    const { estado, motivoRechazo, numero, rol: nuevoRol, foto, desde, hasta } = req.body;
    const relacion = req.relacion;
    const usuarioId = req.user.uid;
    const rol = req.user.rol;

    const estadoPrevio = relacion.estado;

    const validos = ['pendiente', 'aceptado', 'rechazado', 'cancelado', 'finalizado'];
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
    if (['aceptado', 'finalizado'].includes(estadoPrevio)) {
      if (!esAdminEquipo && !esAdminJugador) {
        return res.status(403).json({ message: 'No autorizado para editar contrato' });
      }

      if (numero !== undefined) relacion.numero = numero;
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
    res.status(500).json({ message: 'Error al actualizar solicitud o contrato', error: error.message });
  }
});

// --- DELETE /:id (eliminar manualmente una relación no activa)
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

export default router;
