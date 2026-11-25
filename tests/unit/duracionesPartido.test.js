import { videosConDuracion, idsSinDuracion } from '../../src/services/duracionesPartidoService.js';

describe('videosConDuracion', () => {
  const dur = new Map([['AAAAAAAAAAA', 3000]]);
  it('un partido sólo con videoUrl pasa a tener la cámara principal con su duración', () => {
    const r = videosConDuracion({ videoUrl: 'https://youtu.be/AAAAAAAAAAA', videos: [] }, dur);
    expect(r).toMatchObject({ nuevo: true, cambio: true, faltan: [] });
    expect(r.videos).toEqual([{ youtubeId: 'AAAAAAAAAAA', etiqueta: 'Cámara principal', duracion: 3000, tramos: [] }]);
  });
  it('no pisa una duración ya cargada', () => {
    const r = videosConDuracion({ videoUrl: 'x', videos: [{ youtubeId: 'AAAAAAAAAAA', duracion: 10, tramos: [] }] }, dur);
    expect(r.cambio).toBe(false);
    expect(r.videos[0].duracion).toBe(10);
  });
  it('lo que YouTube no devolvió queda en faltan', () => {
    const p = { videoUrl: 'x', videos: [{ youtubeId: 'AAAAAAAAAAA', duracion: null }, { youtubeId: 'BBBBBBBBBBB', duracion: null }] };
    expect(idsSinDuracion(p)).toEqual(['AAAAAAAAAAA', 'BBBBBBBBBBB']);
    expect(videosConDuracion(p, dur)).toMatchObject({ cambio: true, faltan: ['BBBBBBBBBBB'] });
  });
  it('un link que no es de YouTube no inventa cámaras', () => {
    expect(videosConDuracion({ videoUrl: 'https://vimeo.com/1', videos: [] }, dur)).toMatchObject({ videos: [], cambio: false });
  });
});
