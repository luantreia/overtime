import mongoose from 'mongoose';
import { tiposSolicitudMeta } from '../config/solicitudesMeta.js';
const { Schema, model } = mongoose;

const SolicitudEdicionSchema = new Schema({
    tipo: {
        type: String,
        enum: Object.keys(tiposSolicitudMeta),
        required: true,
        index: true,
    },

    entidad: { type: Schema.Types.ObjectId, required: false }, // puede no existir aún (nuevo contrato)

    datosPropuestos: {
        type: Schema.Types.Mixed, // Objeto con datos a validar
        required: true,
    },

    estado: {
        type: String,
        enum: ['pendiente', 'aceptado', 'rechazado', 'cancelado'],
        default: 'pendiente',
        index: true,
    },
    aceptadoPor: [
        {
            type: String,
            ref: 'Usuario',
        }
    ],

    requiereDobleConfirmacion: {
    type: Boolean,
    default: false,
    },

    motivoRechazo: { type: String },
    fechaAceptacion: { type: Date },
    fechaRechazo: { type: Date },

    creadoPor: { type: String, ref: 'Usuario', required: true },
    aprobadoPor: { type: String, ref: 'Usuario' },

}, { timestamps: true });

export default model('SolicitudEdicion', SolicitudEdicionSchema);
