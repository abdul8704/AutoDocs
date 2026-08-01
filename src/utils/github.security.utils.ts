import crypto from 'crypto';

export const verifyGitHubSignature = (
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string
): boolean => {
  if (!signatureHeader || !rawBody) {
    return false;
  }

  // Calculate HMAC SHA-256 digest using the raw body
  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(rawBody).digest('hex');

  const signatureBuffer = Buffer.from(signatureHeader);
  const digestBuffer = Buffer.from(digest);

  // Prevent timing attacks by checking length first, then using timingSafeEqual
  if (signatureBuffer.length !== digestBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(signatureBuffer, digestBuffer);
};