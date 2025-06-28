import express from 'express';
import {
  obtenerPartidos,
  obtenerPartidoPorId,
  crearPartido,
  actualizarPartido,
  agregarSet,
  actualizarStatsSet,
  actualizarSet,
  eliminarSet,
  eliminarPartido
} from '../controllers/partidoController.js';
import verificarToken from '../middlewares/authMiddleware.js';
import { validarObjectId } from '../middlewares/validacionObjectId.js';
// import { esAdminDeEntidad } from '../middlewares/esAdminDeEntidad.js';
import { esAdminSegunTipoPartido } from '../middlewares/esAdminSegunTipoDePartido.js'; // nuevo
import { cargarRolDesdeBD } from '../middlewares/cargarRolDesdeBD.js';
import { cargarPartido } from '../middlewares/cargarPartido.js';

const router = express.Router();

router.get('/', obtenerPartidos);
router.get('/:id', validarObjectId, obtenerPartidoPorId);
router.post('/', verificarToken, crearPartido);
router.put('/:id', validarObjectId, verificarToken, esAdminSegunTipoPartido(), actualizarPartido);

router.post('/:id/sets',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  esAdminSegunTipoPartido(),
  cargarPartido,
  agregarSet
);

router.put('/:id/sets/:numeroSet/stats', verificarToken, esAdminSegunTipoPartido(), actualizarStatsSet);

router.put(
  '/:id/sets/:numeroSet',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  esAdminSegunTipoPartido(),
  cargarPartido,
  actualizarSet
);

router.delete(
  '/:id/sets/:numeroSet',
  validarObjectId,
  verificarToken,
  cargarRolDesdeBD,
  esAdminSegunTipoPartido(),
  cargarPartido,
  eliminarSet
);

router.delete('/:id', verificarToken, esAdminSegunTipoPartido(), eliminarPartido);

export default router;
