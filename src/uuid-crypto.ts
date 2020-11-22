import AES from './aes'


/**
 * Encrypts the given `uuid` with `cipherKey` using raw AES and returns it as a base64
 * encoded string.
 *
 * Note: UUID is 16 bytes long, the same as AES block size. OAuth uses UUID v4 which is
 * almost entirely random and should be cryptographically secure (if a proper PRNG is used).
 * Thus we don't have to use any mode of operation (such as GCM) or add randomness to the
 * encrypted text and it should be secure (if I understand it correctly).
 *
 * @param uuid An UUID in standard dash-separated notation.
 * @param cipherKey The cipher key; 16, 24 or 32 ASCII characters.
 * @see decrypt
 */
export function encrypt (uuid: string, cipherKey: string): string {
  const aes = AES(stringToUint32Array(cipherKey, 'utf8'))

  const data = stringToUint32Array(uuidStripDashes(uuid), 'hex')
  return uint32ArrayToString(aes.encrypt(data), 'base64')
}

/**
 * Decrypts the given UUID encrypted by `encrypt()` function with `cipherKey`.
 * If the input cannot be decrypted (e.g. wrong `cipherKey`), `undefined` is returned.
 *
 * @param input A base64 encoded encrypted UUID.
 * @param cipherKey The cipher key; 16, 24 or 32 ASCII characters.
 * @see encrypt
 */
export function decrypt (input: string, cipherKey: string): string | undefined {
  try {
    const aes = AES(stringToUint32Array(cipherKey, 'utf8'))

    const data = aes.decrypt(stringToUint32Array(input, 'base64'))
    return uuidAddDashes(uint32ArrayToString(data, 'hex'))
  } catch (err) {
    return
  }
}

function stringToUint32Array (str: string, encoding: BufferEncoding): Uint32Array {
  return new Uint32Array(Buffer.from(str, encoding).buffer)
}

function uint32ArrayToString (data: Uint32Array, encoding: BufferEncoding): string {
  return Buffer.from(data.buffer).toString(encoding)
}

function uuidStripDashes (uuid: string): string {
  return uuid.slice(0, 8) + uuid.slice(9, 13) + uuid.slice(14, 18) + uuid.slice(19, 23) + uuid.slice(24)
}

function uuidAddDashes (hex: string): string {
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-')
}
