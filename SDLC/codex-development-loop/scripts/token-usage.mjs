const NORMALIZED_FIELDS = [
  "inputTokens",
  "cachedInputTokens",
  "outputTokens",
  "reasoningOutputTokens",
];

const SNAKE_FIELDS = {
  inputTokens: "input_tokens",
  cachedInputTokens: "cached_input_tokens",
  outputTokens: "output_tokens",
  reasoningOutputTokens: "reasoning_output_tokens",
};

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function checkedInteger(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`token usage ${field} must be a non-negative safe integer`);
  }
  return value;
}

function checkedAdd(left, right, field) {
  const value = left + right;
  if (!Number.isSafeInteger(value)) throw new Error(`token usage ${field} exceeds the safe integer range`);
  return value;
}

export function normalizeTokenUsage(value, { source = "normalized" } = {}) {
  if (!isPlainObject(value)) throw new Error("token usage must be an object");
  const normalized = {};
  for (const field of NORMALIZED_FIELDS) {
    const sourceField = source === "snake" ? SNAKE_FIELDS[field] : field;
    normalized[field] = checkedInteger(value[sourceField], sourceField);
  }
  if (normalized.cachedInputTokens > normalized.inputTokens) {
    throw new Error("token usage cached input exceeds input tokens");
  }
  if (normalized.reasoningOutputTokens > normalized.outputTokens) {
    throw new Error("token usage reasoning output exceeds output tokens");
  }
  normalized.totalTokens = checkedAdd(normalized.inputTokens, normalized.outputTokens, "totalTokens");
  const reportedTotal = source === "snake" ? value.total_tokens : value.totalTokens;
  if (reportedTotal !== undefined && checkedInteger(reportedTotal, source === "snake" ? "total_tokens" : "totalTokens") !== normalized.totalTokens) {
    throw new Error("token usage total does not equal input plus output");
  }
  return normalized;
}

export function compactTokenUsage(value) {
  const normalized = normalizeTokenUsage(value);
  return Object.fromEntries(NORMALIZED_FIELDS.map((field) => [field, normalized[field]]));
}

export function validateReceiptTokenUsage(value) {
  if (value === null) return null;
  if (!isPlainObject(value)) throw new Error("review receipt token usage must be null or an object");
  const keys = Object.keys(value).sort();
  const expected = [...NORMALIZED_FIELDS].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error("review receipt token usage has unexpected or missing fields");
  }
  return compactTokenUsage(value);
}

export function zeroTokenUsage() {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
  };
}

export function addTokenUsage(values) {
  let total = zeroTokenUsage();
  for (const value of values) {
    const normalized = normalizeTokenUsage(value);
    total = {
      inputTokens: checkedAdd(total.inputTokens, normalized.inputTokens, "inputTokens"),
      cachedInputTokens: checkedAdd(total.cachedInputTokens, normalized.cachedInputTokens, "cachedInputTokens"),
      outputTokens: checkedAdd(total.outputTokens, normalized.outputTokens, "outputTokens"),
      reasoningOutputTokens: checkedAdd(total.reasoningOutputTokens, normalized.reasoningOutputTokens, "reasoningOutputTokens"),
      totalTokens: checkedAdd(total.totalTokens, normalized.totalTokens, "totalTokens"),
    };
  }
  return total;
}

export function subtractTokenUsage(current, baseline) {
  const latest = normalizeTokenUsage(current);
  const initial = normalizeTokenUsage(baseline);
  const result = {};
  for (const field of NORMALIZED_FIELDS) {
    const value = latest[field] - initial[field];
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`token usage ${field} regressed below the launch baseline`);
    result[field] = value;
  }
  result.totalTokens = checkedAdd(result.inputTokens, result.outputTokens, "totalTokens");
  return normalizeTokenUsage(result);
}

export function usageOrNull(values) {
  return values.length === 0 ? null : addTokenUsage(values);
}

// turn.completed is a turn aggregate, not a model-response counter. Without
// response IDs multiple completions cannot be safely deduplicated or combined.
// Valid reported zero remains available numeric evidence, but neither zero nor
// nonzero turn totals prove every nested operation's cost is included. The run
// collector separately qualifies in-window zero reviews as coverage unverified.
export function reviewUsageEvidence(transcript) {
  const completions = [];
  for (const line of transcript.split('\n')) {
    try {
      const event = JSON.parse(line);
      if (event?.type === 'turn.completed') completions.push(event);
    } catch { /* Review stderr may be non-JSON. */ }
  }
  let usage = null;
  if (completions.length === 1) {
    try { usage = normalizeTokenUsage(completions[0].usage, { source: 'snake' }); }
    catch { /* Missing or malformed telemetry is unknown, including subsets. */ }
  }
  return { usage, responseCount: null };
}
