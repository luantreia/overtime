import express from 'express';
import Jugador from '../models/Jugador.js';
import Equipo from '../models/Equipo.js';
import mongoose from 'mongoose';

const { Types } = mongoose;
const router = express.Router();

// Crear nuevo jugador
router.post('/', async (req, res) => {
  let { nombre, posicion, equipoId, edad, foto } = req.body;

  try {
    // Si equipoId no es un ObjectId válido, buscar por otro campo
    if (!Types.ObjectId.isValid(equipoId)) {
      // Intentar buscar por el campo "numero" si estás enviando un número como "1"
      const equipo = await Equipo.findOne({ numero: parseInt(equipoId) });

      if (!equipo) {
        return res.status(400).json({ message: 'Equipo no encontrado con ID o número proporcionado' });
      }

      equipoId = equipo._id; // Usar el ObjectId real
    }

    const jugador = new Jugador({
      nombre,
      posicion: Array.isArray(posicion) ? posicion : [posicion],
      equipoId,
      edad,
      foto
    });

    await jugador.save();
    res.status(201).json(jugador);
  } catch (error) {
    console.error('Error al guardar jugador:', error);
    res.status(400).json({ message: 'Error al guardar jugador', error: error.message });
  }
});

// Ruta para obtener jugadores, filtrando por equipoId si se proporciona
router.get('/', async (req, res) => {
  try {
    const { equipoId } = req.query;
    const filtro = {};
    if (equipoId) filtro.equipoId = equipoId;
    const jugadores = await Jugador.find(filtro).populate('equipoId');
    res.status(200).json(jugadores);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { nombre, posicion, equipo, edad, foto } = req.body;

  try {
    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'ID de jugador no válido' });
    }

    const jugador = await Jugador.findById(id);
    if (!jugador) {
      return res.status(404).json({ message: 'Jugador no encontrado' });
    }

    if (equipo && !Types.ObjectId.isValid(equipo)) {
      const equipoEncontrado = await Equipo.findOne({ numero: parseInt(equipo) });
      if (!equipoEncontrado) {
        return res.status(400).json({ message: 'Equipo no encontrado' });
      }
      jugador.equipoId = equipoEncontrado._id;
    } else if (equipo) {
      jugador.equipoId = equipo;
    }

    jugador.nombre = nombre ?? jugador.nombre;
    jugador.posicion = Array.isArray(posicion) ? posicion : [posicion];
    jugador.edad = edad ?? jugador.edad;
    jugador.foto = foto ?? jugador.foto;

    await jugador.save();
    res.status(200).json(jugador);
  } catch (error) {
    console.error('Error al actualizar jugador:', error);
    res.status(400).json({ message: 'Error al actualizar jugador', error: error.message });
  }
});
// Eliminar jugador por ID
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'ID de jugador no válido' });
    }

    const jugador = await Jugador.findByIdAndDelete(id);
    if (!jugador) {
      return res.status(404).json({ message: 'Jugador no encontrado' });
    }

    res.status(200).json({ message: 'Jugador eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar jugador:', error);
    res.status(500).json({ message: 'Error al eliminar jugador', error: error.message });
  }
});

export default router;
