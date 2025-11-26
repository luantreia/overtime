// config/solicitudesMeta.js

export const tiposSolicitudMeta = {

  // Contratos jugador-Equipo
  'jugador-equipo-editar': {
    requiereDobleConfirmacion: false,
    camposCriticos: ['fechaInicio', 'fechaFin', 'estado', 'rol'],
    rolesAprobadores: ['adminEquipo', 'adminJugador'],
    camposPermitidosSinConsenso: ['foto', 'alias'],
  },
  'jugador-equipo-crear': {
    requiereDobleConfirmacion: false,
    camposCriticos: ['jugadorId', 'equipoId', 'fechaInicio', 'fechaFin', 'estado', 'rol'],
    rolesAprobadores: ['adminEquipo', 'adminJugador'],
    camposPermitidosSinConsenso: [],
  },
  'jugador-equipo-eliminar': {
    requiereDobleConfirmacion: false,
    camposCriticos: ['contratoId'],
    rolesAprobadores: ['adminEquipo', 'adminJugador'],
    camposPermitidosSinConsenso: [],
  },

  // Contrato directo Equipo-Competencia (inscripción fuera del ciclo de temporada)
  'contratoEquipoCompetencia': {
    requiereDobleConfirmacion: false,
    camposCriticos: ['equipoId', 'competenciaId', 'fechaInicio', 'fechaFin', 'estado', 'rol'],
    rolesAprobadores: ['adminEquipo', 'adminCompetencia'],
    camposPermitidosSinConsenso: [],
  },

  // Contratos (equipo) Participacion-Temporada
  'participacion-temporada-crear': {
    requiereDobleConfirmacion: false,
    camposCriticos: ['equipoId', 'temporadaId'],
    rolesAprobadores: ['adminEquipo', 'adminCompetencia'],
    camposPermitidosSinConsenso: [],
  },
  'participacion-temporada-actualizar': {
    requiereDobleConfirmacion: false,
    camposCriticos: ['estado', 'observaciones'],
    rolesAprobadores: ['adminEquipo', 'adminCompetencia'],
    camposPermitidosSinConsenso: [],
  },
  'participacion-temporada-eliminar': {
    requiereDobleConfirmacion: false,
    camposCriticos: ['participacionTemporadaId'],
    rolesAprobadores: ['adminEquipo', 'adminCompetencia'],
    camposPermitidosSinConsenso: [],
  },

  // lista de buena fe Jugador-Temporada
  'jugador-temporada-crear': {
    requiereDobleConfirmacion: false,
    camposCriticos: ['jugadorEquipoId', 'participacionTemporadaId', 'rol', 'estado'],
    rolesAprobadores: ['adminEquipo', 'adminCompetencia'],
    camposPermitidosSinConsenso: [],
  },
  'jugador-temporada-actualizar': {
    requiereDobleConfirmacion: false,
    camposCriticos: ['rol', 'estado'],
    rolesAprobadores: ['adminEquipo', 'adminCompetencia'],
    camposPermitidosSinConsenso: [],
  },
  'jugador-temporada-eliminar': {
    requiereDobleConfirmacion: false,
    camposCriticos: ['jugadorTemporadaId'],
    rolesAprobadores: ['adminEquipo', 'adminCompetencia'],
    camposPermitidosSinConsenso: [],
  },

  // datos partidos
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
  estadisticasJugadorSet: {
    requiereDobleConfirmacion: false,
    camposCriticos: [],
    rolesAprobadores: ['adminCompetencia', 'adminEquipo'],
  },

  // Solicitudes de cambios en partidos (por DT/Manager)
  'editarPartidoCompetencia': {
    requiereDobleConfirmacion: false,
    camposCriticos: ['ubicacion', 'fecha', 'hora', 'marcadorLocal', 'marcadorVisitante', 'estado', 'setGanador'],
    rolesAprobadores: ['adminCompetencia', 'adminOrganizacion'],
    camposPermitidosSinConsenso: [],
    descripcion: 'DT/Manager solicita cambios en campos de competencia',
  },
  'solicitarEstadisticasJugador': {
    requiereDobleConfirmacion: false,
    camposCriticos: ['jugadorId', 'ataques', 'defensas', 'faltas', 'errores', 'puntosDeOro', 'minutosJugados'],
    rolesAprobadores: ['adminCompetencia', 'adminEquipo', 'adminOrganizacion'],
    camposPermitidosSinConsenso: [],
    descripcion: 'Manager/DT solicita registro de estadísticas de jugador',
  },

  // Usuario / Entidades
  'usuario-crear-jugador': {
    requiereDobleConfirmacion: false,
    camposCriticos: ['nombre', 'fechaNacimiento'],
    rolesAprobadores: ['adminSistema'],
  },
  'usuario-crear-equipo': {
    requiereDobleConfirmacion: false,
    camposCriticos: ['nombre'],
    rolesAprobadores: ['adminSistema'],
  },
  'usuario-crear-organizacion': {
    requiereDobleConfirmacion: false,
    camposCriticos: ['nombre'],
    rolesAprobadores: ['adminSistema'],
  },
  'usuario-solicitar-admin-jugador': {
    requiereDobleConfirmacion: false,
    camposCriticos: ['jugadorId'],
    rolesAprobadores: ['adminJugador'],
  },
  'usuario-solicitar-admin-equipo': {
    requiereDobleConfirmacion: false,
    camposCriticos: ['equipoId'],
    rolesAprobadores: ['adminEquipo'],
  },
  'usuario-solicitar-admin-organizacion': {
    requiereDobleConfirmacion: false,
    camposCriticos: ['organizacionId'],
    rolesAprobadores: ['adminOrganizacion'],
  },
  // Agregá más tipos si necesitás
};
