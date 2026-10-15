import { app, safeStorage } from 'electron'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pickSecretSettings, type SecretSettings } from '../preload/contracts'

type SecretCipher = {
  isAvailable(): boolean
  encrypt(text: string): Buffer
  decrypt(data: Buffer): string
}

type SecretFile = {
  version: 1
  /** false when the OS offers no keychain (e.g. Linux without a secret service) */
  encrypted: boolean
  values: Record<string, string>
}

export function encodeSecrets(values: SecretSettings, cipher: SecretCipher): SecretFile {
  const encrypted = cipher.isAvailable()
  return {
    version: 1,
    encrypted,
    values: Object.fromEntries(
      Object.entries(pickSecretSettings(values)).map(([key, value]) => [
        key,
        encrypted ? cipher.encrypt(value).toString('base64') : value
      ])
    )
  }
}

export function decodeSecrets(file: SecretFile, cipher: SecretCipher): SecretSettings {
  return pickSecretSettings(
    Object.fromEntries(
      Object.entries(file.values).map(([key, value]) => [
        key,
        file.encrypted ? cipher.decrypt(Buffer.from(value, 'base64')) : value
      ])
    )
  )
}

const electronCipher: SecretCipher = {
  isAvailable: () => safeStorage.isEncryptionAvailable(),
  encrypt: (text) => safeStorage.encryptString(text),
  decrypt: (data) => safeStorage.decryptString(data)
}

const secretsPath = () => join(app.getPath('userData'), 'secrets.json')
let writes = Promise.resolve()

/** Must run after app ready: safeStorage cannot decrypt before that on Linux. */
export async function loadSecrets(): Promise<SecretSettings> {
  try {
    const file = JSON.parse(await readFile(secretsPath(), 'utf8')) as SecretFile
    return decodeSecrets(file, electronCipher)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('Failed to load stored API keys:', error)
    }
    return {}
  }
}

export function persistSecrets(values: SecretSettings): Promise<void> {
  const content = JSON.stringify(encodeSecrets(values, electronCipher))
  // Serialize writes so a slower earlier save cannot overwrite a newer one.
  const operation = writes.then(async () => {
    const path = secretsPath()
    await writeFile(`${path}.tmp`, content, 'utf8')
    await rename(`${path}.tmp`, path)
  })
  writes = operation.catch(() => undefined)
  return operation
}

export function isSecretStorageEncrypted(): boolean {
  return electronCipher.isAvailable()
}
