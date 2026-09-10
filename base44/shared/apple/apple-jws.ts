/**
 * RC20.3 — Apple JWS (JSON Web Signature) Verification
 *
 * Verifies Apple's signed JWS payloads from:
 *   - App Store Server Notifications V2 (signedPayload)
 *   - StoreKit 2 transactions (JWSTransaction)
 *
 * Uses the MODERN Apple signed-transaction architecture.
 * Does NOT use the deprecated verifyReceipt endpoint.
 *
 * Verification chain:
 *   1. Parse the JWS compact serialization (header.payload.signature)
 *   2. Extract the x5c certificate chain from the JWS header
 *   3. Validate the certificate chain (leaf ← intermediate ← root)
 *   4. Verify the root certificate is signed by the trusted Apple Root CA G3
 *      (from APPLE_ROOT_CA_G3_PEM — subject-name matching is NOT accepted)
 *   5. Verify the JWS ES256 signature using the leaf certificate's public key
 *   6. Decode and return the payload
 *
 * If the payload itself contains nested JWS (signedTransactionInfo,
 * signedRenewalInfo), the caller verifies each nested JWS the same way.
 *
 * Uses Deno's Web Crypto API (ECDSA P-256 / ES256 for JWS; P-384 for Apple Root CA G3).
 */

// ── Base64URL + PEM helpers ──

function base64UrlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlDecodeStr(input: string): string {
  return new TextDecoder().decode(base64UrlDecode(input));
}

// ── Minimal DER parser (just enough for X.509 cert chain validation) ──

interface DERElement {
  tag: number;
  contentStart: number;
  contentLen: number;
  fullStart: number;
  fullEnd: number;
}

function readDERLength(bytes: Uint8Array, offset: number): [number, number] {
  const first = bytes[offset++];
  if (first < 0x80) return [first, offset];
  const numBytes = first & 0x7f;
  if (numBytes > 4) return [-1, offset]; // sanity guard
  let length = 0;
  for (let i = 0; i < numBytes; i++) length = (length << 8) | bytes[offset++];
  return [length, offset];
}

function parseDERElement(bytes: Uint8Array, offset: number): DERElement | null {
  const fullStart = offset;
  if (offset >= bytes.length) return null;
  const tag = bytes[offset++];
  const [length, contentOffset] = readDERLength(bytes, offset);
  if (length < 0) return null;
  if (contentOffset + length > bytes.length) return null;
  return {
    tag,
    contentStart: contentOffset,
    contentLen: length,
    fullStart,
    fullEnd: contentOffset + length,
  };
}

/**
 * Extract the SubjectPublicKeyInfo (SPKI) DER bytes from an X.509 certificate.
 * The returned slice includes the outer SEQUENCE tag + length + content,
 * suitable for `crypto.subtle.importKey('spki', ...)`.
 */
function extractSPKI(certDer: Uint8Array): Uint8Array | null {
  const cert = parseDERElement(certDer, 0);
  if (!cert || cert.tag !== 0x30) return null;

  // tbsCertificate is the first element inside Certificate SEQUENCE
  const tbs = parseDERElement(certDer, cert.contentStart);
  if (!tbs || tbs.tag !== 0x30) return null;

  // Navigate TBS fields: version?, serialNumber, signature, issuer, validity, subject, SPKI
  let offset = tbs.contentStart;

  // version [0] EXPLICIT (optional context tag 0xA0)
  let el = parseDERElement(certDer, offset);
  if (!el) return null;
  if (el.tag === 0xa0) offset = el.fullEnd;

  // serialNumber, signature(AlgorithmIdentifier), issuer(Name), validity, subject(Name) = 5 elements
  for (let i = 0; i < 5; i++) {
    el = parseDERElement(certDer, offset);
    if (!el) return null;
    offset = el.fullEnd;
  }

  // Next element is subjectPublicKeyInfo
  const spki = parseDERElement(certDer, offset);
  if (!spki || spki.tag !== 0x30) return null;

  return certDer.subarray(spki.fullStart, spki.fullEnd);
}

/**
 * Extract the TBSCertificate bytes (the data that was signed) and the
 * signature value from an X.509 certificate.
 */
function extractTBSAndSignature(certDer: Uint8Array): { tbs: Uint8Array; signature: Uint8Array } | null {
  const cert = parseDERElement(certDer, 0);
  if (!cert || cert.tag !== 0x30) return null;

  // tbsCertificate is first element inside Certificate SEQUENCE
  const tbs = parseDERElement(certDer, cert.contentStart);
  if (!tbs || tbs.tag !== 0x30) return null;
  const tbsBytes = certDer.subarray(tbs.fullStart, tbs.fullEnd);

  // signatureAlgorithm is second element
  const sigAlg = parseDERElement(certDer, tbs.fullEnd);
  if (!sigAlg) return null;

  // signatureValue is third element (BIT STRING, tag 0x03)
  const sigVal = parseDERElement(certDer, sigAlg.fullEnd);
  if (!sigVal || sigVal.tag !== 0x03) return null;

  // BIT STRING: first content byte = unused bits count (must be 0)
  const sigContent = certDer.subarray(sigVal.contentStart, sigVal.fullEnd);
  if (sigContent.length < 1) return null;
  const signature = sigContent.subarray(1); // skip unused-bits byte

  return { tbs: tbsBytes, signature };
}

/**
 * Parse a PEM-encoded certificate to DER bytes.
 */
function pemToDer(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, '')
    .replace(/-----END [A-Z ]+-----/g, '')
    .replace(/\s/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Get the trusted Apple Root CA G3 public key from server configuration.
 *
 * The trusted root MUST come from APPLE_ROOT_CA_G3_PEM (server-side env var).
 * Subject-name matching is NOT a trust mechanism — it is explicitly rejected.
 * The incoming x5c chain CANNOT establish its own trust anchor.
 * If the trusted root is not configured, verification FAILS CLOSED.
 *
 * DEVELOPER ACTION REQUIRED: Set APPLE_ROOT_CA_G3_PEM to the Apple Root CA G3
 * certificate (PEM, publicly downloadable from apple.com/certificateauthority).
 */
async function getTrustedRootKey(): Promise<CryptoKey> {
  const pem = (typeof Deno !== 'undefined' && Deno.env?.get('APPLE_ROOT_CA_G3_PEM')) || '';
  if (!pem) {
    throw new Error(
      'APPLE_ROOT_CA_G3_PEM is not configured. Apple JWS verification cannot proceed without a trusted root certificate. DEVELOPER ACTION REQUIRED: download Apple Root CA G3 from apple.com/certificateauthority and set it in Settings → Secrets.',
    );
  }
  const der = pemToDer(pem);
  const spki = extractSPKI(der);
  if (!spki) {
    throw new Error('APPLE_ROOT_CA_G3_PEM is not a valid X.509 certificate.');
  }
  return importECP256Key(spki);
}

/**
 * Import an EC public key from a certificate's SPKI.
 * Apple JWS leaf certificates use P-256 (ES256); Apple Root CA G3 uses P-384.
 * Try both curves — the SPKI's algorithm OID determines the actual curve.
 */
async function importECP256Key(spki: Uint8Array): Promise<CryptoKey> {
  for (const namedCurve of ['P-256', 'P-384'] as const) {
    try {
      return await crypto.subtle.importKey(
        'spki',
        spki as BufferSource,
        { name: 'ECDSA', namedCurve },
        false,
        ['verify'],
      );
    } catch {
      // try next curve
    }
  }
  throw new Error('Failed to import EC public key from SPKI (tried P-256 and P-384)');
}

/**
 * Verify an ECDSA signature, trying both SHA-384 and SHA-256.
 * Apple Root CA G3 (P-384) self-signs with SHA-384; intermediate certs
 * signed by the P-384 root use SHA-384; P-256 leaf/intermediate certs
 * typically use SHA-256. The hash is determined by the cert's
 * signatureAlgorithm OID which we don't parse — we try both.
 */
async function verifyECDSA(
  key: CryptoKey,
  signature: BufferSource,
  data: BufferSource,
): Promise<boolean> {
  for (const hash of ['SHA-384', 'SHA-256'] as const) {
    try {
      const ok = await crypto.subtle.verify(
        { name: 'ECDSA', hash },
        key,
        signature,
        data,
      );
      if (ok) return true;
    } catch {
      // try next hash
    }
  }
  return false;
}

/**
 * Verify a certificate chain: each cert is signed by the next cert's key.
 * The last cert (root) should be self-signed and match Apple Root CA.
 *
 * @param x5cCerts Array of DER-encoded certificates (leaf first, root last)
 * @returns The leaf certificate's public key as a CryptoKey
 * @throws if chain validation fails or root is not Apple Root CA
 */
export async function verifyAppleCertChain(x5cCerts: Uint8Array[]): Promise<CryptoKey> {
  if (x5cCerts.length < 2) {
    throw new Error('Apple JWS x5c chain too short (expected leaf + intermediate + root minimum)');
  }

  // Verify each cert is signed by the next (issuer)
  for (let i = 0; i < x5cCerts.length - 1; i++) {
    const childDer = x5cCerts[i];
    const issuerDer = x5cCerts[i + 1];

    const extracted = extractTBSAndSignature(childDer);
    const issuerSpki = extractSPKI(issuerDer);
    if (!extracted || !issuerSpki) {
      throw new Error(`Apple cert chain: failed to parse cert at index ${i}`);
    }

    const issuerKey = await importECP256Key(issuerSpki);
    const ok = await verifyECDSA(
      issuerKey,
      extracted.signature as BufferSource,
      extracted.tbs as BufferSource,
    );
    if (!ok) {
      throw new Error(`Apple cert chain: signature verification failed at cert index ${i}`);
    }
  }

  // Cryptographic root trust: verify the x5c root certificate is signed by
  // the TRUSTED Apple Root CA G3 public key (from server configuration).
  //
  // The incoming x5c chain CANNOT establish its own trust anchor.
  // Subject-name matching is NOT a trust mechanism and is explicitly rejected.
  // The trusted root MUST come from APPLE_ROOT_CA_G3_PEM (server-side env var).
  // If not configured, verification FAILS CLOSED — no Apple data is trusted.
  const rootDer = x5cCerts[x5cCerts.length - 1];
  const rootExtracted = extractTBSAndSignature(rootDer);
  if (!rootExtracted) {
    throw new Error('Apple cert chain: failed to parse root certificate for trust verification');
  }
  const trustedRootKey = await getTrustedRootKey();
  const rootSignedByTrusted = await verifyECDSA(
    trustedRootKey,
    rootExtracted.signature as BufferSource,
    rootExtracted.tbs as BufferSource,
  );
  if (!rootSignedByTrusted) {
    throw new Error('Apple cert chain: root certificate is not signed by the trusted Apple Root CA G3');
  }

  // Return the leaf cert's public key
  const leafSpki = extractSPKI(x5cCerts[0]);
  if (!leafSpki) throw new Error('Apple cert chain: failed to extract leaf SPKI');
  return importECP256Key(leafSpki);
}

/**
 * Verify an Apple JWS (compact serialization) and return the decoded payload.
 *
 * @param jws The JWS string (header.payload.signature)
 * @returns The decoded payload as a parsed object
 * @throws if signature verification or chain validation fails
 */
export async function verifyAppleJWS(jws: string): Promise<Record<string, any>> {
  const parts = jws.split('.');
  if (parts.length !== 3) {
    throw new Error('Apple JWS: expected 3 parts (header.payload.signature)');
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  // Decode header
  const header = JSON.parse(base64UrlDecodeStr(headerB64));

  // Enforce ES256 — do not accept arbitrary JWS algorithms.
  if (header.alg !== 'ES256') {
    throw new Error(`Apple JWS: unsupported algorithm '${header.alg}'. Only ES256 is accepted.`);
  }

  if (!header.x5c || !Array.isArray(header.x5c) || header.x5c.length < 2) {
    throw new Error('Apple JWS: header missing x5c certificate chain');
  }

  // Parse x5c certificates (base64 DER, leaf first)
  const x5cCerts: Uint8Array[] = header.x5c.map((b64: string) => {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  });

  // Verify certificate chain and get leaf public key
  const leafKey = await verifyAppleCertChain(x5cCerts);

  // Verify JWS signature: signing input = header.payload (the two base64url strings)
  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlDecode(signatureB64);

  const ok = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    leafKey,
    signature as BufferSource,
    signingInput as BufferSource,
  );
  if (!ok) {
    throw new Error('Apple JWS: signature verification failed');
  }

  // Decode and return payload
  return JSON.parse(base64UrlDecodeStr(payloadB64));
}