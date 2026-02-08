import express from 'express';
import Lobby from '../../models/Plaza/Lobby.js';
import KarmaLog from '../../models/Plaza/KarmaLog.js';
import Jugador from '../../models/Jugador/Jugador.js';
import verificarToken from '../../middleware/authMiddleware.js';
import { validarObjectId } from '../../middleware/validacionObjectId.js';
import { cargarRolDesdeBD } from '../../middleware/cargarRolDesdeBD.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Plaza
 *   description: Lobbies y partidos callejeros (La Plaza)
 */

/**
 * @swagger
 * /api/plaza/lobbies:
 *   get:
 *     summary: Obtiene los lobbies activos
 *     tags: [Plaza]
 */
router.get('/lobbies', async (req, res) => {
  try {
    const lobbies = await Lobby.find({ status: { $in: ['open', 'full', 'playing'] } })
      .populate('players.player', 'nombre alias foto')
      .sort({ scheduledDate: 1 });
    res.json(lobbies);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener lobbies', error: error.message });
  }
});

/**
 * @swagger
 * /api/plaza/lobbies:
 *   post:
 *     summary: Crea un nuevo lobby
 *     tags: [Plaza]
 */
router.post('/lobbies', verificarToken, async (req, res) => {
  try {
    const { title, description, modalidad, categoria, location, scheduledDate, maxPlayers } = req.body;
    
    const lobby = new Lobby({
      host: req.user.uid,
      title,
      description,
      modalidad,
      categoria,
      location,
      scheduledDate: new Date(scheduledDate),
      maxPlayers: maxPlayers || 12
    });

    await lobby.save();
    res.status(201).json(lobby);
  } catch (error) {
    res.status(400).json({ message: 'Error al crear lobby', error: error.message });
  }
});

/**
 * @swagger
 * /api/plaza/lobbies/{id}:
 *   get:
 *     summary: Obtiene el detalle de un lobby
 *     tags: [Plaza]
 */
router.get('/lobbies/:id', validarObjectId, async (req, res) => {
  try {
    const lobby = await Lobby.findById(req.params.id)
      .populate('players.player', 'nombre alias foto elo');
    
    if (!lobby) return res.status(404).json({ message: 'Lobby no encontrado' });
    res.json(lobby);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener lobby', error: error.message });
  }
});

/**
 * @swagger
 * /api/plaza/lobbies/{id}/join:
 *   post:
 *     summary: Unirse a un bloque
 *     tags: [Plaza]
 */
router.post('/lobbies/:id/join', verificarToken, validarObjectId, async (req, res) => {
  try {
    const lobby = await Lobby.findById(req.params.id);
    if (!lobby) return res.status(404).json({ message: 'Lobby no encontrado' });
    
    if (lobby.status !== 'open') {
      return res.status(400).json({ message: 'Este lobby ya no acepta nuevos jugadores' });
    }

    // Buscar el perfil de jugador del usuario
    const jugador = await Jugador.findOne({ userId: req.user.uid });
    if (!jugador) {
      return res.status(400).json({ message: 'Aún no tienes un perfil de jugador vinculado. Ve a tu perfil para reclamar uno.' });
    }

    // Verificar si ya está unido
    const yaUnido = lobby.players.some(p => p.player.toString() === jugador._id.toString());
    if (yaUnido) {
      return res.status(400).json({ message: 'Ya estás en este lobby' });
    }

    lobby.players.push({
      player: jugador._id,
      userUid: req.user.uid,
      joinedAt: new Date()
    });

    await lobby.save();
    res.json({ message: 'Te has unido al lobby exitosamente', lobby });
  } catch (error) {
    res.status(500).json({ message: 'Error al unirse al lobby', error: error.message });
  }
});

/**
 * @swagger
 * /api/plaza/lobbies/{id}/leave:
 *   post:
 *     summary: Salir de un lobby
 *     tags: [Plaza]
 */
router.post('/lobbies/:id/leave', verificarToken, validarObjectId, async (req, res) => {
  try {
    const lobby = await Lobby.findById(req.params.id);
    if (!lobby) return res.status(404).json({ message: 'Lobby no encontrado' });

    if (lobby.status === 'playing' || lobby.status === 'finished') {
      return res.status(400).json({ message: 'No puedes salir de un partido que ya está en curso o finalizado' });
    }

    const initialLength = lobby.players.length;
    lobby.players = lobby.players.filter(p => p.userUid !== req.user.uid);

    if (lobby.players.length === initialLength) {
      return res.status(400).json({ message: 'No eres parte de este lobby' });
    }

    // Si el host se va y no hay más jugadores, tal vez cancelar?
    // O simplemente dejar que otro sea host? Por ahora solo quitamos.
    if (lobby.host === req.user.uid && lobby.players.length > 0) {
      lobby.host = lobby.players[0].userUid; // Transfer host to next player
    }

    await lobby.save();
    res.json({ message: 'Has salido del lobby', lobby });
  } catch (error) {
    res.status(500).json({ message: 'Error al salir del lobby', error: error.message });
  }
});

/**
 * @swagger
 * /api/plaza/lobbies/{id}/result:
 *   post:
 *     summary: Carga el resultado del partido de plaza
 *     tags: [Plaza]
 */
router.post('/lobbies/:id/result', verificarToken, validarObjectId, async (req, res) => {
  try {
    const { scoreA, scoreB } = req.body;
    const lobby = await Lobby.findById(req.params.id);
    if (!lobby) return res.status(404).json({ message: 'Lobby no encontrado' });

    // Validar que el que sube es el host o está en el lobby
    const isPlayer = lobby.players.some(p => p.userUid === req.user.uid);
    if (lobby.host !== req.user.uid && !isPlayer) {
      return res.status(403).json({ message: 'No tienes permiso para cargar resultados en este lobby' });
    }

    lobby.result = {
      scoreA,
      scoreB,
      submittedBy: req.user.uid,
      confirmedByOpponent: false,
      disputed: false
    };
    
    lobby.status = 'playing'; // Opcional: pasar a estado de validación
    await lobby.save();

    res.json({ message: 'Resultado cargado. Esperando confirmación del rival.', lobby });
  } catch (error) {
    res.status(500).json({ message: 'Error al cargar resultado', error: error.message });
  }
});

/**
 * @swagger
 * /api/plaza/lobbies/{id}/confirm:
 *   post:
 *     summary: Confirma el resultado cargado (Doble Check)
 *     tags: [Plaza]
 */
router.post('/lobbies/:id/confirm', verificarToken, validarObjectId, async (req, res) => {
  try {
    const lobby = await Lobby.findById(req.params.id);
    if (!lobby) return res.status(404).json({ message: 'Lobby no encontrado' });

    if (!lobby.result.submittedBy) {
      return res.status(400).json({ message: 'No hay resultados pendientes de confirmación' });
    }

    if (lobby.result.submittedBy === req.user.uid) {
      return res.status(400).json({ message: 'No puedes confirmar tu propio resultado. Debe hacerlo un jugador del equipo contrario.' });
    }

    // Aquí idealmente validaríamos que el que confirma es del equipo contrario
    // Por ahora, cualquier otro jugador del lobby puede confirmar (Doble Check Social)
    const isPlayer = lobby.players.some(p => p.userUid === req.user.uid);
    if (!isPlayer) {
      return res.status(403).json({ message: 'Solo los participantes del lobby pueden confirmar el resultado' });
    }

    lobby.result.confirmedByOpponent = true;
    lobby.status = 'finished';
    await lobby.save();

    // TODO: Disparar la creación del Partido y el cálculo de ELO (Nivel 1 con 0.3x)
    // Iremos a ranked.js para esto después.

    res.json({ message: 'Resultado verificado exitosamente. El ranking se actualizará pronto.', lobby });
  } catch (error) {
    res.status(500).json({ message: 'Error al confirmar resultado', error: error.message });
  }
});

export default router;
