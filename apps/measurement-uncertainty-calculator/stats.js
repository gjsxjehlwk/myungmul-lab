export function parseMeasurements(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return { values: [], errors: [] };
  const tokens = raw.split(/[\s,]+/).filter(Boolean);
  const values = [];
  const errors = [];
  tokens.forEach((token, index) => {
    const value = Number(token);
    if (!Number.isFinite(value)) errors.push({ index: index + 1, token });
    else values.push(value);
  });
  return { values, errors };
}

export function calculateStats(values, trueValue = null) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const n = values.length;
  const mean = values.reduce((sum, value) => sum + value, 0) / n;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const variance = n > 1
    ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1)
    : null;
  const sd = variance === null ? null : Math.sqrt(variance);
  const se = sd === null ? null : sd / Math.sqrt(n);
  const relativeUncertainty = sd === null || mean === 0 ? null : Math.abs(sd / mean) * 100;
  const hasTrueValue = trueValue !== null && trueValue !== "" && Number.isFinite(Number(trueValue));
  const numericTrueValue = hasTrueValue ? Number(trueValue) : null;
  const relativeError = numericTrueValue === null || numericTrueValue === 0
    ? null
    : Math.abs(mean - numericTrueValue) / Math.abs(numericTrueValue) * 100;
  return { n, mean, min, max, range: max - min, sd, se, relativeUncertainty, relativeError };
}

export function uncertaintyDigits(value) {
  if (!Number.isFinite(value) || value === 0) return 2;
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  const lead = Math.abs(value) / (10 ** exponent);
  const significantDigits = lead < 3 ? 2 : 1;
  return significantDigits - 1 - exponent;
}

export function formatByUncertainty(value, uncertainty) {
  if (!Number.isFinite(value)) return "—";
  if (!Number.isFinite(uncertainty) || uncertainty === 0) return String(Number(value.toPrecision(8)));
  const places = uncertaintyDigits(uncertainty);
  if (places >= 0 && places <= 12) return value.toFixed(places);
  return value.toExponential(Math.max(0, (places + Math.floor(Math.log10(Math.abs(value || 1))))));
}

export function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
