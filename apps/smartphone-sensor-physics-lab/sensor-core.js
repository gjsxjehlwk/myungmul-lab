export const magnitude = (...values) => {
  const numbers = values.map(nullable);
  return numbers.every(Number.isFinite)
    ? Math.sqrt(numbers.reduce((sum, value) => sum + value ** 2, 0))
    : null;
};

export function normalizeSample(mode, elapsed, raw, source = "sensor") {
  const sample = { elapsed_ms: Math.max(0, Math.round(elapsed)), source };
  if (mode === "acceleration") {
    sample.x = nullable(raw.x); sample.y = nullable(raw.y); sample.z = nullable(raw.z);
    sample.magnitude = complete(sample) ? magnitude(sample.x, sample.y, sample.z) : null;
    sample.includes_gravity = Boolean(raw.includesGravity);
  } else if (mode === "orientation") {
    sample.alpha = nullable(raw.alpha); sample.beta = nullable(raw.beta); sample.gamma = nullable(raw.gamma);
    sample.magnitude = [sample.alpha,sample.beta,sample.gamma].every(Number.isFinite) ? magnitude(sample.alpha,sample.beta,sample.gamma) : null;
  } else {
    sample.x = nullable(raw.x); sample.y = nullable(raw.y); sample.z = nullable(raw.z);
    sample.magnitude = complete(sample) ? magnitude(sample.x, sample.y, sample.z) : null;
  }
  return sample;
}

function nullable(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function complete(sample) { return [sample.x,sample.y,sample.z].every(Number.isFinite); }

export function summarize(samples, keys, from = -Infinity, to = Infinity) {
  const selected = samples.filter(row => row.elapsed_ms >= from && row.elapsed_ms <= to);
  return Object.fromEntries(keys.map(key => {
    const values = selected.map(row => row[key]).filter(Number.isFinite);
    return [key, values.length ? { min: Math.min(...values), max: Math.max(...values), mean: values.reduce((a,b)=>a+b,0)/values.length, n:values.length } : null];
  }));
}

export function parseCsv(text) {
  const lines = String(text).trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error("헤더와 한 행 이상의 데이터가 필요합니다.");
  const headers = lines[0].split(",").map(v=>v.trim());
  if (!headers.includes("elapsed_ms")) throw new Error("elapsed_ms 열이 필요합니다.");
  return lines.slice(1).map(line => {
    const cells=line.split(","); const row={};
    headers.forEach((header,index)=>{ const value=(cells[index]??"").trim(); row[header] = ["source","includes_gravity","sensor_mode"].includes(header) ? value : (value==="" ? null : Number(value)); });
    row.source="imported"; return row;
  }).filter(row=>Number.isFinite(row.elapsed_ms));
}

export function downsample(samples, maxPoints = 800) {
  if (samples.length <= maxPoints) return samples;
  const step = Math.ceil(samples.length / maxPoints);
  return samples.filter((_, index) => index % step === 0 || index === samples.length - 1);
}
