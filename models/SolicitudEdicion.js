import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const SolicitudEdicionSchema = new Schema({
    tipo: {
        type: String,
        enum: [
        'resultadoPartido',
        'resultadoSet',
        'estadisticasJugadorPartido',
        'estadisticasJugadorSet',
        'estadisticasEquipoPartido',
        'estadisticasEquipoSet',
        'contratoJugadorEquipo',
        'contratoEquipoCompetencia',
        'jugador-equipo-crear',
        'jugador-equipo-eliminar',
        ],
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
