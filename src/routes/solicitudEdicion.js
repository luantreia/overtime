import express from 'express';
import SolicitudEdicion from '../models/SolicitudEdicion.js';
import verificarToken from '../middleware/authMiddleware.js';
import { validarObjectId } from '../middleware/validacionObjectId.js';

const router = express.Router();

// Lightweight routes to keep behavior simple and robust while restoring server stability.
router.get('/', verificarToken, async (req, res) => {
  try {
    const { tipo, estado, creadoPor, entidad } = req.query;
    const filtro = {
      ...(tipo ? { tipo } : {}),
      ...(estado ? { estado } : {}),
      ...(creadoPor ? { creadoPor } : {}),
      ...(entidad ? { entidad } : {}),
    };
    const arr = await SolicitudEdicion.find(filtro).sort({ createdAt: -1 }).lean();
    return res.status(200).json(arr);
  } catch (err) {
    console.error('Error getting solicitudes:', err);
    return res.status(500).json({ message: 'Error al obtener solicitudes', error: err.message });
  }
});

router.post('/', verificarToken, async (req, res) => {
  try {
    const payload = req.body;
    const s = new SolicitudEdicion({ ...payload, creadoPor: req.user.uid });
    await s.save();
    return res.status(201).json(s);
  } catch (err) {
    console.error('Error creating solicitud:', err);
    return res.status(500).json({ message: 'Error al crear solicitud', error: err.message });
  }
});

router.put('/:id', verificarToken, validarObjectId, async (req, res) => {
  try {
    const { id } = req.params;
    const { estado, motivoRechazo, datosPropuestos } = req.body;
    const uid = req.user?.uid;

    const solicitud = await SolicitudEdicion.findById(id);
    if (!solicitud) return res.status(404).json({ message: 'Solicitud no encontrada' });
    if (solicitud.estado !== 'pendiente') return res.status(400).json({ message: 'Solicitud ya procesada' });

    if (datosPropuestos) solicitud.datosPropuestos = datosPropuestos;
    if (motivoRechazo) solicitud.motivoRechazo = motivoRechazo;

    if (estado === 'aceptado') {
      solicitud.estado = 'aceptado';
      solicitud.fechaAceptacion = new Date();
      solicitud.aprobadoPor = uid;
    } else if (estado === 'rechazado') {
      solicitud.estado = 'rechazado';
      solicitud.motivoRechazo = motivoRechazo || solicitud.motivoRechazo;
      solicitud.fechaRechazo = new Date();
    } else if (estado === 'cancelado') {
      solicitud.estado = 'cancelado';
    }

    await solicitud.save();
    return res.status(200).json(solicitud);
  } catch (err) {
    console.error('Error updating solicitud:', err);
    return res.status(500).json({ message: 'Error al actualizar solicitud', error: err.message });
  }
});

router.delete('/:id', verificarToken, validarObjectId, async (req, res) => {
  try {
    const { id } = req.params;
    const s = await SolicitudEdicion.findById(id);
    if (!s) return res.status(404).json({ message: 'Solicitud no encontrada' });
    if (s.creadoPor?.toString() !== req.user.uid && req.user.rol !== 'admin') return res.status(403).json({ message: 'No autorizado' });
    if (s.estado !== 'pendiente') return res.status(400).json({ message: 'Solo solicitudes pendientes se pueden cancelar' });
    s.estado = 'cancelado';
    await s.save();
    return res.status(200).json({ message: 'Solicitud cancelada correctamente' });
  } catch (err) {
    console.error('Error deleting solicitud:', err);
    return res.status(500).json({ message: 'Error al cancelar solicitud', error: err.message });
  }
});

export default router;

