import { camarasLegado, urlDe } from '../../src/services/videoCatalogoService.js';

const A = 'AAAAAAAAAAA';
const B = 'BBBBBBBBBBB';

describe('camarasLegado', () => {
  it('un partido sólo con videoUrl da una cámara principal con su t=', () => {
    const r = camarasLegado({ videoUrl: `https://youtu.be/${A}?t=90`, videos: [] });
    expect(r).toEqual([expect.objectContaining({ youtubeId: A, inicio: 90, orden: 0, etiqueta: 'Cámara principal' })]);
  });
  it('la cámara de videoUrl pasa a principal aunque no sea la primera de videos', () => {
    const r = camarasLegado({ videoUrl: `https://www.youtube.com/watch?v=${B}`, videos: [{ youtubeId: A, tramos: [] }, { youtubeId: B, tramos: [{ cam: [0, 10], d: 5 }] }] });
    expect(r.map((v) => [v.youtubeId, v.orden])).toEqual([[B, 0], [A, 1]]);
    expect(r[0].tramos).toEqual([{ cam: [0, 10], d: 5 }]);
  });
  it('videoUrl que no está en videos se suma como principal', () => {
    const r = camarasLegado({ videoUrl: B, videos: [{ youtubeId: A, tramos: [] }] });
    expect(r.map((v) => v.youtubeId)).toEqual([B, A]);
  });
  it('sin videos da vacío y no repite youtubeId', () => {
    expect(camarasLegado({ videoUrl: '', videos: [] })).toEqual([]);
    expect(camarasLegado({ videoUrl: A, videos: [{ youtubeId: A }, { youtubeId: A }] })).toHaveLength(1);
  });
});

describe('urlDe', () => {
  it('arma el link con t= sólo si hay inicio', () => {
    expect(urlDe({ youtubeId: A, inicio: 0 })).toBe(`https://www.youtube.com/watch?v=${A}`);
    expect(urlDe({ youtubeId: A, inicio: 30 })).toBe(`https://www.youtube.com/watch?v=${A}&t=30s`);
    expect(urlDe(null)).toBe('');
  });
});
