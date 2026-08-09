import { createSign } from 'node:crypto'

function base64url(input: string | Buffer) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// kid = app_id per Enable Banking's per-request JWT model; iat backdated 60s
// to tolerate clock skew, exp +1h (well under their token lifetime limits).
export function createJwt(appId: string, privateKeyPem: string): string {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT', kid: appId }
  const payload = {
    iss: 'enablebanking.com',
    aud: 'api.enablebanking.com',
    iat: now - 60,
    exp: now + 3600,
  }

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`
  const signature = createSign('RSA-SHA256').update(signingInput).sign(privateKeyPem)
  return `${signingInput}.${base64url(signature)}`
}
