/* Presentation for the independent statistics page; calculations stay in statistics.js. */
function sumiStatisticsView(model, filters, helpers) {
  const esc = helpers.esc;
  const money = value => typeof value === 'number' && Number.isFinite(value) ? esc(helpers.money(value)) : '暂无数据';
  const selected = mode => filters.mode === mode ? 'selected' : '';
  const input = (id,label,type,value,attrs='') => `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="${type}" value="${esc(value || '')}" ${attrs}></div>`;
  const controls = filters.mode === 'year'
    ? input('statsYear','年份','number',filters.year,'required min="1" max="9999" step="1"')
    : filters.mode === 'custom'
      ? input('statsStart','开始日期','date',filters.start,'required min="0001-01-01" max="9999-12-31"') + input('statsEnd','结束日期','date',filters.end,'required min="0001-01-01" max="9999-12-31"')
      : input('statsMonth','月份','month',filters.month,'required min="0001-01" max="9999-12"');
  const filterHtml = `<form id="statsFilters" class="card stats-filters"><div class="field"><label for="statsMode">统计期间</label><select id="statsMode"><option value="month" ${selected('month')}>按月份</option><option value="year" ${selected('year')}>按年份</option><option value="custom" ${selected('custom')}>自定义范围</option></select></div>${controls}<button class="primary" type="submit">查看统计</button>${filters.error?`<p class="stats-filter-error" role="alert">${esc(filters.error)}</p>`:''}</form>`;
  if (!model) return filterHtml + '<div class="card section stats-empty" data-stats-empty>请选择有效的统计日期范围。</div>';

  const range = model.range || {};
  const rangeText = range.start && range.effectiveEnd && range.start <= range.effectiveEnd ? `${range.start} 至 ${range.effectiveEnd}` : '所选日期范围';
  if(!model.hasData)return filterHtml+`<p class="stats-period small">${esc(rangeText)}</p><div class="card section stats-empty" data-stats-empty>所选期间暂无记录。添加订阅或记录付款后即可查看。</div>`;
  const coverage = model.partial && model.hasCostData
    ? `<p class="stats-explanation" data-stats-partial>该期间仅有 ${Number(model.knownDays) || 0} / ${Number(model.totalDays) || 0} 天的完整订阅记录；趋势仅展示已记录部分，不补造过去的数据。</p>` : '';
  const costFxWarning = model.missingFx
    ? `<p class="stats-explanation" data-stats-missing-fx>部分订阅缺少可用汇率${model.missingCurrencies?.length?'（'+model.missingCurrencies.map(esc).join('、')+'）':''}，无法完整换算费用或占比。请在设置中检查汇率状态。</p>` : '';
  const paidFxWarning = model.paidUnconvertedCount > 0
    ? `<p class="stats-explanation" data-paid-unconverted>${Number(model.paidUnconvertedCount)} 笔成功付款未保存可用的历史换算记录，无法汇总为完整金额；原币金额仍保留。已换算部分：${money(model.paidKnownTotal)}。</p>` : '';
  const summary = `<div class="stats-summary section"><div class="card"><div class="card-title">平均每月订阅成本</div><strong class="stats-metric" data-stat="monthly-average">${model.hasCostData ? model.monthlyAverage === null ? model.missingFx ? '无法完整换算' : '暂无已记录数据' : money(model.monthlyAverage) : '暂无数据'}</strong><p class="small">按已记录日期加权的月均成本</p></div><div class="card"><div class="card-title">期间摊销成本</div><strong class="stats-metric" data-stat="amortized-total">${model.hasCostData ? model.amortizedTotal === null ? model.missingFx ? '无法完整换算' : '暂无已记录数据' : money(model.amortizedTotal) : '暂无数据'}</strong><p class="small">按周期分摊至所选期间</p></div><div class="card"><div class="card-title">实际已支付</div><strong class="stats-metric" data-stat="paid-total">${model.hasPaymentData ? model.paidTotal === null ? '无法完整换算' : money(model.paidTotal) : '暂无付款'}</strong><p class="small" data-stat="paid-count">${model.hasPaymentData ? `${Number(model.paidCount)} 次成功付款` : '暂无成功付款记录'}</p></div></div>`;

  function chart(points, kind, title, note) {
    const list = Array.isArray(points) ? points : [];
    const finite = list.filter(point => typeof point.amount === 'number' && Number.isFinite(point.amount));
    const max = Math.max(0, ...finite.map(point => point.amount));
    const content = finite.length
      ? `<div class="stats-chart-scroll" tabindex="0" role="region" aria-label="${title}，可横向滚动"><div class="stats-chart" style="--stats-columns:${Math.max(list.length,1)}">${list.map(point => {
          const known = typeof point.amount === 'number' && Number.isFinite(point.amount);
          const value = known ? money(point.amount) : point.missingFx ? '无法换算' : '未记录';
          const height = known && max > 0 ? Math.max(0,Math.min(100,point.amount/max*100)) : 0;
          return `<div class="stats-chart-point"><span class="stats-chart-value">${value}</span><div class="stats-bar-track">${known?`<div class="stats-bar" style="height:${height}%" role="img" aria-label="${esc(point.key)} ${value}${point.partial?'，部分日期':''}"></div>`:'<span class="stats-chart-unknown" aria-hidden="true">—</span>'}</div><span class="stats-chart-label">${esc(point.key)}</span>${point.partial?'<span class="stats-chart-partial">部分</span>':'<span class="stats-chart-partial" aria-hidden="true">&nbsp;</span>'}</div>`;
        }).join('')}</div></div>`
      : `<div class="stats-empty">${list.some(point=>point.missingFx)?'缺少可用汇率，暂不能展示该趋势。':'该期间尚无可展示的成本记录。'}</div>`;
    return `<section class="card stats-chart-card" data-chart="${kind}"><div class="section-title"><h2>${title}</h2></div>${content}<p class="note">${note}</p></section>`;
  }
  function shares(list, kind, title) {
    const rows = Array.isArray(list) ? list : [];
    const content = rows.length ? `<div class="stats-share-list">${rows.map(row => {
      const known = typeof row.amount === 'number' && Number.isFinite(row.amount);
      const ratio = typeof row.percentage === 'number' && Number.isFinite(row.percentage) ? Math.max(0,Math.min(100,row.percentage)) : null;
      return `<div class="stats-share-row"><div class="stats-share-label"><span>${esc(row.name)}</span><strong>${known?money(row.amount):'无法换算'}${ratio!==null?' · '+ratio.toFixed(1)+'%':''}</strong></div><div class="stats-share-track" aria-hidden="true">${ratio!==null?`<div style="width:${ratio}%"></div>`:''}</div></div>`;
    }).join('')}</div>` : '<div class="stats-empty">该期间暂无费用记录。</div>';
    return `<section class="card" data-shares="${kind}"><div class="section-title"><h2>${title}</h2></div>${content}<p class="note">按所选期间已记录的摊销成本计算${model.missingFx?'，缺少汇率时不计算完整占比':''}。</p></section>`;
  }
  const payments = Array.isArray(model.paymentRows) ? model.paymentRows : [];
  const paidRows = payments.length ? `<div class="stats-payments">${payments.map(row => {
    const p = row.payment;
    const original = esc(helpers.original(p.amount,p.currency));
    const converted = typeof row.amount === 'number' && Number.isFinite(row.amount) ? money(row.amount) : '未换算';
    const rateNote = p.fxSnapshot?.status === 'available'
      ? p.fxSnapshot.provider === 'identity' ? '原币金额，无需换算' : '确认时参考汇率 · '+esc(p.fxSnapshot.date || '')
      : p.fxSnapshot?.status === 'unavailable' ? '确认时无可用汇率' : '旧记录未保存历史汇率';
    return `<div class="payment" data-payment-id="${esc(p.id)}"><div><strong>${esc(p.name)}</strong><div class="small">${esc(p.date)} · ${original}</div><div class="small">${rateNote}</div></div><strong>${converted}</strong></div>`;
  }).join('')}</div>` : '<div class="stats-empty">该期间暂无成功付款记录。</div>';
  const originalTotals = model.originalCurrencyTotals?.length ? `<div class="stats-original-totals" aria-label="按原始币种汇总">${model.originalCurrencyTotals.map(row=>`<span class="pill">${esc(helpers.original(row.amount,row.currency))} · ${Number(row.count)} 笔</span>`).join('')}</div>` : '';
  return filterHtml + `<p class="stats-period small">${esc(rangeText)}${range.end && range.effectiveEnd && range.end > range.effectiveEnd?' · 未来日期不计入统计':''}</p>` + summary
    + `<section class="stats-section section"><div class="section-title"><h2>按周期摊销的订阅成本</h2></div><p class="note">订阅金额按周期分摊，历史计划使用当前参考汇率换算；这不是实际扣款金额。历史从开始记录之日起展示。</p>${coverage}${costFxWarning}<div class="stats-layout">${chart(model.monthlyTrend,'monthly','月度平均订阅成本趋势','展示已记录日期的月均成本水平；部分月份不会被当成完整历史。')}${chart(model.annualTrend,'annual','年度订阅成本趋势','展示各年已记录日期的累计摊销成本，未记录或未来日期不估填。')}${shares(model.serviceShares,'service','各订阅服务费用占比')}${shares(model.categoryShares,'category','各订阅类别费用占比')}</div></section>`
    + `<section class="card section stats-paid"><div class="section-title"><h2>实际已经支付的金额</h2><span class="small">仅成功付款</span></div><p class="note">以实际付款日期筛选。换算采用确认时保存的汇率，后续刷新不会改写历史金额；未保存历史汇率的旧记录不按当前汇率补算。</p>${paidFxWarning}${originalTotals}${paidRows}</section>`
    + (!model.hasData?'<p class="stats-empty" data-stats-empty>所选期间暂无记录。添加订阅或记录付款后即可查看。</p>':'');
}
if (typeof module !== 'undefined' && module.exports) module.exports = sumiStatisticsView;
