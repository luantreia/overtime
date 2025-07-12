import mongoose from 'mongoose';

export function verificarEntidad(Model, nombreParam = 'id', aliasEntidad = 'entidad') {
  return async (req, res, next) => {
    const id = req.params[nombreParam];
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'ID inválido' });
    }
    const entidad = await Model.findById(id);
    if (!entidad) {
      return res.status(404).json({ message: `${aliasEntidad} no encontrada` });
    }
    req[aliasEntidad] = entidad;
    next();
  };
}
