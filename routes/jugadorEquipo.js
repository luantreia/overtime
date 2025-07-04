// routes/jugadorEquipo.js
import express from 'express';
import mongoose from 'mongoose';
import JugadorEquipo from '../models/JugadorEquipo.js';
import verificarToken from '../middlewares/authMiddleware.js';
import Jugador from '../models/Jugador.js';
import Equipo from '../models/Equipo.js';
import Usuario from '../models/Usuario.js';
import { esAdminDeEquipoDeRelacion } from '../middlewares/esAdminDeEquipoDeRelacion.js';
import { cargarRolDesdeBD } from '../middlewares/cargarRolDesdeBD.js';
import { esAdminDeEntidad } from '../middlewares/esAdminDeEntidad.js';
import { validarObjectId } from '../middlewares/validacionObjectId.js';

const router = express.Router();
const { Types } = mongoose;

// Crear nueva relación jugador-equipo
router.post('/asociar', verificarToken, cargarRolDesdeBD, esAdminDeEntidad(Equipo, 'equipo'), async (req, res) => {
  console.log('POST /api/jugador-equipo/ recibido con body:', req.body);
  try {
    const { jugador, equipo } = req.body;
    const usuarioId = req.user.uid;

    if (!jugador || !equipo) {
      return res.status(400).json({ message: 'Jugador y equipo son requeridos' });
    }

    if (!mongoose.Types.ObjectId.isValid(jugador) || !mongoose.Types.ObjectId.isValid(equipo)) {
      return res.status(400).json({ message: 'ID de jugador o equipo inválido' });
    }
    console.log('UID recibido en el endpoint:', req.user.uid);
    const usuarioDB = await Usuario.findById(usuarioId);
    console.log('Usuario en BD:', usuarioDB);

    if (!usuarioDB) return res.status(404).json({ message: 'Usuario no encontrado' });

    const existeJugador = await Jugador.findById(jugador);
    const existeEquipo = await Equipo.findById(equipo);

    if (!existeJugador || !existeEquipo) {
      return res.status(404).json({ message: 'Jugador o equipo no encontrado' });
    }

    const esAdminEquipo =
      existeEquipo.creadoPor.toString() === usuarioId ||
      existeEquipo.administradores.some(adminId => adminId.toString() === usuarioId) ||
      usuarioDB.rol === 'admin';

    if (!esAdminEquipo) {
      return res.status(403).json({ message: 'No tienes permisos sobre este equipo' });
    }

    const relacion = new JugadorEquipo({ jugador, equipo, creadoPor: usuarioId });
    await relacion.save();

    res.status(201).json(relacion);
  } catch (error) {
    console.error('Error al crear relación:', error);
    res.status(500).json({ message: 'Error al crear relación', error: error.message });
  }
});

// Obtener relaciones con filtros opcionales
router.get('/', async (req, res) => {
  try {
    const { jugador, equipo, activo } = req.query;
    const filtro = {};

    if (jugador) filtro.jugador = jugador;
    if (equipo) filtro.equipo = equipo; // corregido aquí
    if (activo !== undefined) filtro.activo = activo === 'true';

    const relaciones = await JugadorEquipo.find(filtro)
      .populate('jugador', 'nombre alias foto')
      .populate('equipo', 'nombre escudo');

    console.log('✅ Relaciones encontradas:', relaciones);

    res.status(200).json(relaciones);
  } catch (error) {
    console.error('❌ Error al obtener relaciones:', error);
    res.status(500).json({ message: 'Error al obtener relaciones', error: error.message });
  }
});

// Actualizar relación
router.put('/:id', verificarToken, cargarRolDesdeBD, esAdminDeEquipoDeRelacion, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const actualizada = await JugadorEquipo.findByIdAndUpdate(id, updateData, { new: true });
    if (!actualizada) {
      return res.status(404).json({ message: 'Relación no encontrada' });
    }

    res.status(200).json(actualizada);
  } catch (error) {
    console.error('Error al actualizar relación:', error);
    res.status(500).json({ message: 'Error al actualizar relación', error: error.message });
  }
});

// Eliminar relación
router.delete('/:id', validarObjectId, verificarToken, cargarRolDesdeBD, esAdminDeEquipoDeRelacion, async (req, res) => {
  try {
    const { id } = req.params;
    const eliminada = await JugadorEquipo.findByIdAndDelete(id);

    if (!eliminada) {
      return res.status(404).json({ message: 'Relación no encontrada' });
    }

    res.status(200).json({ message: 'Relación eliminada correctamente' });
  } catch (error) {
    console.error('Error al eliminar relación:', error);
    res.status(500).json({ message: 'Error al eliminar relación', error: error.message });
  }
});

export default router;
