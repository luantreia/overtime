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
  eliminarPartido,
  obtenerAdministradores,
  agregarAdministrador,
  quitarAdministrador,
  obtenerPartidosAdministrables
} from '../controllers/partidoController.js';
import verificarToken from '../middlewares/authMiddleware.js';
import { validarObjectId } from '../middlewares/validacionObjectId.js';
// import { esAdminDeEntidad } from '../middlewares/esAdminDeEntidad.js';
import { esAdminSegunTipoPartido } from '../middlewares/esAdminSegunTipoDePartido.js'; // nuevo
import { cargarRolDesdeBD } from '../middlewares/cargarRolDesdeBD.js';
import { cargarPartido } from '../middlewares/cargarPartido.js';
import { verificarEntidad } from '../middlewares/verificarEntidad.js';


const router = express.Router();

router.get('/', obtenerPartidos);
// Obtener partidos administrables por el usuario autenticado
router.get('/admin', verificarToken, cargarRolDesdeBD, obtenerPartidosAdministrables);

router.get('/:id', validarObjectId, obtenerPartidoPorId);
router.post('/', verificarToken, crearPartido);
router.put('/:id', validarObjectId, verificarToken, esAdminSegunTipoPartido(), actualizarPartido);

router.get(
  '/:id/administradores',
  verificarEntidad(Partido, 'id', 'partido'),
  obtenerAdministradores
);

router.post(
  '/:id/administradores',
  verificarToken,
  cargarRolDesdeBD,
  verificarEntidad(Partido, 'id', 'partido'),
  agregarAdministrador
);

router.delete(
  '/:id/administradores/:adminUid',
  verificarToken,
  cargarRolDesdeBD,
  verificarEntidad(Partido, 'id', 'partido'),
  quitarAdministrador
);
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
