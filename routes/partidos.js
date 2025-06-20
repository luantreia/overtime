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
import Partido from '../models/Partido.js';
import verificarToken from '../middlewares/authMiddleware.js';
import { validarObjectId } from '../middlewares/validacionObjectId.js';
import { esAdminDeEntidad } from '../middlewares/esAdminDeEntidad.js';

const router = express.Router();

router.get('/', obtenerPartidos);
router.get('/:id', validarObjectId, obtenerPartidoPorId);
router.post('/', verificarToken, crearPartido);
router.put('/:id', validarObjectId, verificarToken, esAdminDeEntidad(Partido, 'partido'), actualizarPartido);
router.post('/:id/sets', verificarToken, esAdminDeEntidad(Partido, 'partido'), agregarSet);
router.put('/:id/sets/:numeroSet/stats', verificarToken, esAdminDeEntidad(Partido, 'partido'), actualizarStatsSet);
router.put('/:id/sets/:numeroSet', verificarToken, esAdminDeEntidad(Partido, 'partido'), actualizarSet);
router.delete('/:id', verificarToken, esAdminDeEntidad(Partido, 'partido'), eliminarPartido);

export default router;

