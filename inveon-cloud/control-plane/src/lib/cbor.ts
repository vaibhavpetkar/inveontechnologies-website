/**
 * A small CBOR (RFC 8949) decoder: enough for WebAuthn attestation objects
 * and COSE keys. Definite lengths only (WebAuthn's CTAP2 canonical form has
 * no indefinite ones), no tags, no floats. Maps decode to Map, so integer
 * keys (COSE uses -1, -2, …) stay integers. Every length is checked against
 * the bytes left, so a hostile input can't make it allocate or loop.
 */

export type CborValue = number | bigint | string | boolean | null | undefined | Buffer | CborValue[] | Map<CborValue, CborValue>;

export class CborError extends Error {}

const MAX_DEPTH = 16;

export function decodeCbor(input: Buffer): CborValue {
  const { value, offset } = decodeCborPrefix(input, 0);
  if (offset !== input.length) throw new CborError("Trailing bytes after the CBOR item");
  return value;
}

/** Decodes one item starting at `start`; returns it and where the next byte is (authenticator data has a COSE key followed by more data). */
export function decodeCborPrefix(input: Buffer, start: number): { value: CborValue; offset: number } {
  let pos = start;

  const need = (n: number) => {
    if (n < 0 || pos + n > input.length) throw new CborError("CBOR item runs past the end of the input");
  };

  const readLength = (info: number): number | bigint => {
    if (info < 24) return info;
    if (info === 24) {
      need(1);
      return input[pos++];
    }
    if (info === 25) {
      need(2);
      const v = input.readUInt16BE(pos);
      pos += 2;
      return v;
    }
    if (info === 26) {
      need(4);
      const v = input.readUInt32BE(pos);
      pos += 4;
      return v;
    }
    if (info === 27) {
      need(8);
      const v = input.readBigUInt64BE(pos);
      pos += 8;
      return v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v;
    }
    throw new CborError("Indefinite lengths and reserved values are not supported");
  };

  const count = (info: number) => {
    const n = readLength(info);
    if (typeof n === "bigint") throw new CborError("CBOR length too large");
    return n;
  };

  const item = (depth: number): CborValue => {
    if (depth > MAX_DEPTH) throw new CborError("CBOR nested too deeply");
    need(1);
    const initial = input[pos++];
    const major = initial >> 5;
    const info = initial & 0x1f;
    switch (major) {
      case 0:
        return readLength(info);
      case 1: {
        const n = readLength(info);
        return typeof n === "bigint" ? -1n - n : -1 - n;
      }
      case 2: {
        const n = count(info);
        need(n);
        const out = Buffer.from(input.subarray(pos, pos + n));
        pos += n;
        return out;
      }
      case 3: {
        const n = count(info);
        need(n);
        const out = input.toString("utf8", pos, pos + n);
        pos += n;
        return out;
      }
      case 4: {
        const n = count(info);
        // Each element takes at least one byte.
        need(n);
        const out: CborValue[] = [];
        for (let i = 0; i < n; i++) out.push(item(depth + 1));
        return out;
      }
      case 5: {
        const n = count(info);
        need(n * 2);
        const out = new Map<CborValue, CborValue>();
        for (let i = 0; i < n; i++) {
          const k = item(depth + 1);
          if (k instanceof Map || Array.isArray(k) || Buffer.isBuffer(k)) throw new CborError("Unsupported CBOR map key");
          if (out.has(k)) throw new CborError("Duplicate CBOR map key");
          out.set(k, item(depth + 1));
        }
        return out;
      }
      case 7:
        if (info === 20) return false;
        if (info === 21) return true;
        if (info === 22) return null;
        if (info === 23) return undefined;
        throw new CborError("Unsupported CBOR simple value or float");
      default:
        throw new CborError("CBOR tags are not supported");
    }
  };

  const value = item(0);
  return { value, offset: pos };
}
