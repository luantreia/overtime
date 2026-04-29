import mongoose from 'mongoose';
import {
  TEAM_MEMBER_ROLE_VALUES,
  TEAM_PERMISSION_VALUES,
  mergePermissions,
} from '../../constants/teamPermissions.js';

const { Schema, model } = mongoose;

const miembroEquipoSchema = new Schema({
  equipo: { type: Schema.Types.ObjectId, ref: 'Equipo', required: true, index: true },
  usuarioId: { type: String, ref: 'Usuario', required: true, index: true },

  rol: {
    type: String,
    enum: TEAM_MEMBER_ROLE_VALUES,
    default: 'otro',
    required: true,
  },

  permisos: [{
    type: String,
    enum: TEAM_PERMISSION_VALUES,
  }],

  estado: {
    type: String,
    enum: ['invitado', 'activo', 'suspendido', 'inactivo'],
    default: 'activo',
    index: true,
  },

  notas: { type: String, default: '' },

  creadoPor: { type: String, ref: 'Usuario', required: true },
  actualizadoPor: { type: String, ref: 'Usuario' },
}, { timestamps: true });

miembroEquipoSchema.index({ equipo: 1, usuarioId: 1 }, { unique: true });

miembroEquipoSchema.pre('validate', function(next) {
  this.permisos = mergePermissions(this.rol, this.permisos || []);
  next();
});

export default model('MiembroEquipo', miembroEquipoSchema);
