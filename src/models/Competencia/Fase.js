import mongoose from 'mongoose';

const FaseSchema = new mongoose.Schema({
  
  temporada: { type: mongoose.Schema.Types.ObjectId, ref: 'Temporada', required: true },

  nombre: { type: String, required: true, trim: true },
  tipo: { 
    type: String, 
    enum: ['grupo', 'liga', 'playoff', 'promocion', 'otro'], 
    default: 'otro',
    required: true 
  },
  estado: {
    type: String,
    enum: ['programada', 'en_curso', 'finalizada'],
    default: 'programada'
  },
  orden: { type: Number, required: true, default: 0 },
  descripcion: String,

  fechaInicio: { type: Date },
  fechaFin: { type: Date },

  // CONFIGURACIÓN Y REGLAMENTO DE LA FASE
  configuracion: {
    // Reglas de puntuación (Liga/Grupos)
    puntuacion: {
      victoria: { type: Number, default: 3 },
      empate: { type: Number, default: 1 },
      derrota: { type: Number, default: 0 },
      setGanado: { type: Number, default: 0 }, // Puntos extra por set ganado (opcional)
      perderPorW: { type: Number, default: 0 }, // Puntos si pierde por Walkover
      arbitroPresentado: { type: Number, default: 0 }, // Puntos extra por traer árbitro
      penalizacionNoArbitro: { type: Number, default: 0 }, // Puntos menos por no traer árbitro
    },
    
    // Criterios de desempate en orden de prioridad
    // Ej: ['PUNTOS', 'DIF_SETS', 'SETS_FAVOR', 'CARA_A_CARA']
    criteriosDesempate: [
      {
        type: String,
        enum: ['PUNTOS', 'DIF_SETS', 'SETS_FAVOR', 'PUNTOS_FAVOR', 'DIF_PUNTOS', 'CARA_A_CARA', 'MENOS_TARJETAS'],
      }
    ],

    // Reglas de progresión a siguientes fases
    progresion: {
      clasificanDirecto: { type: Number, default: 0 }, // X primeros pasan
      mejoresAdicionales: {
        cantidad: { type: Number, default: 0 }, // Ej: el mejor 3ro
        posicion: { type: Number }, // De qué posición tomarlos
        criterio: { type: String, enum: ['global', 'por_grupo'] },
      },
      destinoGanadores: { type: mongoose.Schema.Types.ObjectId, ref: 'Fase' },
      destinoPerdedores: { type: mongoose.Schema.Types.ObjectId, ref: 'Fase' }, // Consolation bracket / Copa de Plata
      estrategiaSembrado: { 
        type: String, 
        enum: ['posicion_directa', 'manual', 'aleatorio'], 
        default: 'posicion_directa' 
      }
    },

    // Detalle de Playoff (si aplica)
    playoff: {
      formato: { type: String, enum: ['simple', 'doble_eliminacion'], default: 'simple' },
      idaYVuelta: { type: Boolean, default: false },
      tercerPuesto: { type: Boolean, default: false },
      rondasConConsolacion: [{ type: String }], // Ej: ['Octavos', 'Cuartos']
    }
  },

  // Solo para tipo 'grupo' (Mantenido por compatibilidad, se puede migrar a configuracion.progresion)
  numeroClasificados: {
    type: Number,
    validate: {
      validator: function (val) {
        return this.tipo !== 'grupo' || (typeof val === 'number' && val >= 0);
      },
      message: 'numeroClasificados es obligatorio y debe ser >= 0 para fases tipo grupo.'
    }
  },


  // Para 'promocion' y 'playoff'
  faseOrigenA: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Fase',
    validate: {
      validator: function (val) {
        return ['promocion', 'playoff'].includes(this.tipo) || !val;
      },
      message: 'faseOrigenA solo debe usarse en fases de promoción o playoff'
    }
  }, 

  faseOrigenB: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Fase',
    validate: {
      validator: function (val) {
        return ['promocion', 'playoff'].includes(this.tipo) || !val;
      },
      message: 'faseOrigenB solo debe usarse en fases de promoción o playoff'
    }
  },

  creadoPor: {
    type: String,
    ref: 'Usuario',
    required: true
  },

  administradores: [
    {
      type: String,
      ref: 'Usuario',
    }
  ]
}, { timestamps: true });

export default mongoose.model('Fase', FaseSchema);