const OPERATION_RE = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;

export function reviewRequestBody(operationId) {
  if (!OPERATION_RE.test(operationId)) throw new Error("review-request operation ID must be a UUID");
  return `@codex review\n<!-- cdl-review-operation:${operationId} -->`;
}

export function isReviewRequestBody(body, operationId = null) {
  const text = String(body ?? "").trim();
  if (operationId === null) {
    return text === "@codex review" || /^@codex review\s*<!-- cdl-review-operation:[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12} -->$/i.test(text);
  }
  return text === reviewRequestBody(operationId);
}
