import { createHash, randomBytes } from 'crypto';

const md5 = (s: string) => createHash('md5').update(s).digest('hex');

/** Builds an HTTP Digest `Authorization` header (RFC 2617/7616, MD5) from the camera's `WWW-Authenticate` challenge. */
export function digestAuthHeader(
  challenge: string,
  user: string,
  pass: string,
  method: string,
  uri: string,
  cnonce: string = randomBytes(8).toString('hex')
): string {
  const get = (k: string) => challenge.match(new RegExp(`${k}="?([^",]+)"?`, 'i'))?.[1];
  const realm = get('realm') ?? '';
  const nonce = get('nonce') ?? '';
  const opaque = get('opaque');
  const qop = /qop="?[^"]*\bauth\b/i.test(challenge) ? 'auth' : undefined;
  const nc = '00000001';
  const ha1 = md5(`${user}:${realm}:${pass}`);
  const ha2 = md5(`${method}:${uri}`);
  const response = qop ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`) : md5(`${ha1}:${nonce}:${ha2}`);
  let h = `Digest username="${user}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;
  if (qop) h += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
  if (opaque) h += `, opaque="${opaque}"`;
  return h;
}