import mongoose from 'mongoose';
import {
  MATCH_MEMBER_ROLE_VALUES,
  MATCH_PERMISSION_VALUES,
  mergeMatchPermissions,
} from '../../constants/matchPermissions.js';

const { Schema, model } = mongoose;

/**
 * Habilita a una persona a cargar datos de un partido sin darle acceso al equipo ni a la
 * organización.
 *
 * El alcance es uno de los dos:
 *  - `partido`: para un partido puntual.
 *  - `fase`: el cuerpo estable de planilleros de una fase, así no hay que asignar 43 veces.
 *
 * La ventana `desde`/`hasta` es deliberada: los colaboradores suelen usar un teléfono prestado,
 * y sin vencimiento ese permiso sobreviviría a la devolución del aparato.
 */
const asignacionPartidoSchema = new Schema({
  usuarioId: { type: String, ref: 'Usuario', required: true, index: true },

  partido: { type: Schema.Types.ObjectId, ref: 'Partido', index: true },
  fase: { type: Schema.Types.ObjectId, ref: 'Fase', index: true },

  rol: {
    type: String,
    enum: MATCH_MEMBER_ROLE_VALUES,
    required: true,
  },

  permisos: [{
    type: String,
    enum: MATCH_PERMISSION_VALUES,
  }],

  estado: {
    type: String,
    enum: ['activa', 'revocada'],
    default: 'activa',
    index: true,
  },

  desde: { type: Date, default: Date.now },
  hasta: { type: Date },

  notas: { type: String, default: '' },

  creadoPor: { type: String, ref: 'Usuario', required: true },
  actualizadoPor: { type: String, ref: 'Usuario' },
}, { timestamps: true });

asignacionPartidoSchema.index({ usuarioId: 1, partido: 1 });
asignacionPartidoSchema.index({ usuarioId: 1, fase: 1 });

asignacionPartidoSchema.pre('validate', function(next) {
  if (!this.partido && !this.fase) {
    return next(new Error('La asignación necesita un partido o una fase'));
  }
  if (this.partido && this.fase) {
    return next(new Error('La asignación es de un partido o de una fase, no de las dos cosas'));
  }
  if (this.hasta && this.desde && this.hasta < this.desde) {
    return next(new Error('La fecha de fin no puede ser anterior a la de inicio'));
  }
  this.permisos = mergeMatchPermissions(this.rol, this.permisos || []);
  next();
});

/** Vigente = activa y dentro de la ventana de validez. */
asignacionPartidoSchema.methods.estaVigente = function(ahora = new Date()) {
  if (this.estado !== 'activa') return false;
  if (this.desde && ahora < this.desde) return false;
  if (this.hasta && ahora > this.hasta) return false;
  return true;
};

export default model('AsignacionPartido', asignacionPartidoSchema);
