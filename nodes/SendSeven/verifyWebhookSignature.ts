import { createHmac, timingSafeEqual } from 'crypto';

/** Max accepted clock skew between SendSeven's signing time and now (seconds). */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export type SignatureResult = { ok: true } | { ok: false; reason: string };

/**
 * Verify a SendSeven webhook delivery.
 *
 * SendSeven signs `"<X-Sendseven-Timestamp>.<raw request body>"` with
 * HMAC-SHA256 (key = the endpoint's secret_key) and sends
 * `X-Sendseven-Signature: sha256=<lowercase hex>`.
 *
 * `rawBody` MUST be the exact bytes received on the wire. Never pass a
 * re-serialized parsed body: key order / whitespace would differ.
 */
export function verifyWebhookSignature(
	rawBody: Buffer | string | undefined,
	signatureHeader: string | undefined,
	timestampHeader: string | undefined,
	secret: string | undefined,
	nowSeconds: number = Math.floor(Date.now() / 1000),
): SignatureResult {
	if (!secret) return { ok: false, reason: 'no signing secret stored for this webhook' };
	if (rawBody === undefined || rawBody === null) return { ok: false, reason: 'raw body unavailable' };
	if (!signatureHeader || !timestampHeader) return { ok: false, reason: 'missing signature headers' };

	if (!/^\d{1,12}$/.test(timestampHeader.trim())) return { ok: false, reason: 'invalid timestamp' };
	const timestamp = Number(timestampHeader.trim());
	if (Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
		return { ok: false, reason: 'timestamp outside tolerance' };
	}

	const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
	const expected = createHmac('sha256', secret)
		.update(Buffer.concat([Buffer.from(`${timestamp}.`, 'utf8'), body]))
		.digest('hex');

	const received = signatureHeader.trim().toLowerCase().replace(/^sha256=/, '');
	const a = Buffer.from(received, 'utf8');
	const b = Buffer.from(expected, 'utf8');
	if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'signature mismatch' };
	return { ok: true };
}
