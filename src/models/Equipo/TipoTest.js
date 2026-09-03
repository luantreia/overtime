import mongoose from 'mongoose';
const { Schema, model } = mongoose;

/**
 * TipoTest - qué mide un equipo cuando evalúa a sus jugadores.
 *
 * El catálogo es POR EQUIPO y no una lista fija del sistema. Cada DT mide cosas distintas
 * según su deporte, su nivel y lo que le importa; una lista cerrada obliga a mantenerla a quien
 * escribió el código en vez de a quien entrena, y termina siendo un desplegable lleno de cosas
 * que nadie usa y sin la que uno necesita.
 */
const tipoTestSchema = new Schema(
  {
    equipo: { type: Schema.Types.ObjectId, ref: 'Equipo', required: true, index: true },

    nombre: { type: String, required: true, trim: true },
    /** 'segundos', 'cm', 'km/h', 'repeticiones'… Texto libre: la unidad es del test, no del sistema. */
    unidad: { type: String, trim: true, default: '' },

    /**
     * Hacia dónde es mejorar. Es el campo que hace que el resto tenga sentido.
     *
     * En un sprint de 10 metros bajar de 2.1 a 1.9 segundos es mejorar; en salto vertical es
     * empeorar. Sin esto, la flecha de progreso apuntaría al revés justamente en los tests de
     * tiempo, que son la mitad de los que se toman — y una métrica que miente en la dirección
     * es peor que no tenerla.
     *
     * 'neutro' es para lo que se registra sin juzgar, como el peso: se guarda la serie, no se
     * dice si subir está bien o mal.
     */
    mejorEs: {
      type: String,
      enum: ['mayor', 'menor', 'neutro'],
      default: 'mayor',
    },

    /** Cuántos decimales mostrar. Un sprint pide 2; una cantidad de repeticiones, 0. */
    decimales: { type: Number, default: 1, min: 0, max: 3 },

    descripcion: { type: String, trim: true, default: '' },

    /**
     * Archivar en vez de borrar: un test que se dejó de tomar tiene resultados históricos que
     * siguen siendo válidos. Borrarlo los dejaría huérfanos.
     */
    activo: { type: Boolean, default: true, index: true },

    creadoPor: { type: String, ref: 'Usuario', required: true },
  },
  { timestamps: true }
);

// Dos tests con el mismo nombre en un equipo serían indistinguibles en cualquier lista.
tipoTestSchema.index({ equipo: 1, nombre: 1 }, { unique: true });

export default model('TipoTest', tipoTestSchema);
