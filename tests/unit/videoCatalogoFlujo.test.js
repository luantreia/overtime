import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Partido from '../../src/models/Partido/Partido.js';
import Video from '../../src/models/Video/Video.js';
import {
  migrarTodoAlCatalogo, fijarVideoPrincipal, reemplazarVideosPartido, agregarCamaras, moverVideo, eliminarVideo, hacerPrincipal,
} from '../../src/services/videoCatalogoService.js';

const A = 'AAAAAAAAAAA', B = 'BBBBBBBBBBB', C = 'CCCCCCCCCCC';
let mongo;
const crudo = (id) => mongoose.connection.collection('partidos').findOne({ _id: id });

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Video.init();
}, 60000);
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => { await mongoose.connection.db.dropDatabase(); await Video.init(); });

// Partido "viejo": se inserta crudo para no pasar por los hooks de save.
const partidoViejo = async (campos) => {
  const _id = new mongoose.Types.ObjectId();
  await mongoose.connection.collection('partidos').insertOne({ _id, videos: [], videoUrl: '', ...campos });
  return _id;
};

test('migra los videos viejos una sola vez', async () => {
  const id = await partidoViejo({ videoUrl: `https://youtu.be/${A}?t=60` });
  expect(await migrarTodoAlCatalogo()).toEqual({ partidos: 1, videos: 1 });
  expect(await migrarTodoAlCatalogo()).toEqual({ partidos: 0, videos: 0 });
  expect(await Video.findOne({ partido: id }).lean()).toMatchObject({ youtubeId: A, inicio: 60, orden: 0 });
});

test('fijar principal, reemplazar, agregar, mover y borrar mantienen la proyección', async () => {
  const id = await partidoViejo({ videoUrl: A, videos: [{ youtubeId: A, etiqueta: 'Principal', tramos: [] }] });

  await fijarVideoPrincipal(id, `https://www.youtube.com/watch?v=${B}&t=10`);
  let p = await crudo(id);
  expect(p.videoUrl).toBe(`https://www.youtube.com/watch?v=${B}&t=10s`);
  expect(p.videos.map((v) => v.youtubeId)).toEqual([B]); // reemplazó a la principal

  await agregarCamaras(id, [{ youtubeId: C, etiqueta: 'Tribuna' }, { youtubeId: B }]);
  p = await crudo(id);
  expect(p.videos.map((v) => v.youtubeId)).toEqual([B, C]);

  const c = await Video.findOne({ partido: id, youtubeId: C });
  await hacerPrincipal(c);
  p = await crudo(id);
  expect(p.videos.map((v) => v.youtubeId)).toEqual([C, B]);
  expect(p.videoUrl).toBe(`https://www.youtube.com/watch?v=${C}`);

  await reemplazarVideosPartido(id, [{ youtubeId: B, etiqueta: 'Cam 1', tramos: [{ cam: [0, 5], d: 2 }] }]);
  p = await crudo(id);
  expect(p.videos).toEqual([expect.objectContaining({ youtubeId: B, etiqueta: 'Cam 1' })]);
  expect(p.videoUrl).toContain('&t=10s'); // B conservó su inicio

  const otro = await partidoViejo({});
  const b = await Video.findOne({ partido: id, youtubeId: B });
  await moverVideo(b, otro);
  expect((await crudo(id)).videos).toEqual([]);
  expect((await crudo(id)).videoUrl).toBe('');
  expect((await crudo(otro)).videos.map((v) => v.youtubeId)).toEqual([B]);

  await eliminarVideo(await Video.findOne({ partido: otro }));
  expect((await crudo(otro)).videos).toEqual([]);
  // El partido vaciado no se vuelve a migrar.
  expect(await migrarTodoAlCatalogo()).toEqual({ partidos: 0, videos: 0 });
});

test('link vacío saca la principal y deja las demás', async () => {
  const id = await partidoViejo({ videoUrl: A, videos: [{ youtubeId: A, tramos: [] }, { youtubeId: B, tramos: [] }] });
  await fijarVideoPrincipal(id, '');
  const p = await crudo(id);
  expect(p.videos.map((v) => v.youtubeId)).toEqual([B]);
  expect(p.videoUrl).toBe(`https://www.youtube.com/watch?v=${B}`);
});
