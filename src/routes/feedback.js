import express from 'express';
import Feedback from '../models/Feedback.js';
import verificarToken from '../middleware/authMiddleware.js';

const router = express.Router();

// POST /api/feedback — público, captura token si existe
router.post('/', async (req, res) => {
  const { message, tipo, page, userName } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'El mensaje es requerido' });

  let userUid;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const payload = JSON.parse(Buffer.from(authHeader.split('.')[1], 'base64').toString());
      userUid = payload.uid;
    } catch {}
  }

  await Feedback.create({ message: message.trim(), tipo, page, userUid, userName });
  res.status(201).json({ ok: true });
});

// GET /api/feedback — solo admin autenticado
router.get('/', verificarToken, async (req, res) => {
  const { tipo, page = 1, limit = 25 } = req.query;
  const filter = {};
  if (tipo && tipo !== 'all') filter.tipo = tipo;

  const skip = (Number(page) - 1) * Number(limit);
  const [items, total, counts] = await Promise.all([
    Feedback.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    Feedback.countDocuments(filter),
    Feedback.aggregate([{ $group: { _id: '$tipo', count: { $sum: 1 } } }]),
  ]);

  res.json({
    items,
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)),
    counts: Object.fromEntries(counts.map(c => [c._id, c.count])),
  });
});

// DELETE /api/feedback/:id — solo admin autenticado
router.delete('/:id', verificarToken, async (req, res) => {
  await Feedback.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

export default router;
