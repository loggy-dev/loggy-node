import crypto from "node:crypto";

/**
 * Hybrid encryption for log payloads.
 * Uses AES-256-GCM for data encryption and RSA-OAEP for key encryption.
 */

export interface EncryptedPayload {
  encryptedKey: string; // RSA-encrypted AES key (base64)
  iv: string; // AES initialization vector (base64)
  authTag: string; // AES-GCM auth tag (base64)
  data: string; // AES-encrypted data (base64)
}

/**
 * Encrypts data using hybrid encryption (AES-256-GCM + RSA-OAEP)
 * @param data - The data to encrypt (will be JSON stringified)
 * @param publicKeyPem - The server's RSA public key in PEM format
 * @returns Encrypted payload with all components needed for decryption
 */
export function encryptPayload(
  data: unknown,
  publicKeyPem: string
): EncryptedPayload {
  // Generate random AES-256 key and IV
  const aesKey = crypto.randomBytes(32); // 256 bits
  const iv = crypto.randomBytes(12); // 96 bits for GCM

  // Encrypt data with AES-256-GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, iv);
  const jsonData = JSON.stringify(data);
  const encrypted = Buffer.concat([
    cipher.update(jsonData, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Encrypt AES key with RSA-OAEP
  const encryptedKey = crypto.publicEncrypt(
    {
      key: publicKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    aesKey
  );

  return {
    encryptedKey: encryptedKey.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    data: encrypted.toString("base64"),
  };
}
