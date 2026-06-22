const skuTemplate = document.querySelector("#skuRowTemplate");
const skuRows = document.querySelector("#skuRows");
const currency = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  maximumFractionDigits: 0,
});

const demoSkus = [
  {
    sku: "SERUM-30ML",
    price: 299,
    cogs: 58,
    fulfillment: 32,
    returnCost: 9,
    traffic: 32000,
    elasticity: 1.3,
    competitorMedian: 329,
    discountRatio: 42,
  },
  {
    sku: "BAG-MINI",
    price: 189,
    cogs: 72,
    fulfillment: 29,
    returnCost: 15,
    traffic: 18000,
    elasticity: 0.7,
    competitorMedian: 219,
    discountRatio: 86,
  },
  {
    sku: "LAMP-PLUS",
    price: 459,
    cogs: 224,
    fulfillment: 76,
    returnCost: 22,
    traffic: 7600,
    elasticity: 0.5,
    competitorMedian: 399,
    discountRatio: 67,
  },
];

const csvTemplateRows = [
  ["sku", "price", "cogs", "fulfillment", "returnCost", "traffic", "elasticity", "competitorMedian", "discountRatio"],
  ["SERUM-30ML", "299", "58", "32", "9", "32000", "1.3", "329", "42"],
];

const fieldIds = [
  "paymentRate",
  "paymentFixed",
  "baselineCvr",
  "monthlyVisitors",
  "freeShippingThreshold",
  "aovMean",
  "aovMedian",
  "nearBelowShare",
  "qualifiedShare",
  "avgShippingCost",
  "shippingDropoff",
  "fulfillmentError",
];

function numberValue(value, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pct(value) {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value * 100)}%`;
}

function getSettings() {
  return Object.fromEntries(fieldIds.map((id) => [id, numberValue(document.querySelector(`#${id}`).value)]));
}

function createSkuRow(data = {}) {
  const row = skuTemplate.content.firstElementChild.cloneNode(true);
  row.querySelectorAll("input").forEach((input) => {
    const key = input.dataset.field;
    input.value = data[key] ?? "";
    input.addEventListener("input", render);
  });
  row.querySelector(".remove-row").addEventListener("click", () => {
    row.remove();
    render();
  });
  skuRows.append(row);
}

function getSkuRows() {
  return [...skuRows.querySelectorAll("tr")]
    .map((row) => {
      const values = {};
      row.querySelectorAll("input").forEach((input) => {
        const key = input.dataset.field;
        values[key] = key === "sku" ? input.value.trim() : numberValue(input.value);
      });
      return { row, ...values };
    })
    .filter((item) => item.sku || item.price || item.cogs);
}

function diagnoseSku(item, settings) {
  const paymentFee = item.price * (settings.paymentRate / 100) + settings.paymentFixed;
  const cm = item.price - item.cogs - item.fulfillment - item.returnCost - paymentFee;
  const cmPct = item.price > 0 ? cm / item.price : 0;
  const marginTier = cmPct >= 0.45 ? "厚" : cmPct >= 0.3 ? "中" : "薄";
  const competitorGap = item.competitorMedian > 0 ? (item.price - item.competitorMedian) / item.competitorMedian : 0;
  const discountLevel = item.discountRatio < 50 ? "高折扣依赖" : item.discountRatio <= 80 ? "中折扣依赖" : "低折扣依赖";
  const sampleWeeks = estimateWeeks(item.traffic, settings.baselineCvr);
  const testability = sampleWeeks <= 4 ? "高" : sampleWeeks <= 8.5 ? "中" : "低";

  let direction = "小幅双向";
  let mechanism = "CM 空间中等，建议用 10% 梯度验证价格敏感度。";
  let changePct = 0.1;

  if (marginTier === "厚" && item.elasticity >= 1) {
    direction = item.discountRatio < 60 ? "降价去折扣" : "降价换量";
    mechanism = "CM 较厚且弹性偏高，新增销量更可能覆盖单均 CM 下降。";
    changePct = -0.1;
  } else if (marginTier === "薄") {
    direction = "涨价或保价";
    mechanism = "CM 偏薄，降价会快速吃掉贡献毛利，优先测试涨价容忍度。";
    changePct = 0.1;
  } else if (competitorGap < -0.15 || item.elasticity < 1) {
    direction = "小幅涨价";
    mechanism = "价格低于市场锚点或弹性偏低，存在利润优先的涨价空间。";
    changePct = 0.1;
  } else if (competitorGap > 0.15) {
    direction = "保价观察";
    mechanism = "相对竞品已偏贵，涨价空间有限，先从运费或价值表达找机会。";
    changePct = 0;
  }

  const priceDelta = Math.abs(item.price * changePct);
  const newCm = cm + (changePct >= 0 ? priceDelta : -priceDelta);
  const breakEven = changePct > 0 ? priceDelta / newCm : priceDelta / Math.max(newCm, 1);
  const breakEvenText =
    changePct > 0
      ? `涨价后允许 CVR 最多跌 ${pct(breakEven)}`
      : changePct < 0
        ? `降价后 CVR 至少涨 ${pct(breakEven)}`
        : "暂不建议做价格梯度";

  return {
    ...item,
    paymentFee,
    cm,
    cmPct,
    marginTier,
    competitorGap,
    discountLevel,
    direction,
    mechanism,
    changePct,
    breakEvenText,
    sampleWeeks,
    testability,
  };
}

function estimateWeeks(monthlyTraffic, baselineCvr) {
  if (monthlyTraffic <= 0 || baselineCvr <= 0) return Infinity;
  const requiredVisitorsTotal = baselineCvr >= 2 ? 60000 : 90000;
  return (requiredVisitorsTotal / monthlyTraffic) * 4.35;
}

function priorityPill(priority) {
  if (priority === "高") return "green";
  if (priority === "中") return "amber";
  return "red";
}

function diagnoseShipping(settings) {
  const threshold = settings.freeShippingThreshold;
  const aovMean = settings.aovMean;
  const aovMedian = settings.aovMedian;
  const nearBelow = settings.nearBelowShare / 100;
  const qualified = settings.qualifiedShare / 100;
  const shippingRatio = aovMean > 0 ? settings.avgShippingCost / aovMean : 0;
  const fulfillmentReliable = settings.fulfillmentError <= 10;

  let status = "门槛基本合适";
  let recommendation = Math.ceil((aovMean * 1.08) / 10) * 10;
  let mechanism = "先用现门槛作为对照，测试略高于 AOV 的新门槛是否能推动凑单。";

  if (qualified > 0.8) {
    status = "门槛偏低";
    recommendation = Math.ceil((aovMean * 1.12) / 10) * 10;
    mechanism = "多数订单已达免邮，可能在无效承担运费成本，优先测试上移门槛。";
  } else if (qualified < 0.3 || threshold > aovMean * 1.35) {
    status = "门槛偏高";
    recommendation = Math.ceil((Math.max(aovMedian, aovMean * 0.95)) / 10) * 10;
    mechanism = "门槛离主流订单太远，免邮激励弱，优先测试下移或阶梯免邮。";
  } else if (nearBelow >= 0.15 && threshold <= aovMean * 1.1) {
    status = "有上移空间";
    recommendation = Math.ceil((aovMean * 1.1) / 10) * 10;
    mechanism = "门槛下方紧邻订单密集，具备凑单潜力，适合测试略高于 AOV 的门槛。";
  }

  const leverage = shippingRatio > 0.15 || settings.shippingDropoff >= 40 ? "高" : shippingRatio > 0.08 ? "中" : "低";
  const risk = !fulfillmentReliable
    ? "履约模型误差超过 10%，先校准 weight×zone 成本再推实验。"
    : "履约模型误差可接受，可以进入门槛变体测算。";

  return {
    status,
    recommendation,
    mechanism,
    shippingRatio,
    leverage,
    risk,
    fulfillmentReliable,
    nearBelow,
    qualified,
  };
}

function renderSkuResult(diagnosed) {
  const color = diagnosed.testability === "高" ? "green" : diagnosed.testability === "中" ? "amber" : "red";
  return `
    <strong>${diagnosed.marginTier}毛利 · ${diagnosed.direction}</strong>
    CM ${currency.format(diagnosed.cm)} / ${pct(diagnosed.cmPct)}，
    可测性 <span class="pill ${color}">${diagnosed.testability}</span><br />
    ${diagnosed.breakEvenText}
  `;
}

function renderShippingCard(result) {
  document.querySelector("#shippingDiagnosis").innerHTML = `
    <h3>${result.status}</h3>
    <p>候选新门槛：<b>${currency.format(result.recommendation)}</b>。${result.mechanism}</p>
    <div class="signal-list">
      <div class="signal"><span>门槛下方紧邻订单</span><b>${pct(result.nearBelow)}</b></div>
      <div class="signal"><span>免邮达标率</span><b>${pct(result.qualified)}</b></div>
      <div class="signal"><span>运费成本 / AOV</span><b>${pct(result.shippingRatio)}</b></div>
      <div class="signal"><span>运费策略杠杆</span><b>${result.leverage}</b></div>
      <div class="signal"><span>成本模型</span><b>${result.fulfillmentReliable ? "可用" : "需校准"}</b></div>
    </div>
    <p style="margin-top:12px">${result.risk}</p>
  `;
}

function renderPriceDecisionBoard(items) {
  const board = document.querySelector("#priceDecisionBoard");
  const candidates = items
    .filter((item) => item.testability !== "低" && item.cm > 0 && item.changePct !== 0)
    .sort((a, b) => {
      const score = { 高: 3, 中: 2, 低: 1 };
      return score[b.testability] - score[a.testability] || b.cmPct - a.cmPct;
    });
  const top = candidates[0];
  const highCount = items.filter((item) => item.testability === "高" && item.changePct !== 0).length;
  const mediumCount = items.filter((item) => item.testability === "中" && item.changePct !== 0).length;
  const raiseCount = items.filter((item) => item.changePct > 0).length;
  const cutCount = items.filter((item) => item.changePct < 0).length;
  const thinCount = items.filter((item) => item.marginTier === "薄").length;

  const topTitle = top ? `${top.sku || "未命名 SKU"} · ${top.direction}` : "暂不建议单品测试";
  const topBody = top
    ? `${top.mechanism} 建议先用 ${top.changePct > 0 ? "+" : ""}${pct(top.changePct)} 梯度验证。${top.breakEvenText}。`
    : "当前 SKU 池的流量、毛利或方向信号不足，先补成本口径、历史弹性或选择更高流量品。";
  const riskBody = thinCount
    ? `${thinCount} 个 SKU 属于薄毛利，原则上不建议做降价测试，优先涨价、保价或优化价值表达。`
    : "当前 SKU 池没有明显薄毛利压力，仍需确认 COGS、尾程和退货摊销口径准确。";

  board.innerHTML = `
    <article class="decision-card">
      <h3>首选动作</h3>
      <p>${topTitle}<br />${topBody}</p>
    </article>
    <article class="decision-card">
      <h3>SKU 池质量</h3>
      <p>高优先级 ${highCount} 个，中优先级 ${mediumCount} 个。优先让单次实验聚焦 1-3 个高流量 SKU。</p>
    </article>
    <article class="decision-card">
      <h3>价格方向</h3>
      <p>${raiseCount} 个偏涨价/保价，${cutCount} 个偏降价/去折扣。方向冲突时按 SKU 单独测试，不做全站混测。</p>
    </article>
    <article class="decision-card">
      <h3>风险提醒</h3>
      <p>${riskBody}</p>
    </article>
  `;
}

function renderPriceCandidates(items) {
  const list = document.querySelector("#priceCandidateList");
  const candidates = items
    .filter((item) => item.testability !== "低" && item.cm > 0 && item.changePct !== 0)
    .sort((a, b) => {
      const score = { 高: 3, 中: 2, 低: 1 };
      return score[b.testability] - score[a.testability] || b.cmPct - a.cmPct;
    });

  list.innerHTML = candidates.length
    ? candidates
      .map(
        (item) => `
        <article class="candidate-card">
          <h3>${item.sku || "未命名 SKU"}</h3>
          <div class="candidate-meta">
            <span class="pill ${priorityPill(item.testability)}">优先级${item.testability}</span>
            <span class="pill blue">${item.direction}</span>
            <span class="pill">${pct(item.cmPct)} CM</span>
            <span class="pill">${item.discountLevel}</span>
          </div>
          <p>${item.mechanism} 建议梯度：${item.changePct > 0 ? "+" : ""}${pct(item.changePct)}。${item.breakEvenText}。</p>
        </article>
      `
      )
      .join("")
    : `<div class="empty-state">还没有足够强的 SKU 候选。优先补月流量、成本或选择更大流量的爆品。</div>`;
}

function renderShippingActionPlan(shipping, settings) {
  const current = currency.format(settings.freeShippingThreshold);
  const recommended = currency.format(shipping.recommendation);
  const upperVariant = currency.format(Math.ceil((shipping.recommendation + 30) / 10) * 10);
  const lowerStep = currency.format(Math.max(0, Math.ceil((shipping.recommendation - 30) / 10) * 10));

  let action = "保守验证";
  let actionBody = `当前门槛可作为对照，测试 ${recommended} 是否改善 CM/Visitor。`;
  let variantBody = `对照：${current}。变体 1：${recommended} 免邮。变体 2：${upperVariant} 免邮。`;

  if (!shipping.fulfillmentReliable) {
    action = "先校准成本";
    actionBody = "履约模型误差超过可接受区间，先完成 weight×zone 校准和抽单核账，再判断门槛空间。";
    variantBody = "暂缓正式实验。先抽 5-10 单核账，并用承运商账单回校重量段和配送区成本。";
  } else if (shipping.status === "门槛偏高") {
    action = "下移或阶梯";
    actionBody = `免邮门槛离主流订单太远，优先测试 ${recommended} 或阶梯免邮，降低结账末段劝退。`;
    variantBody = `对照：${current}。变体 1：${recommended} 免邮。变体 2：满 ${lowerStep} 减半运费，满 ${recommended} 免邮。`;
  } else if (shipping.status === "门槛偏低" || shipping.status === "有上移空间") {
    action = "上移门槛";
    actionBody = `门槛下方有凑单空间，优先测试 ${recommended}，观察 AOV 提升能否覆盖新增免邮成本。`;
    variantBody = `对照：${current}。变体 1：${recommended} 免邮。变体 2：${upperVariant} 免邮。`;
  }

  document.querySelector("#shippingActionPlan").innerHTML = `
    <article class="decision-card">
      <h3>建议动作</h3>
      <p>${action}<br />${actionBody}</p>
    </article>
    <article class="decision-card">
      <h3>候选变体</h3>
      <p>${variantBody}</p>
    </article>
    <article class="decision-card">
      <h3>护栏指标</h3>
      <p>主指标看 CM/Visitor；护栏盯结账弃单、退款、客诉、免邮达标率和单均实际运费。</p>
    </article>
  `;
}

function exportPriceReport() {
  const settings = getSettings();
  const items = getSkuRows().map((item) => diagnoseSku(item, settings));
  const lines = [
    "# 价格诊断摘要",
    "",
    `生成时间：${new Date().toLocaleString("zh-CN")}`,
    "",
    "## SKU 候选",
    ...items.map(
      (item) =>
        `- ${item.sku || "未命名 SKU"}：CM ${currency.format(item.cm)} / ${pct(item.cmPct)}，${item.marginTier}毛利，建议 ${item.direction}，可测性 ${item.testability}。${item.breakEvenText}。`
    ),
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "价格诊断摘要.md";
  link.click();
  URL.revokeObjectURL(url);
}

function exportShippingReport() {
  const shipping = diagnoseShipping(getSettings());
  const lines = [
    "# 运费门槛诊断摘要",
    "",
    `生成时间：${new Date().toLocaleString("zh-CN")}`,
    "",
    `- 当前判断：${shipping.status}`,
    `- 候选新门槛：${currency.format(shipping.recommendation)}`,
    `- 运费策略杠杆：${shipping.leverage}`,
    `- 机制：${shipping.mechanism}`,
    `- 成本模型：${shipping.risk}`,
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "运费门槛诊断摘要.md";
  link.click();
  URL.revokeObjectURL(url);
}

function downloadCsvTemplate() {
  const csv = csvTemplateRows.map((row) => row.join(",")).join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "价格诊断SKU导入模板.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function parseCsv(text) {
  const rows = [];
  let current = "";
  let row = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(current.trim());
      current = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(current.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      current = "";
    } else {
      current += char;
    }
  }

  row.push(current.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function importCsv(file) {
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    const rows = parseCsv(String(reader.result || ""));
    const headers = rows.shift()?.map((header) => header.trim()) || [];
    const allowedFields = new Set([
      "sku",
      "price",
      "cogs",
      "fulfillment",
      "returnCost",
      "traffic",
      "elasticity",
      "competitorMedian",
      "discountRatio",
    ]);

    const imported = rows.map((row) => {
      const item = {};
      headers.forEach((header, index) => {
        if (allowedFields.has(header)) item[header] = header === "sku" ? row[index] : numberValue(row[index]);
      });
      return item;
    });

    if (!imported.length) return;
    skuRows.innerHTML = "";
    imported.forEach(createSkuRow);
    render();
  });
  reader.readAsText(file, "utf-8");
}

function render() {
  const settings = getSettings();
  const items = getSkuRows().map((item) => diagnoseSku(item, settings));
  const shipping = diagnoseShipping(settings);

  items.forEach((item) => {
    item.row.querySelector(".row-result").innerHTML = renderSkuResult(item);
  });

  const testableCount = items.filter((item) => item.testability === "高" && item.changePct !== 0).length;
  const avgCmPct = items.length ? items.reduce((sum, item) => sum + item.cmPct, 0) / items.length : 0;
  const weeks = estimateWeeks(settings.monthlyVisitors, settings.baselineCvr);

  document.querySelector("#testableCount").textContent = String(testableCount);
  document.querySelector("#avgCmPct").textContent = pct(avgCmPct);
  document.querySelector("#cycleHint").textContent = Number.isFinite(weeks) ? `${Math.ceil(weeks)} 周` : "待计算";
  document.querySelector("#shippingStatus").textContent = shipping.status;
  document.querySelector("#shippingRecommendation").textContent = currency.format(shipping.recommendation);
  document.querySelector("#shippingLeverage").textContent = shipping.leverage;
  document.querySelector("#shippingModel").textContent = shipping.fulfillmentReliable ? "可用" : "需校准";

  renderShippingCard(shipping);
  renderShippingActionPlan(shipping, settings);
  renderPriceDecisionBoard(items);
  renderPriceCandidates(items);
}

function loadDemo() {
  skuRows.innerHTML = "";
  demoSkus.forEach(createSkuRow);
  render();
}

document.querySelector("#addSku").addEventListener("click", () => {
  createSkuRow({
    sku: "",
    price: 0,
    cogs: 0,
    fulfillment: 0,
    returnCost: 0,
    traffic: 0,
    elasticity: 1,
    competitorMedian: 0,
    discountRatio: 80,
  });
  render();
});
document.querySelector("#loadDemo").addEventListener("click", loadDemo);
document.querySelector("#downloadCsvTemplate").addEventListener("click", downloadCsvTemplate);
document.querySelector("#exportPriceReport").addEventListener("click", exportPriceReport);
document.querySelector("#exportShippingReport").addEventListener("click", exportShippingReport);
document.querySelector("#importCsv").addEventListener("click", () => document.querySelector("#csvInput").click());
document.querySelector("#csvInput").addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (file) importCsv(file);
  event.target.value = "";
});
fieldIds.forEach((id) => document.querySelector(`#${id}`).addEventListener("input", render));
document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab-button").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelectorAll(".tool-view").forEach((view) => {
      view.classList.toggle("active", view.id === button.dataset.view);
    });
  });
});

loadDemo();
