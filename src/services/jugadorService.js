import Jugador from '../models/Jugador/Jugador.js';
import Usuario from '../models/Usuario.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuditoriaService } from './auditoriaService.js';
import logger from '../utils/logger.js';
import { getPaginationParams } from '../utils/pagination.js';

export class JugadorService {
  
  static async crearJugador(data, usuarioId) {
    const { nombre, alias, fechaNacimiento, genero, foto } = data;
    
    if (!nombre || !fechaNacimiento) {
      throw new AppError('Nombre y fechaNacimiento son obligatorios', 400);
    }

    // Validar que no exista jugador con mismo nombre y fecha de nacimiento
    const existe = await Jugador.findOne({
      nombre: nombre.trim(),
      fechaNacimiento
    });

    if (existe) {
      throw new AppError('Ya existe un jugador con este nombre y fecha de nacimiento', 400);
    }

    const jugador = new Jugador({
      nombre: nombre.trim(),
      alias,
      fechaNacimiento,
      genero,
      foto,
      creadoPor: usuarioId,
      administradores: [usuarioId]
    });

    await jugador.save();
    
    // Registrar auditoría
    await AuditoriaService.registrar(
      usuarioId,
      'Jugador',
      jugador._id,
      'CREATE',
      { before: null, after: jugador },
      { ip: 'unknown', get: () => 'unknown' }
    );

    logger.info('Jugador creado', { jugadorId: jugador._id, userId: usuarioId });
    return jugador;
  }

  static async obtenerJugadorConDetalles(jugadorId) {
    const jugador = await Jugador.findById(jugadorId)
      .populate('administradores', 'email nombre')
      .lean();

    if (!jugador) {
      throw new AppError('Jugador no encontrado', 404);
    }

    return jugador;
  }

  static async obtenerJugadoresAdministrables(usuarioId, rol) {
    let jugadores;
    
    if (rol === 'admin') {
      jugadores = await Jugador.find({}, 'nombre _id fechaNacimiento genero nacionalidad createdAt updatedAt').lean();
    } else {
      jugadores = await Jugador.find({
        $or: [
          { creadoPor: usuarioId },
          { administradores: usuarioId }
        ]
      }, 'nombre _id fechaNacimiento genero nacionalidad createdAt updatedAt').lean();
    }

    return jugadores;
  }

  static async obtenerJugadoresPaginados(req) {
    const { page, limit, skip } = getPaginationParams(req);
    
    const total = await Jugador.countDocuments();
    const jugadores = await Jugador.find()
      .skip(skip)
      .limit(limit)
      .lean();

    return {
      data: jugadores,
      pagination: {
        total,
        page: Math.floor(skip / limit) + 1,
        pages: Math.ceil(total / limit),
        hasNextPage: skip + limit < total,
      },
    };
  }

  static async actualizarJugador(jugadorId, data, usuarioId, rol) {
    const jugador = await Jugador.findById(jugadorId);

    if (!jugador) {
      throw new AppError('Jugador no encontrado', 404);
    }

    // Validar permisos
    const esAdmin = 
      jugador.creadoPor?.toString() === usuarioId || 
      jugador.administradores?.some(a => a.toString() === usuarioId) ||
      rol === 'admin';

    if (!esAdmin) {
      throw new AppError('No tienes permisos para actualizar este jugador', 403);
    }

    // Validar que no exista otro jugador con el mismo nombre y fecha de nacimiento
    if (data.nombre || data.fechaNacimiento) {
      const nombreBusqueda = data.nombre?.trim() || jugador.nombre;
      const fechaBusqueda = data.fechaNacimiento || jugador.fechaNacimiento;
      
      const jugadorExistente = await Jugador.findOne({ 
        nombre: nombreBusqueda,
        fechaNacimiento: fechaBusqueda,
        _id: { $ne: jugadorId } 
      });

      if (jugadorExistente) {
        throw new AppError('Ya existe otro jugador con este nombre y fecha de nacimiento', 400);
      }
    }

    const jugadorAnterior = { ...jugador.toObject() };
    
    // Actualizar campos permitidos
    if (data.nombre) jugador.nombre = data.nombre.trim();
    if (data.alias !== undefined) jugador.alias = data.alias;
    if (data.fechaNacimiento) jugador.fechaNacimiento = data.fechaNacimiento;
    if (data.genero) jugador.genero = data.genero;
    if (data.foto !== undefined) jugador.foto = data.foto;
    if (data.nacionalidad !== undefined) jugador.nacionalidad = data.nacionalidad;
    if (data.administradores && Array.isArray(data.administradores)) {
      jugador.administradores = data.administradores;
    }

    await jugador.save();

    // Registrar auditoría
    await AuditoriaService.registrar(
      usuarioId,
      'Jugador',
      jugadorId,
      'UPDATE',
      { before: jugadorAnterior, after: jugador.toObject() },
      { ip: 'unknown', get: () => 'unknown' }
    );

    logger.info('Jugador actualizado', { jugadorId, userId: usuarioId });
    return jugador;
  }

  static async agregarAdministrador(jugadorId, adminUid, email, usuarioId, rol) {
    const jugador = await Jugador.findById(jugadorId);

    if (!jugador) {
      throw new AppError('Jugador no encontrado', 404);
    }

    let usuarioAdminId = adminUid;

    // Si mandan un email, buscamos el UID correspondiente
    if (email && !adminUid) {
      const usuario = await Usuario.findOne({ email });
      if (!usuario) throw new AppError('Usuario no encontrado', 404);
      usuarioAdminId = usuario._id.toString();
    }

    if (!usuarioAdminId) {
      throw new AppError('Se requiere adminUid o email', 400);
    }

    // Validar permisos
    const esAdmin =
      jugador.creadoPor?.toString() === usuarioId ||
      (jugador.administradores || []).some((a) => a.toString() === usuarioId) ||
      rol === 'admin';

    if (!esAdmin) {
      throw new AppError('No autorizado para modificar administradores', 403);
    }

    // Agregar administrador si no existe
    if (!jugador.administradores.includes(usuarioAdminId)) {
      jugador.administradores.push(usuarioAdminId);
      await jugador.save();
      
      // Registrar auditoría
      await AuditoriaService.registrar(
        usuarioId,
        'Jugador',
        jugadorId,
        'UPDATE',
        { 
          before: { administradores: jugador.administradores.filter(id => id !== usuarioAdminId) },
          after: { administradores: jugador.administradores }
        },
        { ip: 'unknown', get: () => 'unknown' }
      );

      logger.info('Administrador agregado a jugador', { jugadorId, adminId: usuarioAdminId, userId: usuarioId });
    }

    await jugador.populate('administradores', 'email nombre');
    return jugador.administradores;
  }

  static async quitarAdministrador(jugadorId, adminId, usuarioId) {
    const jugador = await Jugador.findById(jugadorId);

    if (!jugador) {
      throw new AppError('Jugador no encontrado', 404);
    }

    // Validar que el administrador existe
    const admin = await Usuario.findById(adminId);
    if (!admin) {
      throw new AppError('El administrador no existe', 404);
    }

    // Verificar que el administrador está en la lista
    if (!jugador.administradores.includes(adminId)) {
      throw new AppError('El usuario no es administrador de este jugador', 400);
    }

    // Verificar que no se está quitando al último administrador
    if (jugador.administradores.length === 1) {
      throw new AppError('No se puede quitar al único administrador', 400);
    }

    // Validar permisos (solo el mismo admin o el creador puede quitar admins)
    const esCreador = jugador.creadoPor?.toString() === usuarioId;
    const esMismoAdmin = adminId === usuarioId;
    
    if (!esCreador && !esMismoAdmin) {
      throw new AppError('No tienes permisos para quitar este administrador', 403);
    }

    // Quitar el administrador
    const administradoresAnteriores = [...jugador.administradores];
    jugador.administradores = jugador.administradores.filter(id => id.toString() !== adminId);
    await jugador.save();

    // Registrar auditoría
    await AuditoriaService.registrar(
      usuarioId,
      'Jugador',
      jugadorId,
      'UPDATE',
      { 
        before: { administradores: administradoresAnteriores },
        after: { administradores: jugador.administradores }
      },
      { ip: 'unknown', get: () => 'unknown' }
    );

    logger.info('Administrador quitado de jugador', { jugadorId, adminId, userId: usuarioId });
    return jugador.administradores;
  }

  static async eliminarJugador(jugadorId, usuarioId, rol) {
    const jugador = await Jugador.findById(jugadorId);

    if (!jugador) {
      throw new AppError('Jugador no encontrado', 404);
    }

    // Validar permisos
    const esAdmin = 
      jugador.creadoPor?.toString() === usuarioId || 
      jugador.administradores?.some(a => a.toString() === usuarioId) ||
      rol === 'admin';

    if (!esAdmin) {
      throw new AppError('No tienes permisos para eliminar este jugador', 403);
    }

    // TODO: Verificar que no tenga relaciones activas antes de eliminar
    // Por ahora, eliminamos directamente

    await jugador.deleteOne();

    // Registrar auditoría
    await AuditoriaService.registrar(
      usuarioId,
      'Jugador',
      jugadorId,
      'DELETE',
      { before: jugador.toObject(), after: null },
      { ip: 'unknown', get: () => 'unknown' }
    );

    logger.info('Jugador eliminado', { jugadorId, userId: usuarioId });
    return { message: 'Jugador eliminado correctamente' };
  }
}