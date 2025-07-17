// servicios/equipoCompetenciaService.js
export async function crearEquipoCompetenciaAuto({ equipo, competencia, creadoPor }) {
  const yaExiste = await EquipoCompetencia.findOne({ equipo, competencia });
  if (yaExiste) return yaExiste;

  const nuevo = new EquipoCompetencia({
    equipo,
    competencia,
    estado: 'pendiente',
    origen: 'sistema',
    solicitadoPor: creadoPor,
    creadoPor,
  });
  await nuevo.save();
  return nuevo;
}
