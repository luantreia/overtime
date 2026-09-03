import mongoose from 'mongoose';
const { Schema, model } = mongoose;

/**
 * PlanillaEquipo - Captura de un partido hecha por uno de los equipos que lo jugó.
 *
 * Vive en paralelo al registro oficial de la competencia y NUNCA escribe en él: un
 * equipo puede reconstruir un partido ya finalizado, sin sets ni convocatoria
 * cargados por la organización, y analizarlo sin pedirle permiso a nadie. Recién si
 * pide la oficialización (y un aprobador la acepta) los números se materializan en
 * SetPartido / JugadorPartido / EstadisticasJugadorSet.
 *
 * Por qué colecciones propias y no un flag `oficial: false` sobre las oficiales:
 * los índices únicos { partido, numeroSet } y { partido, jugador } chocan apenas los
 * dos equipos capturen el mismo partido, y aislar por flag deja que cualquier `find`
 * que se olvide del filtro publique datos no oficiales en la tabla de posiciones o
 * en el portal público. Aislar por colección es verificable.
 *
 * Las filas de planilla no llevan `estadoPublicacion`: la privacidad es del
 * contenedor entero, que es privado por construcción.
 */
const planillaEquipoSchema = new Schema({
  partido: { type: Schema.Types.ObjectId, ref: 'Partido', required: true, index: true },
  equipo: { type: Schema.Types.ObjectId, ref: 'Equipo', required: true, index: true },

  // 'sets' replica la captura granular set a set; 'directa' son totales del partido
  // sin desglose, el equivalente de EstadisticasJugadorPartidoManual.
  modo: { type: String, enum: ['sets', 'directa'], default: 'sets' },

  estado: {
    type: String,
    enum: ['borrador', 'pendiente_oficializacion', 'oficializada', 'rechazada'],
    default: 'borrador',
    index: true,
  },

  visibilidadObjetivo: {
    type: String,
    enum: ['organizacion', 'publica'],
    default: 'organizacion',
  },

  solicitudOficializacion: { type: Schema.Types.ObjectId, ref: 'SolicitudEdicion' },

  /**
   * Cuando un partido tiene estadísticas oficiales Y esta planilla, cuál de las dos alimenta
   * el análisis PROPIO del equipo (totales, análisis cruzado, rankings). No toca el dato
   * oficial ni lo que ve nadie más: es una lente privada del equipo sobre su propia historia,
   * para cuando la organización cargó un partido mal o incompleto y la planilla es la buena.
   *
   * Ojo con no confundirlo con `Partido.modoVisualizacion`, que es del organizador, decide si
   * lo oficial sale de los sets o de la carga directa, y aplica a todo el mundo.
   *
   * Default 'oficial': mientras el equipo no diga lo contrario, el registro de la competencia
   * manda. Si el partido no tiene estadísticas oficiales, la planilla se usa igual — este
   * campo sólo desempata cuando existen las dos.
   */
  fuentePreferida: {
    type: String,
    enum: ['oficial', 'planilla'],
    default: 'oficial',
  },

  notas: { type: String },

  creadoPor: { type: String, ref: 'Usuario', required: true },
}, { timestamps: true });

planillaEquipoSchema.index({ partido: 1, equipo: 1 }, { unique: true });

export default model('PlanillaEquipo', planillaEquipoSchema);
