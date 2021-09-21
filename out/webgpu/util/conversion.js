/**
* AUTO-GENERATED - DO NOT EDIT. Source: https://github.com/gpuweb/cts
**/import { assert } from '../../common/util/util.js';import { clamp } from './math.js';

/**
                                                                                          * Encodes a JS `number` into a "normalized" (unorm/snorm) integer representation with `bits` bits.
                                                                                          * Input must be between -1 and 1 if signed, or 0 and 1 if unsigned.
                                                                                          */
export function floatAsNormalizedInteger(float, bits, signed) {
  if (signed) {
    assert(float >= -1 && float <= 1);
    const max = Math.pow(2, bits - 1) - 1;
    return Math.round(float * max);
  } else {
    assert(float >= 0 && float <= 1);
    const max = Math.pow(2, bits) - 1;
    return Math.round(float * max);
  }
}

/**
   * Decodes a JS `number` from a "normalized" (unorm/snorm) integer representation with `bits` bits.
   * Input must be an integer in the range of the specified unorm/snorm type.
   */
export function normalizedIntegerAsFloat(integer, bits, signed) {
  assert(Number.isInteger(integer));
  if (signed) {
    const max = Math.pow(2, bits - 1) - 1;
    assert(integer >= -max - 1 && integer <= max);
    if (integer === -max - 1) {
      integer = -max;
    }
    return integer / max;
  } else {
    const max = Math.pow(2, bits) - 1;
    assert(integer >= 0 && integer <= max);
    return integer / max;
  }
}

/**
   * Encodes a JS `number` into an IEEE754 floating point number with the specified number of
   * sign, exponent, mantissa bits, and exponent bias.
   * Returns the result as an integer-valued JS `number`.
   *
   * Does not handle clamping, underflow, overflow, or denormalized numbers.
   */
export function float32ToFloatBits(
n,
signBits,
exponentBits,
mantissaBits,
bias)
{
  assert(exponentBits <= 8);
  assert(mantissaBits <= 23);
  assert(Number.isFinite(n));

  if (n === 0) {
    return 0;
  }

  if (signBits === 0) {
    assert(n >= 0);
  }

  const buf = new DataView(new ArrayBuffer(Float32Array.BYTES_PER_ELEMENT));
  buf.setFloat32(0, n, true);
  const bits = buf.getUint32(0, true);
  // bits (32): seeeeeeeefffffffffffffffffffffff

  const mantissaBitsToDiscard = 23 - mantissaBits;

  // 0 or 1
  const sign = bits >> 31 & signBits;

  // >> to remove mantissa, & to remove sign, - 127 to remove bias.
  const exp = (bits >> 23 & 0xff) - 127;

  // Convert to the new biased exponent.
  const newBiasedExp = bias + exp;
  assert(newBiasedExp >= 0 && newBiasedExp < 1 << exponentBits);

  // Mask only the mantissa, and discard the lower bits.
  const newMantissa = (bits & 0x7fffff) >> mantissaBitsToDiscard;
  return sign << exponentBits + mantissaBits | newBiasedExp << mantissaBits | newMantissa;
}

/**
   * Encodes a JS `number` into an IEEE754 16 bit floating point number.
   * Returns the result as an integer-valued JS `number`.
   *
   * Does not handle clamping, underflow, overflow, or denormalized numbers.
   */
export function float32ToFloat16Bits(n) {
  return float32ToFloatBits(n, 1, 5, 10, 15);
}

/**
   * Decodes an IEEE754 16 bit floating point number into a JS `number` and returns.
   */
export function float16BitsToFloat32(float16Bits) {
  const buf = new DataView(new ArrayBuffer(Float32Array.BYTES_PER_ELEMENT));
  // shift exponent and mantissa bits and fill with 0 on right, shift sign bit
  buf.setUint32(0, (float16Bits & 0x7fff) << 13 | (float16Bits & 0x8000) << 16, true);
  // shifting for bias different: f16 uses a bias of 15, f32 uses a bias of 127
  return buf.getFloat32(0, true) * 2 ** (127 - 15);
}

/**
   * Encodes three JS `number` values into RGB9E5, returned as an integer-valued JS `number`.
   *
   * RGB9E5 represents three partial-precision floating-point numbers encoded into a single 32-bit
   * value all sharing the same 5-bit exponent.
   * There is no sign bit, and there is a shared 5-bit biased (15) exponent and a 9-bit
   * mantissa for each channel. The mantissa does NOT have an implicit leading "1.",
   * and instead has an implicit leading "0.".
   */
export function packRGB9E5UFloat(r, g, b) {
  for (const v of [r, g, b]) {
    assert(v >= 0 && v < Math.pow(2, 16));
  }

  const buf = new DataView(new ArrayBuffer(Float32Array.BYTES_PER_ELEMENT));
  const extractMantissaAndExponent = n => {
    const mantissaBits = 9;
    buf.setFloat32(0, n, true);
    const bits = buf.getUint32(0, true);
    // >> to remove mantissa, & to remove sign
    let biasedExponent = bits >> 23 & 0xff;
    const mantissaBitsToDiscard = 23 - mantissaBits;
    let mantissa = (bits & 0x7fffff) >> mantissaBitsToDiscard;

    // RGB9E5UFloat has an implicit leading 0. instead of a leading 1.,
    // so we need to move the 1. into the mantissa and bump the exponent.
    // For float32 encoding, the leading 1 is only present if the biased
    // exponent is non-zero.
    if (biasedExponent !== 0) {
      mantissa = mantissa >> 1 | 0b100000000;
      biasedExponent += 1;
    }
    return { biasedExponent, mantissa };
  };

  const { biasedExponent: rExp, mantissa: rOrigMantissa } = extractMantissaAndExponent(r);
  const { biasedExponent: gExp, mantissa: gOrigMantissa } = extractMantissaAndExponent(g);
  const { biasedExponent: bExp, mantissa: bOrigMantissa } = extractMantissaAndExponent(b);

  // Use the largest exponent, and shift the mantissa accordingly
  const exp = Math.max(rExp, gExp, bExp);
  const rMantissa = rOrigMantissa >> exp - rExp;
  const gMantissa = gOrigMantissa >> exp - gExp;
  const bMantissa = bOrigMantissa >> exp - bExp;

  const bias = 15;
  const biasedExp = exp === 0 ? 0 : exp - 127 + bias;
  assert(biasedExp >= 0 && biasedExp <= 31);
  return rMantissa | gMantissa << 9 | bMantissa << 18 | biasedExp << 27;
}

/**
   * Asserts that a number is within the representable (inclusive) of the integer type with the
   * specified number of bits and signedness.
   *
   * TODO: Assert isInteger? Then this function "asserts that a number is representable" by the type
   */
export function assertInIntegerRange(n, bits, signed) {
  if (signed) {
    const min = -Math.pow(2, bits - 1);
    const max = Math.pow(2, bits - 1) - 1;
    assert(n >= min && n <= max);
  } else {
    const max = Math.pow(2, bits) - 1;
    assert(n >= 0 && n <= max);
  }
}

/**
   * Converts a linear value into a "gamma"-encoded value using the sRGB-clamped transfer function.
   */
export function gammaCompress(n) {
  n = n <= 0.0031308 ? 323 * n / 25 : (211 * Math.pow(n, 5 / 12) - 11) / 200;
  return clamp(n, { min: 0, max: 1 });
}

/**
   * Converts a "gamma"-encoded value into a linear value using the sRGB-clamped transfer function.
   */
export function gammaDecompress(n) {
  n = n <= 0.04045 ? n * 25 / 323 : Math.pow((200 * n + 11) / 211, 12 / 5);
  return clamp(n, { min: 0, max: 1 });
}

/** Converts a 32-bit float value to a 32-bit unsigned integer value */
export function float32ToUint32(f32) {
  const f32Arr = new Float32Array(1);
  f32Arr[0] = f32;
  const u32Arr = new Uint32Array(f32Arr.buffer);
  return u32Arr[0];
}

/** Converts a 32-bit unsigned integer value to a 32-bit float value */
export function uint32ToFloat32(u32) {
  const u32Arr = new Uint32Array(1);
  u32Arr[0] = u32;
  const f32Arr = new Float32Array(u32Arr.buffer);
  return f32Arr[0];
}

/** Converts a 32-bit float value to a 32-bit signed integer value */
export function float32ToInt32(f32) {
  const f32Arr = new Float32Array(1);
  f32Arr[0] = f32;
  const i32Arr = new Int32Array(f32Arr.buffer);
  return i32Arr[0];
}

/** Converts a 32-bit unsigned integer value to a 32-bit signed integer value */
export function uint32ToInt32(u32) {
  const u32Arr = new Uint32Array(1);
  u32Arr[0] = u32;
  const i32Arr = new Int32Array(u32Arr.buffer);
  return i32Arr[0];
}

/** A type of number representable by NumberRepr. */
























/**
                                                      * Class that encapsulates a single number of various types. Exposes:
                                                      * - the actual numeric value (as a JS `number`, or `bigint` if it's u64/i64)
                                                      * - the bit representation of the number, as a TypedArray of size 1 with the appropriate type.
                                                      */
export class NumberRepr {



  constructor(value, bits) {
    this.value = value;
    this.bits = bits;
  }

  /** Create an f64 from a numeric value, a JS `number`. */
  static fromF64(value) {
    return new NumberRepr(value, new BigUint64Array(new Float64Array([value]).buffer));
  }
  /** Create an f32 from a numeric value, a JS `number`. */
  static fromF32(value) {
    return new NumberRepr(value, new Uint32Array(new Float32Array([value]).buffer));
  }

  /** Create an f64 from a bit representation, a uint64 represented as a JS `bigint`. */
  static fromF64Bits(bits) {
    const abv = new BigUint64Array([bits]);
    return new NumberRepr(new Float64Array(abv.buffer)[0], abv);
  }
  /** Create an f32 from a bit representation, a uint32 represented as a JS `number`. */
  static fromF32Bits(bits) {
    const abv = new Uint32Array([bits]);
    return new NumberRepr(new Float32Array(abv.buffer)[0], abv);
  }
  /** Create an f16 from a bit representation, a uint16 represented as a JS `number`. */
  static fromF16Bits(bits) {
    return new NumberRepr(float16BitsToFloat32(bits), new Uint16Array(bits));
  }

  /** Create an i32 from a numeric value, a JS `number`. */
  static fromI32(value) {
    return new NumberRepr(value, new Uint32Array(new Int32Array([value]).buffer));
  }
  /** Create an i16 from a numeric value, a JS `number`. */
  static fromI16(value) {
    return new NumberRepr(value, new Uint16Array(new Int16Array([value]).buffer));
  }
  /** Create an i8 from a numeric value, a JS `number`. */
  static fromI8(value) {
    return new NumberRepr(value, new Uint8Array(new Int8Array([value]).buffer));
  }

  /** Create an i32 from a bit representation, a uint32 represented as a JS `number`. */
  static fromI32Bits(bits) {
    const abv = new Uint32Array([bits]);
    return new NumberRepr(new Int32Array(abv.buffer)[0], abv);
  }
  /** Create an i16 from a bit representation, a uint16 represented as a JS `number`. */
  static fromI16Bits(bits) {
    const abv = new Uint16Array([bits]);
    return new NumberRepr(new Int16Array(abv.buffer)[0], abv);
  }
  /** Create an i8 from a bit representation, a uint8 represented as a JS `number`. */
  static fromI8Bits(bits) {
    const abv = new Uint8Array([bits]);
    return new NumberRepr(new Int8Array(abv.buffer)[0], abv);
  }

  /** Create a u32 from a numeric value, a JS `number`. */
  static fromU32(value) {
    return new NumberRepr(value, new Uint32Array(value));
  }
  /** Create a u16 from a numeric value, a JS `number`. */
  static fromU16(value) {
    return new NumberRepr(value, new Uint16Array(value));
  }
  /** Create a u8 from a numeric value, a JS `number`. */
  static fromU8(value) {
    return new NumberRepr(value, new Uint8Array(value));
  }}
//# sourceMappingURL=conversion.js.map