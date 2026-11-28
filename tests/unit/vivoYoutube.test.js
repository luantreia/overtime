import { idsDelFeed, vivosDeVideosList, vivoDePaginaLive, leerReferenciaCanal, RX_CANAL_YOUTUBE } from '../../src/services/vivoYoutubeService.js';
import { videosDelFeed, videosDePlaylist } from '../../src/services/videosCanalYoutubeService.js';

const UC = 'UCSJ4gkVC6NrvII8umztf0Ow';

describe('leerReferenciaCanal', () => {
  it.each([
    [UC, { channelId: UC }],
    [`https://www.youtube.com/channel/${UC}`, { channelId: UC }],
    ['@WorldDodgeball', { handle: '@WorldDodgeball' }],
    ['https://youtube.com/@WorldDodgeball/streams', { handle: '@WorldDodgeball' }],
    ['https://www.youtube.com/c/Algo', { url: 'https://www.youtube.com/c/Algo' }],
    ['https://vimeo.com/x', {}],
    ['', {}],
  ])('%s', (entrada, esperado) => expect(leerReferenciaCanal(entrada)).toEqual(esperado));
});

it('idsDelFeed saca los videoId del RSS', () => {
  expect(idsDelFeed('<entry><yt:videoId>AAAAAAAAAAA</yt:videoId></entry><entry><yt:videoId>BBBBBBBBBBB</yt:videoId></entry>')).toEqual(['AAAAAAAAAAA', 'BBBBBBBBBBB']);
});

it('vivosDeVideosList deja sólo lo que está en vivo y se puede embeber', () => {
  const json = {
    items: [
      { id: 'AAAAAAAAAAA', snippet: { liveBroadcastContent: 'live', channelId: UC, title: 'Final', channelTitle: 'WDBF' }, liveStreamingDetails: { actualStartTime: '2026-11-27T10:00:00Z', concurrentViewers: '120' }, status: { embeddable: true } },
      { id: 'BBBBBBBBBBB', snippet: { liveBroadcastContent: 'live', channelId: UC }, status: { embeddable: false } },
      { id: 'CCCCCCCCCCC', snippet: { liveBroadcastContent: 'none', channelId: UC }, status: {} },
      { id: 'DDDDDDDDDDD', snippet: { liveBroadcastContent: 'live', channelId: UC, title: 'Cancha 2' }, status: {} },
    ],
  };
  const r = vivosDeVideosList(json);
  expect(r.map((v) => v.videoId)).toEqual(['AAAAAAAAAAA', 'DDDDDDDDDDD']);
  expect(r[0]).toMatchObject({ titulo: 'Final', canalYoutube: 'WDBF', espectadores: 120 });
});

it('vivoDePaginaLive ignora marcas de vivo fuera del video principal', () => {
  expect(vivoDePaginaLive('"videoDetails":{"videoId":"AAAAAAAAAAA","title":"x"} ... "isLive":true', UC)).toBeNull();
});

it('vivoDePaginaLive lee el vivo de la página /live, o null si no hay', () => {
  const html = '..."videoDetails":{"videoId":"AAAAAAAAAAA","title":"Final \\"A\\"","lengthSeconds":"0","author":"WDBF","isLive":true}...';
  expect(vivoDePaginaLive(html, UC)).toMatchObject({ videoId: 'AAAAAAAAAAA', titulo: 'Final "A"', canalYoutube: 'WDBF' });
  expect(vivoDePaginaLive(html.replace('"isLive":true', '"isLive":false'), UC)).toBeNull();
});

describe('RX_CANAL_YOUTUBE', () => {
  it('acepta ids reales y rechaza el resto', () => {
    expect(RX_CANAL_YOUTUBE.test(UC)).toBe(true);
    expect(RX_CANAL_YOUTUBE.test('UCK8sQmJBp8GCxrOtXWBpyEA')).toBe(true);
    expect(RX_CANAL_YOUTUBE.test('UCxxx')).toBe(false);
  });
});

describe('videos de un canal', () => {
  it('videosDelFeed lee id, título (desescapado) y fecha', () => {
    const xml = '<feed><entry><yt:videoId>AAAAAAAAAAA</yt:videoId><title>USA &amp; Canada</title><published>2026-01-01T00:00:00+00:00</published></entry></feed>';
    expect(videosDelFeed(xml)).toEqual([{ youtubeId: 'AAAAAAAAAAA', titulo: 'USA & Canada', publicado: '2026-01-01T00:00:00+00:00' }]);
  });
  it('videosDePlaylist saltea privados y borrados', () => {
    const json = { items: [
      { snippet: { title: 'Final', resourceId: { videoId: 'AAAAAAAAAAA' } }, contentDetails: { videoPublishedAt: 'x' } },
      { snippet: { title: 'Private video', resourceId: { videoId: 'BBBBBBBBBBB' } } },
    ] };
    expect(videosDePlaylist(json).map((v) => v.youtubeId)).toEqual(['AAAAAAAAAAA']);
  });
});
