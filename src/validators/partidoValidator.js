// validators/partidoValidator.js
import { body } from 'express-validator';
import {
  validateObjectIdBody,
  validateRequiredString,
  validateOptionalString,
  validateDate,
  validateEnum,
} from './commonValidators.js';

export const validatePartidoCreation = [
  ...validateObjectIdBody('equipoLocal'),
  ...validateObjectIdBody('equipoVisitante'),
  ...validateDate('fecha'),
  ...validateEnum('modalidad', ['4x4', '6x6', '8x8']),
  ...validateOptionalString('lugar', 255),
  body('equipoLocal')
    .custom((value, { req }) => value !== req.body.equipoVisitante)
    .withMessage('equipoLocal y equipoVisitante no pueden ser el mismo equipo'),
  body('competencia')
    .optional()
    .isMongoId()
    .withMessage('competencia debe ser un ObjectId válido'),
  body('fase')
    .optional()
    .isMongoId()
    .withMessage('fase debe ser un ObjectId válido'),
  body('grupo')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('grupo no debe exceder 50 caracteres'),
];

export const validatePartidoUpdate = [
  ...validateOptionalString('lugar', 255),
  body('marcadorLocal')
    .optional()
    .isInt({ min: 0 })
    .withMessage('marcadorLocal debe ser un número entero positivo'),
  body('marcadorVisitante')
    .optional()
    .isInt({ min: 0 })
    .withMessage('marcadorVisitante debe ser un número entero positivo'),
  body('estado')
    .optional()
    .isIn(['pendiente', 'en_progreso', 'finalizado', 'cancelado'])
    .withMessage('estado debe ser uno de: pendiente, en_progreso, finalizado, cancelado'),
  ...validateDate('fecha').map(v => {
    // Make fecha optional for updates
    const validator = { ...v };
    validator.optional = true;
    return validator;
  }),
];

export const validateEstadisticasJugador = [
  ...validateObjectIdBody('jugadorPartido'),
  body('throws')
    .isInt({ min: 0 })
    .withMessage('throws debe ser un número entero positivo'),
  body('hits')
    .isInt({ min: 0 })
    .withMessage('hits debe ser un número entero positivo'),
  body('outs')
    .isInt({ min: 0 })
    .withMessage('outs debe ser un número entero positivo'),
  body('catches')
    .isInt({ min: 0 })
    .withMessage('catches debe ser un número entero positivo'),
];
