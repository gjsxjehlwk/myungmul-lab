import { downsample, normalizeSample, parseCsv, summarize } from "./sensor-core.js";

const $ = selector => document.querySelector(selector);
const colors = {
  x: "#ff7657", y: "#55bfd0", z: "#f2c84b",
  alpha: "#ff7657", beta: "#55bfd0", gamma: "#f2c84b",
  magnitude: "#79b98a"
};

let mode = "acceleration";
let state = "idle";
let samples = [];
let sensor = null;
let startTime = null;
let pausedAt = 0;
let runStartedAt = 0;
let lastAt = null;
let intervals = [];
let raf = 0;
let durationTimer = 0;
let firstSampleTimer = 0;
const permissionStates = new Map();

const keys = () => mode === "orientation"
  ? ["alpha", "beta", "gamma", "magnitude"]
  : ["x", "y", "z", "magnitude"];

function supportText() {
  if (!window.isSecureContext && location.hostname !== "localhost") {
    return ["insecure", "센서를 사용하려면 보안 연결(HTTPS)이 필요합니다."];
  }
  if (mode === "magnetometer") {
    return "Magnetometer" in window
      ? ["supported", "자기장 센서 사용을 준비한 뒤 기록을 시작하세요."]
      : ["missing", "이 브라우저에서는 자기장 측정을 지원하지 않습니다. 예제 데이터 또는 CSV를 사용해 주세요."];
  }
  const eventName = mode === "acceleration" ? "DeviceMotionEvent" : "DeviceOrientationEvent";
  const eventConstructor = window[eventName];
  if (!(eventName in window)) {
    return ["missing", "이 브라우저에서는 해당 센서 이벤트를 지원하지 않습니다. 예제 데이터 또는 CSV를 사용해 주세요."];
  }
  if (typeof eventConstructor?.requestPermission === "function") {
    return ["supported", "iPhone/iPad에서는 ‘센서 사용 준비’를 누르고 동작 및 방향 접근을 허용해 주세요."];
  }
  return ["supported", "별도 권한 창 없이 센서를 사용합니다. 기록 시작 후 실제 데이터 수신 여부를 확인합니다."];
}

function diagnose() {
  const [kind, message] = supportText();
  $("#support").textContent = `${kind === "supported" ? "● 사용 가능" : "△ 확인 필요"} · ${message}`;
  $("#permission").disabled = kind !== "supported";
  if (state === "idle") $("#start").disabled = kind !== "supported";
}

async function preparePermission({ announce = true } = {}) {
  const [kind, message] = supportText();
  if (kind !== "supported") {
    $("#support").textContent = `× ${message}`;
    return false;
  }

  try {
    if (mode === "magnetometer") {
      if (navigator.permissions?.query) {
        try {
          const result = await navigator.permissions.query({ name: "magnetometer" });
          permissionStates.set(mode, result.state);
          if (result.state === "denied") {
            throw new Error("자기장 센서 접근이 차단되었습니다. 브라우저의 사이트 권한을 확인해 주세요.");
          }
          if (announce) {
            $("#support").textContent = result.state === "granted"
              ? "● 자기장 센서 접근이 허용되었습니다. 기록을 시작해 데이터 수신을 확인하세요."
              : "● 기록 시작 시 자기장 센서 접근을 요청하고 데이터 수신을 확인합니다.";
          }
          return true;
        } catch (error) {
          if (error.message?.includes("차단되었습니다")) throw error;
        }
      }
      permissionStates.set(mode, "prompt");
      if (announce) $("#support").textContent = "● 기록 시작 시 자기장 센서 접근과 데이터 수신을 확인합니다.";
      return true;
    }

    const eventConstructor = mode === "acceleration"
      ? window.DeviceMotionEvent
      : window.DeviceOrientationEvent;
    if (typeof eventConstructor?.requestPermission === "function") {
      const result = await eventConstructor.requestPermission();
      permissionStates.set(mode, result);
      if (result !== "granted") {
        throw new Error("센서 접근이 거부되었습니다. 브라우저의 동작 및 방향 권한을 확인해 주세요.");
      }
      if (announce) $("#support").textContent = "● 센서 접근이 허용되었습니다. 기록을 시작해 데이터 수신을 확인하세요.";
      return true;
    }

    permissionStates.set(mode, "not-required");
    if (announce) $("#support").textContent = "● 별도 권한 창이 필요하지 않습니다. 기록을 시작해 데이터 수신을 확인하세요.";
    return true;
  } catch (error) {
    permissionStates.set(mode, "denied");
    $("#support").textContent = `× ${error.message || "센서 접근을 준비하지 못했습니다."}`;
    return false;
  }
}

function setMode(next) {
  stop(true);
  mode = next;
  document.querySelectorAll(".mode").forEach(button => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });
  samples = [];
  intervals = [];
  renderToggles();
  diagnose();
  render();
}

function renderToggles() {
  $("#toggles").innerHTML = keys().map(key =>
    `<label><input type="checkbox" data-key="${key}" checked><span style="color:${colors[key]}">━</span> ${key}</label>`
  ).join("");
  document.querySelectorAll("#toggles input").forEach(input => input.addEventListener("change", render));
}

function activeKeys() {
  return [...document.querySelectorAll("#toggles input:checked")].map(input => input.dataset.key);
}

function hasMeasurement(sample) {
  const measurementKeys = mode === "orientation" ? ["alpha", "beta", "gamma"] : ["x", "y", "z"];
  return measurementKeys.some(key => Number.isFinite(sample[key]));
}

function push(raw, timestamp = performance.now(), source = "sensor") {
  if (state !== "recording" && source === "sensor") return false;
  if (startTime === null) startTime = timestamp - pausedAt;
  const elapsed = timestamp - startTime;
  const sample = normalizeSample(mode, elapsed, raw, source);
  if (!hasMeasurement(sample)) return false;

  samples.push(sample);
  if (lastAt !== null) intervals.push(timestamp - lastAt);
  lastAt = timestamp;
  clearTimeout(firstSampleTimer);
  firstSampleTimer = 0;
  if (source === "sensor") $("#support").textContent = "● 센서 연결됨 · 실시간 데이터를 기록하고 있습니다.";
  if (elapsed >= Number($("#duration").value) * 1000) stop();
  return true;
}

function clearRunTimers() {
  clearTimeout(durationTimer);
  clearTimeout(firstSampleTimer);
  durationTimer = 0;
  firstSampleTimer = 0;
}

function scheduleRunTimers() {
  clearRunTimers();
  const remaining = Math.max(0, Number($("#duration").value) * 1000 - pausedAt);
  const startingSampleCount = samples.length;
  durationTimer = window.setTimeout(() => stop(), remaining);
  firstSampleTimer = window.setTimeout(() => {
    if (state !== "recording" || samples.length > startingSampleCount) return;
    stop(true);
    $("#support").textContent = "× 센서 데이터가 들어오지 않습니다. 기기 센서 지원 여부와 브라우저의 동작·방향 권한을 확인해 주세요.";
    render();
  }, 2500);
}

async function start() {
  if (!$("#safe").checked) {
    $("#support").textContent = "△ 시작 전 안전 확인에 체크해 주세요.";
    return;
  }
  if (state === "recording") return;

  const currentPermission = permissionStates.get(mode);
  if (!["granted", "not-required"].includes(currentPermission)) {
    const allowed = await preparePermission({ announce: false });
    if (!allowed) return;
  }

  state = "recording";
  runStartedAt = performance.now();
  $("#start").disabled = true;
  $("#pause").disabled = false;
  $("#stop").disabled = false;
  $("#support").textContent = "● 센서 연결 확인 중 · 기기를 천천히 움직여 주세요.";
  if (!attach()) {
    state = "idle";
    $("#start").disabled = false;
    $("#pause").disabled = true;
    $("#stop").disabled = true;
    return;
  }
  scheduleRunTimers();
  loop();
}

function attach() {
  try {
    if (mode === "magnetometer") {
      if (!("Magnetometer" in window)) throw new Error("이 브라우저는 자기장 센서를 지원하지 않습니다.");
      sensor = new Magnetometer({ frequency: 30 });
      sensor.addEventListener("reading", () => push({ x: sensor.x, y: sensor.y, z: sensor.z }));
      sensor.addEventListener("error", event => {
        const message = event.error?.message || "알 수 없는 오류";
        stop(true);
        $("#support").textContent = `× 자기장 센서 오류: ${message}`;
        render();
      });
      sensor.start();
    } else if (mode === "acceleration") {
      sensor = event => {
        const direct = event.acceleration;
        const hasDirectValue = direct && [direct.x, direct.y, direct.z].some(value => value !== null && value !== undefined);
        const acceleration = hasDirectValue ? direct : event.accelerationIncludingGravity;
        if (acceleration) {
          push({
            x: acceleration.x,
            y: acceleration.y,
            z: acceleration.z,
            includesGravity: acceleration === event.accelerationIncludingGravity
          }, event.timeStamp);
        }
      };
      window.addEventListener("devicemotion", sensor);
    } else {
      sensor = event => push({ alpha: event.alpha, beta: event.beta, gamma: event.gamma }, event.timeStamp);
      window.addEventListener("deviceorientation", sensor);
    }
    return true;
  } catch (error) {
    $("#support").textContent = `× 센서를 시작할 수 없습니다: ${error.message}`;
    sensor = null;
    return false;
  }
}

function detach() {
  try {
    if (mode === "magnetometer" && sensor?.stop) sensor.stop();
    else if (mode === "acceleration" && sensor) window.removeEventListener("devicemotion", sensor);
    else if (sensor) window.removeEventListener("deviceorientation", sensor);
  } finally {
    sensor = null;
  }
}

function pause() {
  if (state !== "recording") return;
  const wallElapsed = pausedAt + (runStartedAt ? performance.now() - runStartedAt : 0);
  pausedAt = Math.max(samples.at(-1)?.elapsed_ms || 0, wallElapsed);
  state = "paused";
  detach();
  clearRunTimers();
  $("#start").disabled = false;
  $("#start").textContent = "이어 기록";
  $("#pause").disabled = true;
  cancelAnimationFrame(raf);
  render();
}

function stop(silent = false) {
  if (state === "recording" || state === "paused") detach();
  clearRunTimers();
  state = "idle";
  pausedAt = 0;
  runStartedAt = 0;
  startTime = null;
  lastAt = null;
  $("#start").disabled = supportText()[0] !== "supported";
  $("#start").textContent = "기록 시작";
  $("#pause").disabled = true;
  $("#stop").disabled = true;
  cancelAnimationFrame(raf);
  if (!silent) render();
}

function clear() {
  stop(true);
  samples = [];
  intervals = [];
  render();
}

function loop() {
  render();
  if (state === "recording") raf = requestAnimationFrame(loop);
}

function displayedElapsed() {
  if (state === "recording" && runStartedAt) {
    return Math.min(Number($("#duration").value) * 1000, pausedAt + performance.now() - runStartedAt);
  }
  return state === "paused" ? pausedAt : (samples.at(-1)?.elapsed_ms || 0);
}

function render() {
  const elapsed = displayedElapsed();
  $("#timer").textContent = `${String(Math.floor(elapsed / 60000)).padStart(2, "0")}:${(elapsed % 60000 / 1000).toFixed(1).padStart(4, "0")}`;
  const average = intervals.length ? intervals.reduce((a, b) => a + b, 0) / intervals.length : null;
  $("#meta").textContent = `${state === "recording" ? "기록 중" : state === "paused" ? "일시정지" : "대기"} · ${samples.length}개 · 실제 간격 ${average ? average.toFixed(1) + " ms" : "—"}`;
  draw();
  renderSummary();
}

function draw() {
  const canvas = $("#plot");
  const context = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const padding = { l: 58, r: 22, t: 22, b: 40 };
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#0d223d";
  context.fillRect(0, 0, width, height);
  const data = downsample(samples);
  const selected = activeKeys();
  const values = data.flatMap(row => selected.map(key => row[key])).filter(Number.isFinite);
  const limit = Number($("#scale").value) || Math.max(1, ...values.map(Math.abs)) * 1.12;
  const minimum = mode === "orientation" && $("#scale").value === "auto" ? Math.min(-1, ...values) : -limit;
  const maximum = mode === "orientation" && $("#scale").value === "auto" ? Math.max(1, ...values) : limit;
  const timeMaximum = Math.max(Number($("#duration").value) * 1000, data.at(-1)?.elapsed_ms || 1);
  const x = time => padding.l + time / timeMaximum * (width - padding.l - padding.r);
  const y = value => padding.t + (maximum - value) / (maximum - minimum) * (height - padding.t - padding.b);
  context.strokeStyle = "#2b4058";
  context.fillStyle = "#91a5ba";
  context.font = "12px monospace";
  for (let index = 0; index <= 4; index++) {
    const yy = padding.t + (height - padding.t - padding.b) * index / 4;
    context.beginPath();
    context.moveTo(padding.l, yy);
    context.lineTo(width - padding.r, yy);
    context.stroke();
    context.fillText((maximum - (maximum - minimum) * index / 4).toFixed(1), 5, yy + 4);
  }
  selected.forEach(key => {
    context.strokeStyle = colors[key];
    context.lineWidth = key === "magnitude" ? 3 : 2;
    context.setLineDash(key === "magnitude" ? [8, 5] : []);
    context.beginPath();
    let begun = false;
    data.forEach(row => {
      if (!Number.isFinite(row[key])) return;
      const px = x(row.elapsed_ms);
      const py = y(row[key]);
      begun ? context.lineTo(px, py) : context.moveTo(px, py);
      begun = true;
    });
    context.stroke();
  });
  context.setLineDash([]);
  context.fillText(`${(timeMaximum / 1000).toFixed(1)} s`, width - 70, height - 12);
}

function renderSummary() {
  const from = Number($("#from").value) * 1000;
  const to = Number($("#to").value) * 1000;
  const stats = summarize(samples, keys(), from, to);
  $("#summary").innerHTML = keys().map(key => {
    const stat = stats[key];
    return `<div>${key}<b>${stat ? `평균 ${stat.mean.toFixed(2)}<br>최소 ${stat.min.toFixed(2)} · 최대 ${stat.max.toFixed(2)}<br>n=${stat.n}` : "자료 없음"}</b></div>`;
  }).join("");
}

function example() {
  stop(true);
  samples = [];
  for (let time = 0; time <= 10000; time += 50) {
    if (mode === "orientation") {
      samples.push(normalizeSample(mode, time, {
        alpha: (time / 50) % 360,
        beta: 25 * Math.sin(time / 700),
        gamma: 15 * Math.cos(time / 900)
      }, "example"));
    } else {
      samples.push(normalizeSample(mode, time, {
        x: 2 * Math.sin(time / 350),
        y: 1.2 * Math.cos(time / 500),
        z: (mode === "acceleration" ? 9.8 : 32) + 3 * Math.sin(time / 900),
        includesGravity: mode === "acceleration"
      }, "example"));
    }
  }
  $("#to").value = 10;
  render();
}

function importFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      stop(true);
      const imported = parseCsv(reader.result);
      const importedMode = imported.find(row => ["acceleration", "orientation", "magnetometer"].includes(row.sensor_mode))?.sensor_mode;
      if (importedMode && importedMode !== mode) {
        mode = importedMode;
        document.querySelectorAll(".mode").forEach(button => button.classList.toggle("active", button.dataset.mode === mode));
        renderToggles();
      }
      samples = imported;
      $("#to").value = ((samples.at(-1)?.elapsed_ms || 0) / 1000).toFixed(1);
      render();
      $("#support").textContent = `● 가져온 ${mode} 자료 ${samples.length}개를 분석 중입니다.`;
    } catch (error) {
      $("#support").textContent = `× CSV 오류: ${error.message}`;
    }
  };
  reader.readAsText(file);
}

function download() {
  if (!samples.length) return;
  const headers = ["elapsed_ms", ...keys(), ...(mode === "acceleration" ? ["includes_gravity"] : []), "source", "sensor_mode"];
  const rows = [headers.join(","), ...samples.map(row => headers.map(header => header === "sensor_mode" ? mode : (row[header] ?? "")).join(","))];
  const url = URL.createObjectURL(new Blob(["\ufeff" + rows.join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${($("#title").value || "센서실험").replace(/[\\/:*?"<>|]/g, "_")}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

document.querySelectorAll(".mode").forEach(button => button.addEventListener("click", () => setMode(button.dataset.mode)));
$("#permission").onclick = () => preparePermission();
$("#start").onclick = start;
$("#pause").onclick = pause;
$("#stop").onclick = () => stop();
$("#clear").onclick = clear;
$("#example").onclick = example;
$("#download").onclick = download;
$("#file").onchange = event => event.target.files[0] && importFile(event.target.files[0]);
["from", "to", "scale", "duration"].forEach(id => $("#" + id).addEventListener("input", render));
document.addEventListener("visibilitychange", () => {
  if (document.hidden && state === "recording") pause();
});
window.addEventListener("pagehide", () => stop(true));
renderToggles();
diagnose();
render();
