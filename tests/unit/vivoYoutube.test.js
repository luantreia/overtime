import { idsDelFeed, vivosDeVideosList, vivoDePaginaLive, leerReferenciaCanal } from '../../src/services/vivoYoutubeService.js';

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
