import Partido from '../models/Partido/Partido.js';
import EquipoPartido from '../models/Equipo/EquipoPartido.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuditoriaService } from './auditoriaService.js';
import logger from '../utils/logger.js';
import { getPaginationParams } from '../utils/pagination.js';

export class PartidoService {
  
  static async crearPartido(data, usuarioId) {
    const { participacionFaseLocal, participacionFaseVisitante } = data;
    
    const partidoData = {
      ...data,
      creadoPor: usuarioId,
    };

    // Resolver equipoLocal y equipoVisitante si no vienen
    if (participacionFaseLocal) {
      const ParticipacionFase = (await import('../models/Equipo/ParticipacionFase.js')).default;
      const pfLocal = await ParticipacionFase.findById(participacionFaseLocal).populate({
        path: 'participacionTemporada',
        populate: 'equipo',
      });
      partidoData.equipoLocal = pfLocal?.participacionTemporada?.equipo?._id;
    }

    if (participacionFaseVisitante) {
      const ParticipacionFase = (await import('../models/Equipo/ParticipacionFase.js')).default;
      const pfVisitante = await ParticipacionFase.findById(participacionFaseVisitante).populate({
        path: 'participacionTemporada',
        populate: 'equipo',
      });
      partidoData.equipoVisitante = pfVisitante?.participacionTemporada?.equipo?._id;
    }

    // --- Completar competencia desde fase ---
    if (!partidoData.competencia && partidoData.fase) {
      const Fase = (await import('../models/Competencia/Fase.js')).default;
      const fase = await Fase.findById(partidoData.fase)
        .populate({
          path: 'temporada',
          populate: { path: 'competencia' }
        });

      if (fase?.temporada?.competencia?._id) {
        partidoData.competencia = fase.temporada.competencia._id;
      }
    }

    // --- Completar modalidad y categoría desde competencia ---
    if (partidoData.competencia && (!partidoData.modalidad || !partidoData.categoria)) {
      const Competencia = (await import('../models/Competencia/Competencia.js')).default;
      const comp = await Competencia.findById(partidoData.competencia);
      if (comp) {
        if (!partidoData.modalidad) partidoData.modalidad = comp.modalidad;
        if (!partidoData.categoria) partidoData.categoria = comp.categoria;
      }
    }

    logger.info('Datos para crear partido:', partidoData);
    
    const nuevoPartido = new Partido(partidoData);
    await nuevoPartido.save();

    // Crear equipo local
    await EquipoPartido.create({
      partido: nuevoPartido._id,
      equipo: nuevoPartido.equipoLocal,
      participacionFase: nuevoPartido.participacionFaseLocal,
      esLocal: true,
      creadoPor: usuarioId,
    });

    // Crear equipo visitante
    await EquipoPartido.create({
      partido: nuevoPartido._id,
      equipo: nuevoPartido.equipoVisitante,
      participacionFase: nuevoPartido.participacionFaseVisitante,
      esLocal: false,
      creadoPor: usuarioId,
    });

    // Después de crear EquipoPartido local y visitante
    if (nuevoPartido.estado === 'finalizado') {
      await nuevoPartido.recalcularMarcador(); // Opcional, si querés calcular por sets
      await nuevoPartido.save(); // Esto dispara el post('save') y asigna resultado a los equipos
    }

    // Registrar auditoría
    await AuditoriaService.registrar(
      usuarioId,
      'Partido',
      nuevoPartido._id,
      'CREATE',
      { before: null, after: nuevoPartido },
      { ip: 'unknown', get: () => 'unknown' }
    );

    logger.info('Partido creado', { partidoId: nuevoPartido._id, userId: usuarioId });
    return nuevoPartido;
  }

  static async obtenerPartidosConFiltros(query, usuarioId, rol) {
    const { fase, competencia, tipo, equipo } = query;
    const filtro = {};

    if (tipo === 'amistoso') {
      filtro.competencia = null;
    } else {
      if (fase) filtro.fase = fase;
      if (competencia) filtro.competencia = competencia;
    }

    if (equipo) {
      filtro.$or = [
        { equipoLocal: equipo },
        { equipoVisitante: equipo }
      ];
    }

    const partidos = await Partido.find(filtro)
      .populate([
        'competencia',
        'fase',
        'equipoLocal',
        'equipoVisitante',
        'participacionFaseLocal',
        'participacionFaseVisitante',
        'creadoPor',
        'administradores'
      ])
      .sort({ fecha: 1 });

    return partidos;
  }

  static async obtenerPartidosAdministrables(usuarioId, rol) {
    let partidos;

    if (rol === 'admin') {
      partidos = await Partido.find({}, 'nombrePartido _id fecha estado equipoLocal equipoVisitante competencia fase creadoPor administradores').lean();
    } else {
      partidos = await Partido.find({
        $or: [
          { creadoPor: usuarioId },
          { administradores: usuarioId }
        ]
      }, 'nombrePartido _id fecha estado equipoLocal equipoVisitante competencia fase creadoPor administradores').lean();
    }

    return partidos;
  }

  static async obtenerPartidoConDetalles(partidoId) {
    const partido = await Partido.findById(partidoId)
      .populate([
        'competencia',
        'fase',
        'equipoLocal',
        'equipoVisitante',
        'participacionFaseLocal',
        'participacionFaseVisitante',
        'creadoPor',
        'administradores'
      ]);

    if (!partido) {
      throw new AppError('Partido no encontrado', 404);
    }

    return partido;
  }

  static async actualizarPartido(partidoId, data, usuarioId, rol) {
    const partido = await Partido.findById(partidoId);

    if (!partido) {
      throw new AppError('Partido no encontrado', 404);
    }

    // Validar permisos
    const esCreador = partido.creadoPor?.toString() === usuarioId;
    const esAdminDelPartido = partido.administradores?.some(adminId => adminId.toString() === usuarioId);
    const esAdminGlobal = rol === 'admin';

    if (!esCreador && !esAdminDelPartido && !esAdminGlobal) {
      throw new AppError('No tiene permiso para editar este partido', 403);
    }

    const partidoAnterior = { ...partido.toObject() };

    const camposEditables = [
      'fecha',
      'ubicacion',
      'estado',
      'fase',
      'etapa',
      'participacionFaseLocal',
      'participacionFaseVisitante',
      'marcadorModificadoManualmente',
      'marcadorLocal',
      'marcadorVisitante',
      'modoEstadisticas',
      'modoVisualizacion',
      'grupo',
      'division',
      'nombrePartido',
      // Nuevos campos permitidos a editar
      'modalidad',
      'categoria',
      'competencia',
    ];

    const objectIdCampos = ['fase', 'participacionFaseLocal', 'participacionFaseVisitante', 'competencia'];

    for (const campo of camposEditables) {
      if (Object.prototype.hasOwnProperty.call(data, campo)) {
        if (objectIdCampos.includes(campo)) {
          if (data[campo] && !mongoose.Types.ObjectId.isValid(data[campo])) {
            throw new AppError(`ID inválido para campo ${campo}`, 400);
          }
          partido[campo] = data[campo] || null;
        } else {
          partido[campo] = data[campo];
        }
      }
    }

    await partido.save();

    // Registrar auditoría
    await AuditoriaService.registrar(
      usuarioId,
      'Partido',
      partidoId,
      'UPDATE',
      { before: partidoAnterior, after: partido.toObject() },
      { ip: 'unknown', get: () => 'unknown' }
    );

    logger.info('Partido actualizado', { partidoId, userId: usuarioId });
    return partido;
  }

  static async recalcularMarcador(partidoId, usuarioId, rol) {
    const partido = await Partido.findById(partidoId);

    if (!partido) {
      throw new AppError('Partido no encontrado', 404);
    }

    // Validar permisos
    const esCreador = partido.creadoPor?.toString() === usuarioId;
    const esAdminDelPartido = partido.administradores?.some(adminId => adminId.toString() === usuarioId);
    const esAdminGlobal = rol === 'admin';

    if (!esCreador && !esAdminDelPartido && !esAdminGlobal) {
      throw new AppError('No tiene permiso para recalcular el marcador de este partido', 403);
    }

    // Recalcular marcador desde sets
    await partido.recalcularMarcador();
    partido.marcadorModificadoManualmente = false;
    await partido.save();

    // Registrar auditoría
    await AuditoriaService.registrar(
      usuarioId,
      'Partido',
      partidoId,
      'UPDATE',
      { 
        before: { marcadorLocal: partido.marcadorLocal, marcadorVisitante: partido.marcadorVisitante },
        after: { marcadorLocal: partido.marcadorLocal, marcadorVisitante: partido.marcadorVisitante }
      },
      { ip: 'unknown', get: () => 'unknown' }
    );

    logger.info('Marcador recalculado', { partidoId, userId: usuarioId });
    return partido;
  }

  static async eliminarPartido(partidoId, usuarioId, rol) {
    const partido = await Partido.findById(partidoId);

    if (!partido) {
      throw new AppError('Partido no encontrado', 404);
    }

    // Validar permisos
    if (
      partido.creadoPor !== usuarioId &&
      !partido.administradores.includes(usuarioId) &&
      rol !== 'admin'
    ) {
      throw new AppError('No tiene permiso para eliminar este partido', 403);
    }

    await partido.deleteOne();

    // Registrar auditoría
    await AuditoriaService.registrar(
      usuarioId,
      'Partido',
      partidoId,
      'DELETE',
      { before: partido.toObject(), after: null },
      { ip: 'unknown', get: () => 'unknown' }
    );

    logger.info('Partido eliminado', { partidoId, userId: usuarioId });
    return { message: 'Partido eliminado correctamente' };
  }

  static async obtenerPartidosPaginados(req) {
    const { page, limit, skip } = getPaginationParams(req);
    
    const total = await Partido.countDocuments();
    const partidos = await Partido.find()
      .skip(skip)
      .limit(limit)
      .populate([
        'competencia',
        'fase',
        'equipoLocal',
        'equipoVisitante'
      ])
      .lean();

    return {
      data: partidos,
      pagination: {
        total,
        page: Math.floor(skip / limit) + 1,
        pages: Math.ceil(total / limit),
        hasNextPage: skip + limit < total,
      },
    };
  }
}