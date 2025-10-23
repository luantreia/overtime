// config/solicitudesMeta.js

export const tiposSolicitudMeta = {
  contratoJugadorEquipo: {
    requiereDobleConfirmacion: false,
    camposCriticos: ['fechaInicio', 'fechaFin', 'estado', 'rol', 'numero'],
    rolesAprobadores: ['adminEquipo', 'adminJugador'],
    camposPermitidosSinConsenso: ['foto', 'alias'],
  },
  contratoEquipoCompetencia: {
    requiereDobleConfirmacion: true,
    camposCriticos: ['fechaInicio', 'fechaFin', 'estado'],
    rolesAprobadores: ['adminEquipo', 'adminCompetencia'],
    camposPermitidosSinConsenso: [],
  },
  resultadoPartido: {
    requiereDobleConfirmacion: false,
    camposCriticos: [],
    rolesAprobadores: ['adminCompetencia', 'adminEquipo'],
  },
  resultadoSet: {
    requiereDobleConfirmacion: false,
    camposCriticos: [],
    rolesAprobadores: ['adminCompetencia', 'adminEquipo'],
  },
  estadisticasJugadorPartido: {
    requiereDobleConfirmacion: false,
    camposCriticos: [],
    rolesAprobadores: ['adminCompetencia', 'adminEquipo'],
  },
  estadisticasJugadorSet: {
    requiereDobleConfirmacion: false,
    camposCriticos: [],
    rolesAprobadores: ['adminCompetencia', 'adminEquipo'],
  },
  estadisticasEquipoPartido: {
    requiereDobleConfirmacion: false,
    camposCriticos: [],
    rolesAprobadores: ['adminCompetencia', 'adminEquipo'],
  },
  estadisticasEquipoSet: {
    requiereDobleConfirmacion: false,
    camposCriticos: [],
    rolesAprobadores: ['adminCompetencia', 'adminEquipo'],
  },
  // Agregá más tipos si necesitás
};
