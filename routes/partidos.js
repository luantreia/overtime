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
import verificarToken from '../middlewares/authMiddleware.js';
import { esAdminDePartido } from '../middlewares/esAdminDePartido.js';
import { validarObjectId } from '../middlewares/validacionObjectId.js';

const router = express.Router();

router.get('/', obtenerPartidos);
router.get('/:id', validarObjectId, obtenerPartidoPorId);
router.post('/', verificarToken, crearPartido);
router.put('/:id', validarObjectId, verificarToken, esAdminDePartido, actualizarPartido);
router.post('/:id/sets', validarObjectId, verificarToken, esAdminDePartido, agregarSet);
router.put('/:id/sets/:numeroSet/stats', validarObjectId, verificarToken, esAdminDePartido, actualizarStatsSet);
router.put('/:id/sets/:numeroSet', validarObjectId, verificarToken, esAdminDePartido, actualizarSet);
router.delete('/:id', validarObjectId, verificarToken, esAdminDePartido, eliminarPartido);

export default router;

