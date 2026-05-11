// models/Organizacion/MiembroOrganizacion.js
import mongoose from 'mongoose';

const miembroOrganizacionSchema = new mongoose.Schema({
  organizacion: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Organizacion', 
    required: true 
  },
  usuarioId: { 
    type: String, 
    ref: 'Usuario', 
    required: true 
  },
  rol: { 
    type: String, 
    enum: ['presidente', 'secretario', 'tesorero', 'delegado', 'arbitro', 'coordinador', 'staff'],
    required: true 
  },
  permisos: [{ 
    type: String 
  }], // Permisos extra
  estado: { 
    type: String, 
    enum: ['activo', 'suspendido', 'inactivo'], 
    default: 'activo' 
  },
  notas: { 
    type: String 
  },
  creadoPor: { 
    type: String, 
    ref: 'Usuario', 
    required: true 
  }
}, { 
  timestamps: true 
});

// Índices únicos y compuestos
miembroOrganizacionSchema.index({ organizacion: 1, usuarioId: 1 }, { unique: true });
miembroOrganizacionSchema.index({ organizacion: 1, estado: 1 });
miembroOrganizacionSchema.index({ organizacion: 1, rol: 1 });

export default mongoose.model('MiembroOrganizacion', miembroOrganizacionSchema);
