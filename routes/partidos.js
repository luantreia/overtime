import express from 'express';
import {
  obtenerPartidos,
  obtenerPartidoPorId,
  crearPartido,
  actualizarPartido,
  agregarSet,
  actualizarStatsSet,
  actualizarSet,
  eliminarPartido
} from '../controllers/partidoController.js';

import { validarObjectId } from '../middlewares/validarObjectId.js';

const router = express.Router();

router.get('/', obtenerPartidos);
router.get('/:id', validarObjectId, obtenerPartidoPorId);
router.post('/', crearPartido);
router.put('/:id', validarObjectId, actualizarPartido);
router.post('/:id/sets', validarObjectId, agregarSet);
router.put('/:id/sets/:numeroSet/stats', validarObjectId, actualizarStatsSet);
router.put('/:id/sets/:numeroSet', validarObjectId, actualizarSet);
router.delete('/:id', validarObjectId, eliminarPartido);

export default router;
