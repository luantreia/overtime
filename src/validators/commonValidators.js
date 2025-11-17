// validators/commonValidators.js
import { body, param, query } from 'express-validator';
import mongoose from 'mongoose';

/**
 * Validator for MongoDB ObjectId in params
 */
export const validateObjectIdParam = (paramName = 'id') => [
  param(paramName)
    .custom((value) => mongoose.Types.ObjectId.isValid(value))
    .withMessage(`${paramName} debe ser un ObjectId válido`),
];

/**
 * Validator for MongoDB ObjectId in body
 */
export const validateObjectIdBody = (fieldName) => [
  body(fieldName)
    .custom((value) => mongoose.Types.ObjectId.isValid(value))
    .withMessage(`${fieldName} debe ser un ObjectId válido`),
];

/**
 * Validator for pagination query params
 */
export const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page debe ser un número entero mayor a 0'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit debe ser un número entero entre 1 y 100'),
];

/**
 * Validator for email
 */
export const validateEmail = (fieldName = 'email') => [
  body(fieldName)
    .trim()
    .isEmail()
    .withMessage(`${fieldName} debe ser un email válido`)
    .normalizeEmail(),
];

/**
 * Validator for required string
 */
export const validateRequiredString = (fieldName, minLength = 1, maxLength = 255) => [
  body(fieldName)
    .trim()
    .isLength({ min: minLength, max: maxLength })
    .withMessage(`${fieldName} debe tener entre ${minLength} y ${maxLength} caracteres`)
    .notEmpty()
    .withMessage(`${fieldName} es requerido`),
];

/**
 * Validator for optional string
 */
export const validateOptionalString = (fieldName, maxLength = 255) => [
  body(fieldName)
    .optional()
    .trim()
    .isLength({ max: maxLength })
    .withMessage(`${fieldName} no debe exceder ${maxLength} caracteres`),
];

/**
 * Validator for URL
 */
export const validateURL = (fieldName) => [
  body(fieldName)
    .optional()
    .isURL()
    .withMessage(`${fieldName} debe ser una URL válida`),
];

/**
 * Validator for date
 */
export const validateDate = (fieldName) => [
  body(fieldName)
    .isISO8601()
    .withMessage(`${fieldName} debe ser una fecha válida en formato ISO8601`),
];

/**
 * Validator for enum values
 */
export const validateEnum = (fieldName, allowedValues) => [
  body(fieldName)
    .isIn(allowedValues)
    .withMessage(`${fieldName} debe ser uno de: ${allowedValues.join(', ')}`),
];
