import { body, validationResult } from 'express-validator';

export const validateUserCreation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email inválido'),
  body('nombre')
    .trim()
    .isLength({ min: 2 })
    .withMessage('Nombre debe tener al menos 2 caracteres'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password debe tener al menos 8 caracteres')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password debe tener mayúscula, minúscula y número'),
];

// Middleware para procesar errores
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      errors: errors.array().map(e => ({
        field: e.param,
        message: e.msg
      }))
    });
  }
  next();
};