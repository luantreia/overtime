import express from 'express';
import * as partidoController from '../controllers/partidoController.js';

const router = express.Router();

router.get('/', partidoController.obtenerPartidos);
router.get('/:id', partidoController.obtenerPartidoPorId);
router.put('/:id', partidoController.actualizarPartido);
router.post('/:id/sets', partidoController.agregarSet);
router.put('/:id/sets/:numeroSet/stats', partidoController.actualizarStatsSet);
router.put('/:id/sets/:numeroSet', partidoController.actualizarSet);
router.delete('/:id', partidoController.eliminarPartido);

export default router;
