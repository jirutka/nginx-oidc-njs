/**
 * Low-level AES implementation.
 *
 * This code is based on AES implementation from SJCL library available at
 * https://github.com/bitwiseshiftleft/sjcl/blob/master/core/aes.js.
 * It should be functionally exactly the same, I just converted the code
 * from plain JavaScript into TypeScript, modernized it and replaced plain
 * arrays with typed arrays.
 *
  * @author Jakub Jirutka
  *
 * ---
 * This file contains a low-level implementation of AES, optimized for
 * size and for efficiency on several browsers.  It is based on
 * OpenSSL's aes_core.c, a public-domain implementation by Vincent
 * Rijmen, Antoon Bosselaers and Paulo Barreto.
 *
 * An older version of this implementation is available in the public
 * domain, but this one is (c) Emily Stark, Mike Hamburg, Dan Boneh,
 * Stanford University 2008-2010 and BSD-licensed for liability
 * reasons.
 *
 * @author Emily Stark
 * @author Mike Hamburg
 * @author Dan Boneh
 */

const enum Dir {
  ENCRYPT = 0,
  DECRYPT = 1,
}

type Table = [m0: Uint32Array, m1: Uint32Array, m2: Uint32Array, m3: Uint32Array, sbox: Uint8Array]

/**
 * The expanded S-box and inverse S-box tables.
 *
 * There are two tables: `tables[0]` for encryption and `tables[1]` for decryption.
 * The first 4 sub-tables are the expanded S-box with MixColumns. The last one
 * (`tables[0][4]`) is the S-box itself.
 *
 * They will be computed in `initTables()` during first call of `encrypt` or
 * `decrypt` functions.
 */
const tables = [Array(5) as Table, Array(5) as Table]

export interface BlockCipher {
  /**
   * Encrypts an array of four 32-bit big-endian words (16 bytes).
   */
  encrypt: (data: Uint32Array) => Uint32Array
  /**
   * Decrypts an array of four 32-bit big-endian words (16 bytes).
   */
  decrypt: (data: Uint32Array) => Uint32Array
}

/**
 * Initializes AES with given cipher key.
 *
 * @param cipherKey The key as an array of 4, 6, or 8 32-bit words (16, 24, or 32 bytes).
 */
export default function AES (cipherKey: Uint32Array): BlockCipher {
  const keyLength = cipherKey.length
  if (keyLength !== 4 && keyLength !== 6 && keyLength !== 8) {
    throw RangeError(`Invalid AES key size, expected 4, 6 or 8 words, but got: ${keyLength}`)
  }
  initTables()
  const [encKeys, decKeys] = scheduleRoundKeys(cipherKey)

  return {
    encrypt: (data) => crypt(encKeys, data, Dir.ENCRYPT),
    decrypt: (data) => crypt(decKeys, data, Dir.DECRYPT),
  }
}

/**
 * Expands the S-box tables (if not already initialized).
 */
function initTables (): void {
  if (tables[0][0] != undefined) {
    return  // tables are already initialized
  }

  for (const table of tables) {
    for (let i = 0; i < 4; i++) {
      table[i] = new Uint32Array(256)
    }
    table[4] = new Uint8Array(256)
  }

  const [encTable, decTable] = tables
  const sbox = encTable[4]
  const sboxInv = decTable[4]
  const d = new Uint32Array(256)
  const th = new Uint32Array(256)

  // Compute double and third tables.
  for (let i = 0; i < 256; i++) {
    th[(d[i] = i << 1 ^ (i >> 7) * 283) ^ i] = i
  }

  for (let x = 0, xInv = 0, x2; !sbox[x]; x ^= x2 || 1, xInv = th[xInv] || 1) {
    // Compute S-box.
    let s = xInv ^ xInv << 1 ^ xInv << 2 ^ xInv << 3 ^ xInv << 4
    s = s >> 8 ^ s & 255 ^ 99
    sbox[x] = s
    sboxInv[s] = x

    // Compute MixColumns.
    x2 = d[x]
    const x4 = d[x2]
    const x8 = d[x4]
    let tDec = x8 * 0x1010101 ^ x4 * 0x10001 ^ x2 * 0x101 ^ x * 0x1010100
    let tEnc = d[s] * 0x101 ^ s * 0x1010100

    for (let i = 0; i < 4; i++) {
      encTable[i][x] = tEnc = tEnc << 24 ^ tEnc >>> 8
      decTable[i][s] = tDec = tDec << 24 ^ tDec >>> 8
    }
  }
}

/**
 * Schedules out AES round keys for both encryption and decryption.
 *
 * @param cipherKey The cipher key as an array of 4, 6 or 8 words.
 * @return A tuple of encryption and decryption round keys.
 */
function scheduleRoundKeys (cipherKey: Uint32Array): [enc: Uint32Array, dec: Uint32Array] {
  const [encTable, decTable] = tables
  const sbox = encTable[4]
  const keyLen = cipherKey.length
  const size = 4 * keyLen + 28

  // Schedule encryption keys.
  const encKeys = new Uint32Array(size); encKeys.set(cipherKey)
  for (let i = keyLen, rcon = 1; i < size; i++) {
    let tmp = encKeys[i - 1]

    // Apply sbox.
    if (i % keyLen === 0 || (keyLen === 8 && i % keyLen === 4)) {
      tmp = sbox[tmp >>> 24      ] << 24 ^
            sbox[tmp >> 16  & 255] << 16 ^
            sbox[tmp >> 8   & 255] <<  8 ^
            sbox[tmp        & 255]

      // Shift rows and add rcon.
      if (i % keyLen === 0) {
        tmp = tmp << 8 ^ tmp >>> 24 ^ rcon << 24
        rcon = rcon << 1 ^ (rcon >> 7) * 283
      }
    }
    encKeys[i] = encKeys[i - keyLen] ^ tmp
  }

  // Schedule decryption keys.
  const decKeys = new Uint32Array(size)
  for (let j = 0, i = size; i > 0; j++, i--) {
    const tmp = encKeys[j & 3 ? i : i - 4]
    if (i <= 4 || j < 4) {
      decKeys[j] = tmp
    } else {
      decKeys[j] = decTable[0][sbox[tmp >>> 24      ]] ^
                   decTable[1][sbox[tmp >> 16  & 255]] ^
                   decTable[2][sbox[tmp >> 8   & 255]] ^
                   decTable[3][sbox[tmp        & 255]]
    }
  }
  return [encKeys, decKeys]
}

/**
 * Encryption and decryption core.
 *
 * @param key Round keys for encryption or decryption.
 * @param input Four 32-bit words to be encrypted or decrypted.
 * @param dir The direction, `0` for encrypt and `1` for decrypt.
 * @return The four 32-bit encrypted or decrypted words.
 */
function crypt (key: Uint32Array, input: Uint32Array, dir: Dir): Uint32Array {
  if (input.length !== 4) {
    throw RangeError(`Invalid AES block size, expected 4 words, but got: ${input.length}`)
  }
  // Load up the tables.
  const [m0, m1, m2, m3, sbox] = tables[dir]

  const nInnerRounds = key.length / 4 - 2

  // State variables a, b, c, d are loaded with pre-whitened data.
  let a = input[0]           ^ key[0]
  let b = input[dir ? 3 : 1] ^ key[1]
  let c = input[2]           ^ key[2]
  let d = input[dir ? 1 : 3] ^ key[3]
  let a2 = 0
  let b2 = 0
  let c2 = 0
  let kIndex = 4

  // Inner rounds. Cribbed from OpenSSL.
  for (let i = 0; i < nInnerRounds; i++) {
    a2 = m0[a >>> 24] ^ m1[b >> 16 & 255] ^ m2[c >> 8 & 255] ^ m3[d & 255] ^ key[kIndex]
    b2 = m0[b >>> 24] ^ m1[c >> 16 & 255] ^ m2[d >> 8 & 255] ^ m3[a & 255] ^ key[kIndex + 1]
    c2 = m0[c >>> 24] ^ m1[d >> 16 & 255] ^ m2[a >> 8 & 255] ^ m3[b & 255] ^ key[kIndex + 2]
    d  = m0[d >>> 24] ^ m1[a >> 16 & 255] ^ m2[b >> 8 & 255] ^ m3[c & 255] ^ key[kIndex + 3]
    kIndex += 4
    a = a2; b = b2; c = c2
  }

  // Last round.
  const out = new Uint32Array(4)
  for (let i = 0; i < 4; i++) {
    out[dir ? 3 & -i : i] =
      sbox[a >>> 24      ] << 24 ^
      sbox[b >>  16 & 255] << 16 ^
      sbox[c >>   8 & 255] <<  8 ^
      sbox[d        & 255]       ^
      key[kIndex++]
    a2 = a; a = b; b = c; c = d; d = a2
  }
  return out
}
