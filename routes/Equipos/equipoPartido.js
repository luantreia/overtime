import express from 'express';
import EquipoPartido from '../models/EquipoPartido.js';
import verificarToken from '../middlewares/authMiddleware.js';
import { validarObjectId } from '../middlewares/validacionObjectId.js';

const router = express.Router();

// ✅ GET - Obtener todos (opcionalmente filtrados por partido o equipo)
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

// ✅ GET - Obtener uno por ID
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
router.post('/', verificarToken, async (req, res) => {
  try {
    const nuevo = new EquipoPartido({
      ...req.body,
      creadoPor: req.usuarioId,
    });

    await nuevo.save();
    res.status(201).json(nuevo);
  } catch (err) {
    if (err.code === 11000) {
      res.status(400).json({ message: 'Ya existe un vínculo para ese partido y equipo' });
    } else {
      res.status(500).json({ message: err.message });
    }
  }
});

// ✅ PUT - Editar uno existente
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
router.delete('/:id', verificarToken, validarObjectId, async (req, res) => {
  try {
    const eliminado = await EquipoPartido.findByIdAndDelete(req.params.id);
    if (!eliminado) return res.status(404).json({ message: 'No encontrado' });
    res.json({ message: 'Eliminado correctamente' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
