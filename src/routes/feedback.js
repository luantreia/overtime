import express from 'express';
import Feedback from '../models/Feedback.js';

const router = express.Router();

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

export default router;
