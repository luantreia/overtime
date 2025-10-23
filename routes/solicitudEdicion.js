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

    if (!tipo || !datosPropuestos) {
      return res.status(400).json({ message: 'Faltan campos requeridos' });
    }

    const solicitud = new SolicitudEdicion({
      tipo,
      entidad: entidad || null,
      datosPropuestos,
      creadoPor,
    });

    await solicitud.save();
    res.status(201).json(solicitud);
  } catch (error) {
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
    const admins = await obtenerAdminsParaSolicitud(solicitud.tipo, solicitud.entidad);
    if (req.user.rol !== 'admin' && !admins.includes(uid)) {
      return res.status(403).json({ message: 'No tienes permiso para procesar esta solicitud' });
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
      if (solicitud.tipo === 'contratoJugadorEquipo' && solicitud.entidad) {
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
