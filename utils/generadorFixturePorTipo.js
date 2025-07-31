// utils/generadorFixturePorTipo.js
import { generarRoundRobinPorDivision } from './fixtureGenerator.js';
import { generarRoundRobinPorGrupo } from './generarPorGrupo.js';
import { generarEliminatoriaDirecta } from './generarEliminatoria.js';

export const generarFixturePorTipo = (fase, participaciones, datosBase) => {
  switch (fase.tipo) {
    case 'grupos':
      return generarRoundRobinPorGrupo(participaciones, datosBase, fase);
    case 'liga':
      return generarRoundRobinPorDivision(participaciones, datosBase, fase);
    case 'playoff':
      return generarEliminatoriaDirecta(participaciones, datosBase, fase);
    default:
      throw new Error(`Tipo de fase no soportado: ${fase.tipo}`);
  }
};
