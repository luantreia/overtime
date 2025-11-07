import express from 'express';
import mongoose from 'mongoose';
import SolicitudEdicion from '../models/SolicitudEdicion.js';
import verificarToken from '../middlewares/authMiddleware.js';
import { cargarRolDesdeBD } from '../middlewares/cargarRolDesdeBD.js';
import { validarObjectId } from '../middlewares/validacionObjectId.js';
import  validarDobleConfirmacion from '../utils/validarDobleConfirmacion.js';
import { tiposSolicitudMeta } from '../config/solicitudesMeta.js';
import { obtenerAdminsParaSolicitud } from '../services/obtenerAdminsParaSolicitud.js';
import JugadorEquipo from '../models/Jugador/JugadorEquipo.js';

// Importa modelos necesarios para obtener administradores
import EquipoCompetencia from '../models/Equipo/EquipoCompetencia.js';
import Equipo from '../models/Equipo/Equipo.js';
// importa otros modelos que puedas necesitar...

const router = express.Router();
const { Types } = mongoose;

// --- GET /api/solicitudes-edicion
router.get('/', verificarToken, async (req, res) => {
  try {
    const { tipo, estado, creadoPor, entidad } = req.query;
    const filtro = {
      ...(tipo ? { tipo } : {}),
      ...(estado ? { estado } : {}),
      ...(creadoPor ? { creadoPor } : {}),
      ...(entidad ? { entidad } : {}),
    };

    const solicitudes = await SolicitudEdicion.find(filtro).sort({ createdAt: -1 }).lean();
    res.status(200).json(solicitudes);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener solicitudes', error: error.message });
  }
});

// --- GET /api/solicitudes-edicion/:id
router.get('/:id', verificarToken, validarObjectId, async (req, res) => {
  try {
    const solicitud = await SolicitudEdicion.findById(req.params.id).lean();
    if (!solicitud) return res.status(404).json({ message: 'Solicitud no encontrada' });
    res.status(200).json(solicitud);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener solicitud', error: error.message });
  }
});

// --- POST /api/solicitudes-edicion
router.post('/', verificarToken, async (req, res) => {
  try {
    const { tipo, entidad, datosPropuestos } = req.body;
    const creadoPor = req.user.uid;

    console.log('POST /solicitudes-edicion - Datos recibidos:', { tipo, entidad, datosPropuestos, creadoPor });

    if (!creadoPor) {
      return res.status(401).json({ message: 'Usuario no identificado' });
    }

    if (!tipo || !datosPropuestos) {
      return res.status(400).json({ message: 'Faltan campos requeridos: tipo y datosPropuestos' });
    }

    const tiposPermitidos = [
      'resultadoPartido', 'resultadoSet', 'estadisticasJugadorPartido', 'estadisticasJugadorSet',
      'estadisticasEquipoPartido', 'estadisticasEquipoSet', 'contratoJugadorEquipo',
      'contratoEquipoCompetencia', 'jugador-equipo-crear', 'jugador-equipo-eliminar'
    ];

    if (!tiposPermitidos.includes(tipo)) {
      return res.status(400).json({ message: `Tipo de solicitud no válido: ${tipo}` });
    }

    // Validar estructura de datosPropuestos según el tipo
    if (tipo === 'jugador-equipo-crear' && !datosPropuestos.jugadorId) {
      return res.status(400).json({ message: 'jugadorId requerido para solicitudes de creación' });
    }
    if (tipo === 'jugador-equipo-eliminar' && !datosPropuestos.contratoId) {
      return res.status(400).json({ message: 'contratoId requerido para solicitudes de eliminación' });
    }

    const solicitud = new SolicitudEdicion({
      tipo,
      entidad: entidad || null,
      datosPropuestos,
      creadoPor,
    });

    console.log('Guardando solicitud:', solicitud);

    const savedSolicitud = await solicitud.save();
    console.log('Solicitud guardada exitosamente:', savedSolicitud);
    res.status(201).json(savedSolicitud);
  } catch (error) {
    console.error('Error completo al crear solicitud:', error);
    res.status(500).json({ message: 'Error al crear solicitud', error: error.message });
  }
});


router.put('/:id', verificarToken, cargarRolDesdeBD, validarObjectId, async (req, res) => {
  try {
    const { estado, motivoRechazo, datosPropuestos } = req.body;
    const uid = req.user.uid;

    const solicitud = await SolicitudEdicion.findById(req.params.id);
    if (!solicitud) return res.status(404).json({ message: 'Solicitud no encontrada' });
    if (solicitud.estado !== 'pendiente') return res.status(400).json({ message: 'Solicitud ya procesada' });

    // Obtener admins responsables (de tu función existente)
    let admins = [];
    if (solicitud.entidad) {
      // Si hay entidad, usar la lógica normal
      admins = await obtenerAdminsParaSolicitud(solicitud.tipo, solicitud.entidad);
    } else {
      // Para solicitudes donde entidad es null
      if (solicitud.tipo === 'jugador-equipo-crear') {
        const equipoId = solicitud.datosPropuestos.equipoId;
        if (equipoId) {
          const equipo = await Equipo.findById(equipoId).select('administradores creadoPor');
          if (equipo) {
            admins = [equipo.creadoPor, ...(equipo.administradores || [])].filter(Boolean);
          }
        }
      } else if (solicitud.tipo === 'jugador-equipo-eliminar') {
        const contratoId = solicitud.datosPropuestos.contratoId;
        if (contratoId) {
          const contrato = await JugadorEquipo.findById(contratoId)
            .populate('equipo', 'administradores creadoPor')
            .populate('jugador', 'administradores creadoPor');
          if (contrato) {
            const ids = new Set();
            if (contrato.equipo?.creadoPor) ids.add(contrato.equipo.creadoPor.toString());
            if (Array.isArray(contrato.equipo?.administradores)) {
              contrato.equipo.administradores.forEach(a => ids.add(a.toString()));
            }
            if (contrato.jugador?.creadoPor) ids.add(contrato.jugador.creadoPor.toString());
            if (Array.isArray(contrato.jugador?.administradores)) {
              contrato.jugador.administradores.forEach(a => ids.add(a.toString()));
            }
            admins = Array.from(ids);
          }
        }
      }
    }

    if (estado === 'aceptado') {
      // Validar si la edición requiere doble confirmación
      const camposModificados = Object.keys(datosPropuestos || {});
      const { requiereDobleConfirmacion, camposCriticosModificados } = validarDobleConfirmacion(solicitud.tipo, camposModificados);

      if (requiereDobleConfirmacion) {
        // Si se requiere doble confirmación, se debe agregar el uid a aceptadoPor y no marcar como 'aceptado' aún
        if (!solicitud.aceptadoPor.includes(uid)) {
          solicitud.aceptadoPor.push(uid);
        }

        // Si ya todos los aprobadores aceptaron, cambiar estado a aceptado final
        const meta = tiposSolicitudMeta[solicitud.tipo];
        const aprobadoresNecesarios = meta.rolesAprobadores.length; // esto podés mejorar para contar admins actuales
        if (solicitud.aceptadoPor.length >= aprobadoresNecesarios) {
          solicitud.estado = 'aceptado';
          solicitud.fechaAceptacion = new Date();
          solicitud.aprobadoPor = uid; // último que aprobó
        } else {
          // Todavía pendiente que otro admin apruebe
          solicitud.estado = 'pendiente';
        }
      } else {
        // No requiere doble confirmación, aceptar directo
        solicitud.estado = 'aceptado';
        solicitud.fechaAceptacion = new Date();
        solicitud.aprobadoPor = uid;
      }

      // Actualizar datosPropuestos si vienen
      if (datosPropuestos) {
        solicitud.datosPropuestos = datosPropuestos;
      }

      // Aplicar cambios a la entidad si corresponde
      if (solicitud.tipo === 'jugador-equipo-crear') {
        try {
          const { jugadorId, equipoId, rol, numeroCamiseta, fechaInicio, fechaFin } = solicitud.datosPropuestos;
          const nuevaRelacion = new JugadorEquipo({
            jugador: jugadorId,
            equipo: equipoId,
            rol: rol || 'jugador',
            numeroCamiseta,
            desde: fechaInicio,
            hasta: fechaFin,
            estado: 'aceptado',
            origen: 'solicitud',
            creadoPor: solicitud.creadoPor
          });
          await nuevaRelacion.save();
        } catch (e) {
          console.error('Error creando nueva relación JugadorEquipo:', e);
          return res.status(500).json({ message: 'Error al crear la relación', error: e.message });
        }
      } else if (solicitud.tipo === 'jugador-equipo-eliminar') {
        try {
          const { contratoId } = solicitud.datosPropuestos;
          const relacion = await JugadorEquipo.findById(contratoId);
          if (relacion) {
            // Marcar como baja en lugar de eliminar físicamente para mantener historial
            relacion.estado = 'baja';
            relacion.hasta = new Date();
            await relacion.save();
          }
        } catch (e) {
          console.error('Error eliminando relación JugadorEquipo:', e);
          return res.status(500).json({ message: 'Error al eliminar la relación', error: e.message });
        }
      } else if (solicitud.tipo === 'contratoJugadorEquipo' && solicitud.entidad) {
        try {
          const relacion = await JugadorEquipo.findById(solicitud.entidad);
          if (relacion) {
            const cambios = solicitud.datosPropuestos || {};
            if (cambios.rol !== undefined) relacion.rol = cambios.rol;
            if (cambios.foto !== undefined) relacion.foto = cambios.foto;
            if (cambios.desde !== undefined) relacion.desde = cambios.desde;
            if (cambios.hasta !== undefined) relacion.hasta = cambios.hasta;

            // Permitir finalizar contrato aceptado → baja
            if (cambios.estado === 'baja' && relacion.estado === 'aceptado') {
              relacion.estado = 'baja';
              relacion.activo = false;
              if (!relacion.hasta) relacion.hasta = new Date();
            }

            await relacion.save();
          }
        } catch (e) {
          // No fallar la aceptación por error al aplicar, pero informar
          console.error('Error aplicando cambios de solicitud a JugadorEquipo:', e);
        }
      }
    } else if (estado === 'rechazado') {
      solicitud.estado = 'rechazado';
      solicitud.motivoRechazo = motivoRechazo || '';
      solicitud.aprobadoPor = uid;
      solicitud.fechaRechazo = new Date();
    } else {
      return res.status(400).json({ message: 'Estado inválido' });
    }

    await solicitud.save();
    res.status(200).json(solicitud);

  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar solicitud', error: error.message });
  }
});

// --- DELETE /api/solicitudes-edicion/:id
router.delete('/:id', verificarToken, validarObjectId, async (req, res) => {
  try {
    const solicitud = await SolicitudEdicion.findById(req.params.id);
    if (!solicitud) return res.status(404).json({ message: 'Solicitud no encontrada' });
    if (solicitud.estado !== 'pendiente') return res.status(403).json({ message: 'No se puede eliminar esta solicitud' });
    if (solicitud.creadoPor !== req.user.uid) return res.status(403).json({ message: 'No autorizado' });

    await solicitud.deleteOne();
    res.status(200).json({ message: 'Solicitud cancelada correctamente' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar solicitud', error: error.message });
  }
});

export default router;
