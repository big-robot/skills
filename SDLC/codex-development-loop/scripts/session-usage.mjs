import fs from 'node:fs';
import { addTokenUsage, normalizeTokenUsage, subtractTokenUsage, zeroTokenUsage } from './token-usage.mjs';

const MAX_LINE = 8 * 1024 * 1024;
const MAX_RECORDS = 200_000;
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);

// Read only the known telemetry envelopes. Never traverse message/tool content.
export async function readSessionUsage(file, threadId) {
  const records = new Map();
  const legacy = [];
  const issues = new Set();
  let embeddedOnly = false;
  const embedded = new Map();
  const accept = (payload, timestamp, fromCompaction = false) => {
    if (payload?.thread_id && payload.thread_id !== threadId) { issues.add('usage_identity_conflict'); return; }
    if (typeof payload?.response_id !== 'string' || !payload.response_id) { issues.add('modern_usage_invalid'); return; }
    try {
      const usage = normalizeTokenUsage(payload.usage, { source: 'snake' });
      const cumulative = payload.thread_token_usage ? normalizeTokenUsage(payload.thread_token_usage, { source: 'snake' }) : null;
      const time = Date.parse(timestamp);
      const entry = { usage, cumulative, time };
      const target = fromCompaction ? embedded : records;
      const previous = target.get(payload.response_id);
      if (previous && (!equal(previous.usage, usage) || !equal(previous.cumulative, cumulative) || (!fromCompaction && previous.time !== time))) {
        issues.add('response_usage_conflict');
      } else if (!previous) target.set(payload.response_id, entry);
      if (records.size + embedded.size > MAX_RECORDS) throw new Error('record limit');
    } catch { issues.add('modern_usage_invalid'); }
  };
  const inspect = (line) => {
    if (!/"(?:token_usage_record|compacted|token_count)"/.test(line)) return;
    let event;
    try { event = JSON.parse(line); } catch { issues.add('telemetry_line_invalid'); return; }
    if (event?.type === 'token_usage_record') accept(event.payload, event.timestamp);
    else if (event?.type === 'compacted' && event.payload?.latest_token_usage_record) {
      const record = event.payload.latest_token_usage_record;
      // Embedded payloads have no original timestamp. They can verify a standalone
      // response, but the compaction envelope cannot date that model response.
      accept(record, null, true);
    } else if (event?.type === 'event_msg' && event.payload?.type === 'token_count' && event.payload?.info?.total_token_usage != null) {
      try {
        const time = Date.parse(event.timestamp);
        const usage = normalizeTokenUsage(event.payload?.info?.total_token_usage, { source: 'snake' });
        if (!Number.isFinite(time)) throw new Error('timestamp');
        legacy.push({ time, usage });
      } catch { issues.add('legacy_usage_invalid'); }
    }
    if (records.size + embedded.size + legacy.length > MAX_RECORDS) throw new Error('telemetry record limit exceeded');
  };
  let buffered = '';
  let oversized = false;
  try {
    for await (const chunk of fs.createReadStream(file, { encoding: 'utf8' })) {
      let start = 0;
      for (let newline = chunk.indexOf('\n'); newline !== -1; newline = chunk.indexOf('\n', start)) {
        const segment = chunk.slice(start, newline);
        if (!oversized && buffered.length + segment.length <= MAX_LINE) inspect(buffered + segment);
        else issues.add('telemetry_line_oversized');
        buffered = ''; oversized = false; start = newline + 1;
      }
      const remainder = chunk.slice(start);
      if (!oversized && buffered.length + remainder.length <= MAX_LINE) buffered += remainder;
      else { buffered = ''; oversized = true; }
    }
    if (buffered && !oversized) inspect(buffered);
    if (oversized) issues.add('telemetry_line_oversized');
  } catch { return { records: [], legacy: [], issues: ['session_read_unavailable'], embeddedOnly: false }; }
  for (const [id, entry] of embedded) {
    if (!records.has(id)) embeddedOnly = true;
    else if (!equal(records.get(id).usage, entry.usage) || !equal(records.get(id).cumulative, entry.cumulative)) issues.add('response_usage_conflict');
  }
  return { records: [...records.values()], legacy, issues: [...issues], embeddedOnly };
}

export function sessionInterval(data, start, cutoff, { baseline = null, baselineAt = null, bornAt = null } = {}) {
  const reasons = new Set(data.issues);
  const records = data.records.filter((record) => Number.isFinite(record.time) && record.time <= cutoff).sort((a, b) => a.time - b.time);
  if (data.records.some((record) => !Number.isFinite(record.time))) reasons.add('modern_timestamp_unavailable');
  if (data.embeddedOnly) reasons.add('embedded_response_unattributed');
  const unavailable = () => ({ usage: null, responseCount: null, provenance: 'unavailable', lastObservedAt: null, reasonCodes: [...reasons] });
  if (reasons.has('response_usage_conflict') || reasons.has('usage_identity_conflict')) return unavailable();
  if (records.length > 0) {
    let cumulative = zeroTokenUsage();
    let reconciled = false;
    for (const record of records) {
      cumulative = addTokenUsage([cumulative, record.usage]);
      if (record.cumulative) {
        if (!equal(cumulative, record.cumulative)) reasons.add('cumulative_disagreement');
        reconciled = equal(cumulative, record.cumulative);
      } else reconciled = false;
    }
    if (!reconciled) reasons.add('cumulative_unverified');
    if (data.legacy.some((entry) => entry.time <= cutoff && entry.time > records.at(-1).time
      && (entry.usage.inputTokens > cumulative.inputTokens || entry.usage.outputTokens > cumulative.outputTokens))) reasons.add('modern_coverage_incomplete');
    const selected = records.filter((record) => record.time > start);
    return {
      usage: addTokenUsage(selected.map((record) => record.usage)), responseCount: selected.length,
      provenance: reasons.size === 0 ? 'modern-reconciled' : 'modern-partial',
      lastObservedAt: new Date(records.at(-1).time).toISOString(), reasonCodes: [...reasons],
    };
  }
  const counters = data.legacy.filter((record) => record.time <= cutoff).sort((a, b) => a.time - b.time);
  if (counters.length === 0) return unavailable();
  reasons.add('legacy_cumulative_only');
  for (let index = 1; index < counters.length; index += 1) {
    const previous = counters[index - 1], current = counters[index];
    if (previous.time === current.time && !equal(previous.usage, current.usage)) { reasons.add('legacy_counter_conflict'); return unavailable(); }
    try { subtractTokenUsage(current.usage, previous.usage); }
    catch { reasons.add('cumulative_regressed'); return unavailable(); }
  }
  const before = counters.filter((record) => record.time <= start).at(-1)?.usage
    ?? (baselineAt === start ? baseline : null)
    ?? (bornAt !== null && bornAt >= start ? zeroTokenUsage() : null);
  if (before === null) { reasons.add('baseline_unavailable'); return unavailable(); }
  try {
    return {
      usage: subtractTokenUsage(counters.at(-1).usage, before), responseCount: null,
      provenance: 'legacy-cumulative', lastObservedAt: new Date(counters.at(-1).time).toISOString(), reasonCodes: [...reasons],
    };
  } catch { reasons.add('cumulative_regressed'); return unavailable(); }
}
