import { createHmac } from "crypto";

export type SignedRequestHeaders = {
  signatureHeader: string;
  timestampHeader: string;
};

export type SignedRequestHeaderOptions = {
  signatureHeader?: string;
  timestampHeader?: string;
  requestId?: string;
};

export function currentTimestamp(): string {
  return Date.now().toString();
}

export function createRequestSignature(payload: string, timestamp: string, sharedSecret: string, requestId?: string): string {
  const signedPayload = requestId ? `${timestamp}.${requestId}.${payload}` : `${timestamp}.${payload}`;
  return createHmac("sha256", sharedSecret).update(signedPayload).digest("hex");
}

export function createSignedRequestHeaders(
  payload: string,
  sharedSecret: string,
  options: SignedRequestHeaderOptions = {}
): SignedRequestHeaders {
  const timestamp = currentTimestamp();
  return {
    signatureHeader: createRequestSignature(payload, timestamp, sharedSecret, options.requestId),
    timestampHeader: timestamp
  };
}

export function buildSignedRequestHeaders(
  payload: string,
  sharedSecret: string,
  options: SignedRequestHeaderOptions = {}
) {
  const timestamp = currentTimestamp();
  const signature = createRequestSignature(payload, timestamp, sharedSecret, options.requestId);
  const signatureHeader = options.signatureHeader ?? "x-request-signature";
  const timestampHeader = options.timestampHeader ?? "x-request-timestamp";

  return {
    [signatureHeader]: signature,
    [timestampHeader]: timestamp,
    ...(options.requestId ? { "X-AFIO-Request-Id": options.requestId } : {})
  } as Record<string, string>;
}
