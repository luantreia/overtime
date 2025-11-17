// validators/equipoValidator.js
import { body } from 'express-validator';
import {
  validateRequiredString,
  validateOptionalString,
  validateURL,
  validateEnum,
} from './commonValidators.js';

export const validateEquipoCreation = [
  ...validateRequiredString('nombre', 2, 100),
  ...validateOptionalString('alias', 50),
  ...validateURL('escudo'),
  body('genero')
    .optional()
    .isIn(['masculino', 'femenino', 'mixto'])
    .withMessage('genero debe ser uno de: masculino, femenino, mixto'),
  body('categoria')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('categoria no debe exceder 50 caracteres'),
  body('organizacion')
    .optional()
    .isMongoId()
    .withMessage('organizacion debe ser un ObjectId válido'),
];

export const validateEquipoUpdate = [
  ...validateOptionalString('nombre', 100),
  ...validateOptionalString('alias', 50),
  ...validateURL('escudo'),
  body('genero')
    .optional()
    .isIn(['masculino', 'femenino', 'mixto'])
    .withMessage('genero debe ser uno de: masculino, femenino, mixto'),
  body('categoria')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('categoria no debe exceder 50 caracteres'),
  body('estado')
    .optional()
    .isIn(['activo', 'inactivo', 'disuelto'])
    .withMessage('estado debe ser uno de: activo, inactivo, disuelto'),
];
