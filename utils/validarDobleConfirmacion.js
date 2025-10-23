// utils/validarDobleConfirmacion.js

import { tiposSolicitudMeta } from '../config/solicitudesMeta.js';

export default function validarDobleConfirmacion(tipo, camposModificados) {
  const meta = tiposSolicitudMeta[tipo];
  if (!meta) throw new Error(`Tipo de solicitud "${tipo}" no definido en metadatos`);

  const camposCriticosModificados = camposModificados.filter(c => meta.camposCriticos.includes(c));

  const requiere = meta.requiereDobleConfirmacion && camposCriticosModificados.length > 0;

  return {
    requiereDobleConfirmacion: requiere,
    camposCriticosModificados,
  };
}
