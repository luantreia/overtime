import { JugadorService } from '../services/index.js';
import { handleValidationErrors } from '../validators/userValidator.js';
import { body, validationResult } from 'express-validator';
import logger from '../utils/logger.js';

/**
 * Controlador de Jugadores - Ejemplo de refactorización a Services
 * 
 * Este archivo demuestra cómo las rutas pueden ser refactorizadas
 * para usar el Services Layer en lugar de lógica directa en las rutas.
 */

// Validación para crear jugador
const validateJugadorCreation = [
  body('nombre')
    .trim()
    .isLength({ min: 2 })
    .withMessage('Nombre debe tener al menos 2 caracteres'),
  body('fechaNacimiento')
    .isISO8601()
    .withMessage('Fecha de nacimiento debe ser una fecha válida'),
  body('genero')
    .optional()
    .isIn(['masculino', 'femenino', 'otro'])
    .withMessage('Género debe ser masculino, femenino u otro'),
  body('alias')
    .optional()
    .isLength({ max: 50 })
    .withMessage('Alias no debe exceder 50 caracteres'),
  body('foto')
    .optional()
    .isURL()
    .withMessage('Foto debe ser una URL válida'),
];

// POST /api/jugadores - Crear nuevo jugador
export const crearJugador = [
  // Validación de inputs
  ...validateJugadorCreation,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { nombre, alias, fechaNacimiento, genero, foto } = req.body;
      const usuarioId = req.user.uid;

      const jugador = await JugadorService.crearJugador(
        { nombre, alias, fechaNacimiento, genero, foto },
        usuarioId
      );

      res.status(201).json({
        success: true,
        data: jugador,
        message: 'Jugador creado exitosamente'
      });
    } catch (error) {
      next(error);
    }
  }
];

// GET /api/jugadores/admin - Obtener jugadores administrables
export const obtenerJugadoresAdministrables = async (req, res, next) => {
  try {
    const uid = req.user.uid;
    const rol = req.user.rol;

    const jugadores = await JugadorService.obtenerJugadoresAdministrables(uid, rol);

    res.status(200).json({
      success: true,
      data: jugadores
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/jugadores - Obtener todos los jugadores con paginación
export const obtenerTodosJugadores = async (req, res, next) => {
  try {
    const resultado = await JugadorService.obtenerJugadoresPaginados(req);

    res.status(200).json({
      success: true,
      ...resultado
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/jugadores/:id - Obtener jugador por ID
export const obtenerJugadorPorId = async (req, res, next) => {
  try {
    const { id } = req.params;

    const jugador = await JugadorService.obtenerJugadorConDetalles(id);

    res.status(200).json({
      success: true,
      data: jugador
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/jugadores/:id - Actualizar jugador
export const actualizarJugador = async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const usuarioId = req.user.uid;
    const rol = req.user.rol;

    const jugador = await JugadorService.actualizarJugador(id, data, usuarioId, rol);

    res.status(200).json({
      success: true,
      data: jugador,
      message: 'Jugador actualizado exitosamente'
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/jugadores/:id/administradores - Agregar administrador
export const agregarAdministrador = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { adminUid, email } = req.body;
    const usuarioId = req.user.uid;
    const rol = req.user.rol;

    const administradores = await JugadorService.agregarAdministrador(
      id, adminUid, email, usuarioId, rol
    );

    res.status(200).json({
      success: true,
      data: { administradores },
      message: 'Administrador agregado exitosamente'
    });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/jugadores/:id/administradores/:adminId - Quitar administrador
export const quitarAdministrador = async (req, res, next) => {
  try {
    const { id, adminId } = req.params;
    const usuarioId = req.user.uid;

    const administradores = await JugadorService.quitarAdministrador(id, adminId, usuarioId);

    res.status(200).json({
      success: true,
      data: { administradores },
      message: 'Administrador quitado exitosamente'
    });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/jugadores/:id - Eliminar jugador
export const eliminarJugador = async (req, res, next) => {
  try {
    const { id } = req.params;
    const usuarioId = req.user.uid;
    const rol = req.user.rol;

    const resultado = await JugadorService.eliminarJugador(id, usuarioId, rol);

    res.status(200).json({
      success: true,
      ...resultado
    });
  } catch (error) {
    next(error);
  }
};