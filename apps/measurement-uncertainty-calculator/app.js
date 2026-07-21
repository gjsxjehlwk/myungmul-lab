import { calculateStats, csvEscape, formatByUncertainty, parseMeasurements } from "./stats.js";

const $ = (selector) => document.querySelector(selector);
const fields = ["title", "quantity", "unit", "true-value", "measurements", "cause", "improvement"];
const example = { title: "진자의 주기 반복 측정", quantity: "주기", unit: "s", trueValue: "2.00", values: "2.03, 1.98, 2.01, 2.04, 1.97, 2.00, 2.02, 1.99" };
let current = null;

function format(value, uncertainty = current?.sd) {
  return value === null ? "계산 불가" : formatByUncertainty(value, uncertainty);
}

function renderCards(stats, unit) {
  const percent = (value) => value === null ? "정의되지 않음" : `${formatByUncertainty(value, Math.max(value * .01, .01))}%`;
  const items = [
    ["표본 수", `${stats.n}회`], ["평균", `${format(stats.mean)} ${unit}`],
    ["최솟값 · 최댓값", `${format(stats.min)} · ${format(stats.max)} ${unit}`], ["범위", `${format(stats.range)} ${unit}`],
    ["표본표준편차 s", stats.sd === null ? "n≥2 필요" : `${format(stats.sd, stats.sd)} ${unit}`],
    ["표준오차 SE", stats.se === null ? "n≥2 필요" : `${format(stats.se, stats.se)} ${unit}`],
    ["상대불확도", percent(stats.relativeUncertainty)], ["상대오차", percent(stats.relativeError)]
  ];
  $("#cards").innerHTML = items.map(([label, value]) => `<div class="stat"><div class="label">${label}</div><div class="value">${value}</div></div>`).join("");
}

function svgEl(name, attrs = {}, text = "") {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  node.textContent = text;
  return node;
}

function renderChart(values, stats, unit) {
  const svg = $("#chart"); svg.replaceChildren();
  const width = 800, height = 300, left = 60, right = 24, top = 28, bottom = 48;
  const spread = stats.max - stats.min || Math.max(Math.abs(stats.mean) * .1, 1);
  const lo = Math.min(stats.min, stats.sd === null ? stats.min : stats.mean - stats.sd) - spread * .12;
  const hi = Math.max(stats.max, stats.sd === null ? stats.max : stats.mean + stats.sd) + spread * .12;
  const x = (value) => left + (value - lo) / (hi - lo) * (width - left - right);
  const axisY = height - bottom;
  svg.append(svgEl("line", { x1:left, x2:width-right, y1:axisY, y2:axisY, stroke:"#91a097" }));
  for (let i=0;i<=4;i++) { const value=lo+(hi-lo)*i/4; const px=x(value); svg.append(svgEl("line",{x1:px,x2:px,y1:axisY,y2:axisY+7,stroke:"#91a097"})); svg.append(svgEl("text",{x:px,y:axisY+25,"text-anchor":"middle",fill:"#607067","font-size":"12"},`${Number(value.toPrecision(3))}`)); }
  if (stats.sd !== null) svg.append(svgEl("rect", { x:x(stats.mean-stats.sd), y:top, width:Math.max(1,x(stats.mean+stats.sd)-x(stats.mean-stats.sd)), height:axisY-top, fill:"#dcebdd" }));
  svg.append(svgEl("line",{x1:x(stats.mean),x2:x(stats.mean),y1:top,y2:axisY,stroke:"#12372a","stroke-width":"3"}));
  values.forEach((value,index)=>{ const row=index%4; svg.append(svgEl("circle",{cx:x(value),cy:axisY-24-row*36,r:8,fill:"#e86f51",stroke:"white","stroke-width":"2"})); });
  svg.append(svgEl("text",{x:width-right,y:height-10,"text-anchor":"end",fill:"#607067","font-size":"12"},unit || "측정값"));
  svg.setAttribute("aria-label", `${values.length}개 측정값. 평균 ${stats.mean}${unit ? ` ${unit}` : ""}`);
}

function update() {
  const parsed = parseMeasurements($("#measurements").value);
  const message = $("#input-message");
  if (parsed.errors.length) {
    message.textContent = parsed.errors.map(e => `${e.index}번째 '${e.token}'`).join(", ") + "은(는) 유한한 숫자가 아닙니다.";
    current = null; return;
  }
  if (!parsed.values.length) { message.textContent = "측정값을 한 개 이상 입력하세요."; current = null; $("#cards").replaceChildren(); $("#chart").replaceChildren(); return; }
  message.textContent = parsed.values.length === 1 ? "값이 1개이므로 표본표준편차와 표준오차는 계산하지 않습니다." : "";
  const trueRaw = $("#true-value").value;
  current = calculateStats(parsed.values, trueRaw === "" ? null : Number(trueRaw));
  renderCards(current, $("#unit").value.trim()); renderChart(parsed.values, current, $("#unit").value.trim());
  $("#result-summary").textContent = `${parsed.values.length}회 측정 · 평균 ${format(current.mean)} ${$("#unit").value.trim()}`;
}

function downloadCsv() {
  const parsed = parseMeasurements($("#measurements").value); if (!current || parsed.errors.length) return;
  const meta = [["탐구 제목",$("#title").value],["측정량",$("#quantity").value],["단위",$("#unit").value],["참값",$("#true-value").value],["평균",current.mean],["표본표준편차",current.sd ?? ""],["표준오차",current.se ?? ""],["상대불확도(%)",current.relativeUncertainty ?? ""],["상대오차(%)",current.relativeError ?? ""],["오차 원인",$("#cause").value],["개선 방법",$("#improvement").value]];
  const rows = [...meta,[],["측정 번호","원자료"],...parsed.values.map((value,index)=>[index+1,value])];
  const csv = "\ufeff" + rows.map(row=>row.map(csvEscape).join(",")).join("\r\n");
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})); const a=document.createElement("a"); a.href=url; a.download=`${($("#title").value||"측정결과").replace(/[\\/:*?"<>|]/g,"_")}.csv`; a.click(); URL.revokeObjectURL(url);
}

fields.forEach(id => $("#"+id).addEventListener("input", update));
$("#example").addEventListener("click",()=>{ $("#title").value=example.title; $("#quantity").value=example.quantity; $("#unit").value=example.unit; $("#true-value").value=example.trueValue; $("#measurements").value=example.values; update(); });
$("#reset").addEventListener("click",()=>{ fields.forEach(id=>$("#"+id).value=""); update(); $("#title").focus(); });
$("#download").addEventListener("click",downloadCsv); $("#print").addEventListener("click",()=>window.print());
update();
