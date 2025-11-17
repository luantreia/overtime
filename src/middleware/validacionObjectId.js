// server/middlewares/validarObjectId.js
import mongoose from 'mongoose';

const { Types } = mongoose;

export function validarObjectId(req, res, next) {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'ID inválido.' });
  }
  next();
}
