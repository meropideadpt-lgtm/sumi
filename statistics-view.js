/* Presentation for the independent statistics page; calculations stay in statistics.js. */
function sumiStatisticsView(model, filters, helpers) {
  const esc = helpers.esc;
  const t = (key, params) => SumiI18n.t('stats.' + key, params);
  const text = (key, params) => esc(t(key, params));
  const number = value => SumiI18n.number(Number(value) || 0);
  const date = value => SumiI18n.date(value);
  const brand = (name, subscriptionId) => typeof helpers.logo === 'function' ? helpers.logo(name, subscriptionId) : '';
  const money = value => typeof value === 'number' && Number.isFinite(value) ? esc(helpers.money(value)) : text('noData');
  const selected = mode => filters.mode === mode ? 'selected' : '';
  const input = (id,label,type,value,attrs='') => `<div class="field"><label for="${id}">${text(label)}</label><input id="${id}" type="${type}" value="${esc(value || '')}" ${attrs}></div>`;
  const controls = filters.mode === 'year'
    ? input('statsYear','year','number',filters.year,'required min="1" max="9999" step="1"')
    : filters.mode === 'custom'
      ? input('statsStart','startDate','date',filters.start,'required min="0001-01-01" max="9999-12-31"') + input('statsEnd','endDate','date',filters.end,'required min="0001-01-01" max="9999-12-31"')
      : input('statsMonth','month','month',filters.month,'required min="0001-01" max="9999-12"');
  const filterHtml = `<form id="statsFilters" class="card stats-filters"><div class="field"><label for="statsMode">${text('period')}</label><select id="statsMode"><option value="month" ${selected('month')}>${text('byMonth')}</option><option value="year" ${selected('year')}>${text('byYear')}</option><option value="custom" ${selected('custom')}>${text('customRange')}</option></select></div>${controls}<button class="primary" type="submit">${text('show')}</button>${filters.error?`<p class="stats-filter-error" role="alert">${esc(SumiI18n.error(filters.error))}</p>`:''}</form>`;
  if (!model) return filterHtml + `<div class="card section stats-empty" data-stats-empty>${text('invalidRange')}</div>`;

  const range = model.range || {};
  const rangeText = range.start && range.effectiveEnd && range.start <= range.effectiveEnd ? t('range', {start:date(range.start), end:date(range.effectiveEnd)}) : t('selectedRange');
  if(!model.hasData)return filterHtml+`<p class="stats-period small">${esc(rangeText)}</p><div class="card section stats-empty" data-stats-empty>${text('emptyPeriod')}</div>`;
  const coverage = model.partial && model.hasCostData
    ? `<p class="stats-explanation" data-stats-partial>${text('coverage',{known:number(model.knownDays),total:number(model.totalDays)})}</p>` : '';
  const costFxWarning = model.missingFx
    ? `<p class="stats-explanation" data-stats-missing-fx>${text('costFxWarning',{currencies:model.missingCurrencies?.length?t('currencyList',{currencies:model.missingCurrencies.join(', ')}):''})}</p>` : '';
  const paidFxWarning = model.paidUnconvertedCount > 0
    ? `<p class="stats-explanation" data-paid-unconverted>${text('paidFxWarning',{count:number(model.paidUnconvertedCount),amount:helpers.money(model.paidKnownTotal)})}</p>` : '';
  const costValue = value => model.hasCostData ? value === null ? text(model.missingFx ? 'incompleteConversion' : 'noRecordedData') : money(value) : text('noData');
  const summary = `<div class="stats-summary section"><div class="card"><div class="card-title">${text('monthlyAverage')}</div><strong class="stats-metric" data-stat="monthly-average">${costValue(model.monthlyAverage)}</strong><p class="small">${text('monthlyAverageNote')}</p></div><div class="card"><div class="card-title">${text('amortizedTotal')}</div><strong class="stats-metric" data-stat="amortized-total">${costValue(model.amortizedTotal)}</strong><p class="small">${text('amortizedTotalNote')}</p></div><div class="card"><div class="card-title">${text('actuallyPaid')}</div><strong class="stats-metric" data-stat="paid-total">${model.hasPaymentData ? model.paidTotal === null ? text('incompleteConversion') : money(model.paidTotal) : text('noPayments')}</strong><p class="small" data-stat="paid-count">${model.hasPaymentData ? text('successfulCount',{count:number(model.paidCount)}) : text('noSuccessfulPayments')}</p></div></div>`;

  function chart(points, kind, titleKey, noteKey) {
    const list = Array.isArray(points) ? points : [];
    const finite = list.filter(point => typeof point.amount === 'number' && Number.isFinite(point.amount));
    const max = Math.max(0, ...finite.map(point => point.amount));
    const content = finite.length
      ? `<div class="stats-chart-scroll" tabindex="0" role="region" aria-label="${text('scrollChart',{title:t(titleKey)})}"><div class="stats-chart" style="--stats-columns:${Math.max(list.length,1)}">${list.map(point => {
          const known = typeof point.amount === 'number' && Number.isFinite(point.amount);
          const value = known ? helpers.money(point.amount) : t(point.missingFx ? 'unconvertible' : 'unrecorded');
          const label = kind === 'monthly' ? SumiI18n.date(point.key+'-01',{year:'numeric',month:'short'}) : SumiI18n.date(point.key+'-01-01',{year:'numeric'});
          const height = known && max > 0 ? Math.max(0,Math.min(100,point.amount/max*100)) : 0;
          return `<div class="stats-chart-point"><span class="stats-chart-value">${esc(value)}</span><div class="stats-bar-track">${known?`<div class="stats-bar" style="height:${height}%" role="img" aria-label="${esc(label+' '+value+(point.partial?t('partialDates'):''))}"></div>`:'<span class="stats-chart-unknown" aria-hidden="true">—</span>'}</div><span class="stats-chart-label">${esc(label)}</span>${point.partial?`<span class="stats-chart-partial">${text('partial')}</span>`:'<span class="stats-chart-partial" aria-hidden="true">&nbsp;</span>'}</div>`;
        }).join('')}</div></div>`
      : `<div class="stats-empty">${text(list.some(point=>point.missingFx)?'trendMissingFx':'noTrendData')}</div>`;
    return `<section class="card stats-chart-card" data-chart="${kind}"><div class="section-title"><h2>${text(titleKey)}</h2></div>${content}<p class="note">${text(noteKey)}</p></section>`;
  }
  function shares(list, kind, titleKey) {
    const rows = Array.isArray(list) ? list : [];
    const content = rows.length ? `<div class="stats-share-list">${rows.map(row => {
      const known = typeof row.amount === 'number' && Number.isFinite(row.amount);
      const ratio = typeof row.percentage === 'number' && Number.isFinite(row.percentage) ? Math.max(0,Math.min(100,row.percentage)) : null;
      const label = kind === 'service' ? `<div class="stats-service">${brand(row.name,row.subscriptionId)}<span>${esc(row.name)}</span></div>` : `<span>${esc(SumiI18n.category(row.name))}</span>`;
      return `<div class="stats-share-row"><div class="stats-share-label">${label}<strong>${known?money(row.amount):text('unconvertible')}${ratio!==null?' · '+esc(SumiI18n.number(ratio/100,{style:'percent',minimumFractionDigits:1,maximumFractionDigits:1})):''}</strong></div><div class="stats-share-track" aria-hidden="true">${ratio!==null?`<div style="width:${ratio}%"></div>`:''}</div></div>`;
    }).join('')}</div>` : `<div class="stats-empty">${text('noCostData')}</div>`;
    return `<section class="card" data-shares="${kind}"><div class="section-title"><h2>${text(titleKey)}</h2></div>${content}<p class="note">${text(model.missingFx?'sharesMissingFxNote':'sharesNote')}</p></section>`;
  }
  const payments = Array.isArray(model.paymentRows) ? model.paymentRows : [];
  const paidRows = payments.length ? `<div class="stats-payments">${payments.map(row => {
    const p = row.payment;
    const original = esc(helpers.original(p.amount,p.currency));
    const converted = typeof row.amount === 'number' && Number.isFinite(row.amount) ? money(row.amount) : text('unconverted');
    const rateNote = p.fxSnapshot?.status === 'available'
      ? p.fxSnapshot.provider === 'identity' ? text('identityRate') : text('confirmationRate',{date:date(p.fxSnapshot.date || '')})
      : text(p.fxSnapshot?.status === 'unavailable' ? 'noRateAtConfirmation' : 'legacyRateMissing');
    return `<div class="payment" data-payment-id="${esc(p.id)}"><div class="stats-service">${brand(p.name,p.subscriptionId)}<div class="stats-service-copy"><strong>${esc(p.name)}</strong><div class="small">${esc(date(p.date))} · ${original}</div><div class="small">${rateNote}</div></div></div><strong>${converted}</strong></div>`;
  }).join('')}</div>` : `<div class="stats-empty">${text('noPaymentsInPeriod')}</div>`;
  const originalTotals = model.originalCurrencyTotals?.length ? `<div class="stats-original-totals" aria-label="${text('originalCurrencyTotals')}">${model.originalCurrencyTotals.map(row=>`<span class="pill">${text('originalTotal',{amount:helpers.original(row.amount,row.currency),count:number(row.count)})}</span>`).join('')}</div>` : '';
  return filterHtml + `<p class="stats-period small">${esc(rangeText)}${range.end && range.effectiveEnd && range.end > range.effectiveEnd?' · '+text('futureExcluded'):''}</p>` + summary
    + `<section class="stats-section section"><div class="section-title"><h2>${text('amortizedHeading')}</h2></div><p class="note">${text('amortizedExplanation')}</p>${coverage}${costFxWarning}<div class="stats-layout">${chart(model.monthlyTrend,'monthly','monthlyTrend','monthlyTrendNote')}${chart(model.annualTrend,'annual','annualTrend','annualTrendNote')}${shares(model.serviceShares,'service','serviceShares')}${shares(model.categoryShares,'category','categoryShares')}</div></section>`
    + `<section class="card section stats-paid"><div class="section-title"><h2>${text('paidHeading')}</h2><span class="small">${text('successOnly')}</span></div><p class="note">${text('paidExplanation')}</p>${paidFxWarning}${originalTotals}${paidRows}</section>`;
}
if (typeof module !== 'undefined' && module.exports) module.exports = sumiStatisticsView;
