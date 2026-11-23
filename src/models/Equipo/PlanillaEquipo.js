import mongoose from 'mongoose';
import { videoPartidoSchema } from '../Partido/tiempoVideo.js';
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

  /**
   * Quién es dueño de la planilla. Nació siendo sólo de equipos; ahora también puede ser
   * de un jugador ("mis números", sólo sus propias filas) o de una organización
   * (reconciliar las planillas de los dos equipos, preparar una fecha, importar).
   *
   * Campos explícitos por tipo en vez de un `dueño: { tipo, id }` polimórfico: así
   * `planilla.equipo` sigue donde estaba para las lecturas existentes, `populate` anda sin
   * refPath y el generador de tipos emite `Ref<Equipo>` limpio. Va cargada exactamente
   * una de las tres refs, la que corresponde a `tipoDuenio` (ver el pre-validate).
   *
   * Sin ñ a propósito: viaja en queries, URLs y tipos generados.
   */
  tipoDuenio: {
    type: String,
    enum: ['equipo', 'jugador', 'organizacion'],
    default: 'equipo',
    index: true,
  },
  equipo: { type: Schema.Types.ObjectId, ref: 'Equipo', index: true },
  jugador: { type: Schema.Types.ObjectId, ref: 'Jugador', index: true },
  organizacion: { type: Schema.Types.ObjectId, ref: 'Organizacion', index: true },

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

  /**
   * Sólo planillas de jugador: el jugador ofrece sus números a la planilla de su equipo.
   * No es una oficialización: el DT acepta (se copian a la planilla del equipo, que
   * después sigue su propio flujo) o descarta. La planilla del jugador nunca escribe
   * directo en lo oficial — es la fuente menos confiable (cada uno se anota sus hits).
   */
  aporte: {
    type: new Schema({
      estado: { type: String, enum: ['pendiente', 'aceptado', 'descartado'], required: true },
      equipo: { type: Schema.Types.ObjectId, ref: 'Equipo', required: true },
      fecha: { type: Date, default: Date.now },
      resueltoPor: { type: String, ref: 'Usuario' },
      fechaResolucion: { type: Date },
      motivo: { type: String },
    }, { _id: false }),
    default: undefined,
  },

  /**
   * Videos (cámaras) propios de la planilla, misma forma que `Partido.videos`. Los tiempos de
   * sus sets y marcas están en segundos de partido según ESTOS relojes. Vacío = usa los del
   * partido. Al oficializar se suman a los del partido.
   */
  videos: { type: [videoPartidoSchema], default: [] },

  notas: { type: String },

  creadoPor: { type: String, ref: 'Usuario', required: true },
}, { timestamps: true });

/** Qué campo lleva la ref del dueño, según `tipoDuenio`. */
export const CAMPO_DUENIO = { equipo: 'equipo', jugador: 'jugador', organizacion: 'organizacion' };

planillaEquipoSchema.pre('validate', function validarDuenio(next) {
  const tipo = this.tipoDuenio || 'equipo';
  const cargados = Object.values(CAMPO_DUENIO).filter((campo) => this[campo]);
  if (cargados.length !== 1 || cargados[0] !== CAMPO_DUENIO[tipo]) {
    return next(new Error(`Una planilla de tipo '${tipo}' lleva cargado sólo el campo '${CAMPO_DUENIO[tipo]}'`));
  }
  return next();
});

planillaEquipoSchema.index({ 'aporte.equipo': 1, 'aporte.estado': 1 }, { sparse: true });

// Una planilla por partido y por dueño. Índices parciales por tipo: el viejo
// { partido, equipo } sin filtro trataría `equipo: null` como un valor más y rechazaría
// la segunda planilla sin equipo de un mismo partido. server.js dropea el viejo al arrancar.
for (const [tipo, campo] of Object.entries(CAMPO_DUENIO)) {
  planillaEquipoSchema.index(
    { partido: 1, [campo]: 1 },
    { unique: true, name: `partido_1_${campo}_1_${tipo}`, partialFilterExpression: { tipoDuenio: tipo } },
  );
}

export default model('PlanillaEquipo', planillaEquipoSchema);
