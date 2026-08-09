import { safeStorage } from 'electron'
import crypto from 'node:crypto'
import { getSecret, setSecret, deleteSecret } from '../../db'
import type { EnableBankingCredentials } from './types'

const SECRET_KEY = 'enablebanking:credentials'

export class CredentialsError extends Error {}

function assertEncryptionAvailable() {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new CredentialsError(
      'Secure storage is not available on this system — cannot store bank credentials safely.'
    )
  }
}

// Validates the key is a real RSA private key before it's ever sent to the
// API, so setup fails fast with a clear message instead of a cryptic 401
// the first time a JWT gets signed.
export function storeCredentials(appId: string, privateKeyPem: string) {
  assertEncryptionAvailable()

  const trimmedAppId = appId.trim()
  if (!trimmedAppId) {
    throw new CredentialsError('Application ID is required.')
  }

  try {
    crypto.createPrivateKey(privateKeyPem)
  } catch {
    throw new CredentialsError('Not a valid RSA private key (PEM).')
  }

  const payload: EnableBankingCredentials = { appId: trimmedAppId, privateKeyPem }
  setSecret(SECRET_KEY, safeStorage.encryptString(JSON.stringify(payload)))
}

// Decrypted fresh on every call — the plaintext key is never cached to disk,
// only ever held transiently in memory for the duration of an API call.
export function loadCredentials(): EnableBankingCredentials | null {
  const encrypted = getSecret(SECRET_KEY)
  if (!encrypted) return null

  assertEncryptionAvailable()
  return JSON.parse(safeStorage.decryptString(encrypted)) as EnableBankingCredentials
}

export function hasCredentials(): boolean {
  return getSecret(SECRET_KEY) !== null
}

export function deleteCredentials() {
  deleteSecret(SECRET_KEY)
}
