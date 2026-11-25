import { baseUrlApp } from '../../src/services/mailService.js';

describe('baseUrlApp: a qué app vuelven los links de los mails', () => {
  const previo = process.env.CLIENT_ORIGIN;
  beforeEach(() => { process.env.CLIENT_ORIGIN = 'https://overtime-dt.vercel.app,https://otra.app'; });
  afterAll(() => { process.env.CLIENT_ORIGIN = previo; });

  test('usa la app que hizo el pedido si está en la allowlist', () => {
    expect(baseUrlApp('https://overtime-manager.vercel.app')).toBe('https://overtime-manager.vercel.app');
    expect(baseUrlApp('http://localhost:3004/')).toBe('http://localhost:3004');
  });

  test('un origen ajeno no puede desviar el link', () => {
    expect(baseUrlApp('https://evil.com')).toBe('https://overtime-dt.vercel.app');
  });

  test('el backend no es destino válido y sin origen cae en CLIENT_ORIGIN', () => {
    expect(baseUrlApp('https://overtime-ddyl.onrender.com')).toBe('https://overtime-dt.vercel.app');
    expect(baseUrlApp(undefined)).toBe('https://overtime-dt.vercel.app');
  });
});
