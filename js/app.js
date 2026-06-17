// EBCI Water Quality — public-facing dashboard helpers
function gm(values){
  const v = values.filter(x => x > 0 && isFinite(x));
  if (!v.length) return null;
  const s = v.reduce((a,x)=>a + Math.log(x), 0);
  return Math.exp(s / v.length);
}
function parseSampleDate(x){
  if (x===null || x===undefined || x==='') return null;
  if (typeof x === 'number' && isFinite(x)) {
    const ms = Math.round((x - 25569) * 86400 * 1000);
    return new Date(ms);
  }
  const s = String(x).trim();
  let m;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m){
    const Y=+m[1], M=+m[2]-1, D=+m[3], h=+(m[4]||0), mi=+(m[5]||0), se=+(m[6]||0);
    return new Date(Y,M,D,h,mi,se);
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i);
  if (m){
    let M=+m[1], D=+m[2], Y=+m[3]; if(Y<100) Y=2000+Y;
    let h=+(m[4]||0), mi=+(m[5]||0), se=+(m[6]||0); const ap=(m[7]||'').toUpperCase();
    if(ap==='PM'&&h<12)h+=12; if(ap==='AM'&&h===12)h=0;
    return new Date(Y,M-1,D,h,mi,se);
  }
  const d = new Date(s);
  return isNaN(d)? null : d;
}
function norm(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]/g,''); }
function escapeHtml(s){
  return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}
function pickKey(row, aliases){
  const keys = Object.keys(row||{});
  for (const k of keys){ const n = norm(k); if (aliases.some(a => n===a || n.endsWith(a))) return k; }
  for (const k of keys){ const n = norm(k); if (aliases.some(a => n.includes(a))) return k; }
  return null;
}
function thresholds(){
  return (window.EBCI_CONFIG && window.EBCI_CONFIG.thresholds) || { stv:410, gm:126, legacy_single_sample:235 };
}
function palette(){
  return (window.EBCI_CONFIG && window.EBCI_CONFIG.palette) || { ok:'#2E7D32', caution:'#B45309', advisory:'#B91C1C', gmAdvisory:'#C2410C' };
}
function statusFor(val, gm30, n30){
  const T = thresholds();
  const P = palette();
  if (isFinite(val) && val >= T.stv) return {code:'Advisory', color:P.advisory};
  if (n30 >= 2 && gm30 != null && gm30 >= T.gm) return {code:'Advisory', color:(P.gmAdvisory || '#C2410C')};
  if (isFinite(val) && val >= T.legacy_single_sample && val < T.stv) return {code:'Caution', color:P.caution};
  return {code:'Good', color:P.ok};
}
function statusRank(status){ return {Advisory:0, Caution:1, Good:2}[status] ?? 3; }
function statusClass(status){ return String(status||'good').toLowerCase(); }
function siteStatusClass(siteOrStatus){
  if (siteOrStatus && typeof siteOrStatus === 'object') {
    if (siteOrStatus.status === 'Advisory' && siteOrStatus.driver === '30-day GM') return 'advisory gm-advisory';
    return statusClass(siteOrStatus.status);
  }
  return statusClass(siteOrStatus);
}
function publicGuidance(status){
  if(status === 'Advisory') return 'Avoid swimming or wading here right now.';
  if(status === 'Caution') return 'Use extra caution; consider waiting or limiting contact.';
  return 'Use normal precautions for natural waters.';
}

function statusDetails(val, gm30, n30, status){
  const T = thresholds();
  const valueText = formatNumber(val);
  const gmText = (n30 >= 2 && gm30 != null && isFinite(gm30)) ? formatNumber(gm30) : 'not calculated';
  const latestHigh = isFinite(val) && val >= T.stv;
  const gmHigh = n30 >= 2 && gm30 != null && isFinite(gm30) && gm30 >= T.gm;
  const cautionHigh = isFinite(val) && val >= T.legacy_single_sample && val < T.stv;

  if(status === 'Advisory'){
    if(latestHigh && gmHigh){
      return {
        driver:'Latest sample + 30-day GM',
        display_status:'Advisory (latest + GM)',
        reason:`Latest sample is ${valueText} CFU/100 mL and 30-day GM is ${gmText} CFU/100 mL; both are at or above Advisory thresholds.`
      };
    }
    if(gmHigh){
      return {
        driver:'30-day GM',
        display_status:'Advisory (30-day GM)',
        reason:`30-day GM is ${gmText} CFU/100 mL, at or above the GM Advisory threshold of ${T.gm}. The latest sample may look lower, but recent overall conditions are still elevated.`
      };
    }
    return {
      driver:'Latest sample',
      display_status:'Advisory (latest sample)',
      reason:`Latest sample is ${valueText} CFU/100 mL, at or above the single-sample Advisory threshold of ${T.stv}.`
    };
  }

  if(status === 'Caution'){
    return {
      driver:'Latest sample',
      display_status:'Caution (latest sample)',
      reason:`Latest sample is ${valueText} CFU/100 mL, which falls in the Caution range (${T.legacy_single_sample}–${T.stv - 1}).`
    };
  }

  if(n30 >= 2){
    return {
      driver:'Below thresholds',
      display_status:'Good',
      reason:`Latest sample is below the Caution range and the 30-day GM is ${gmText} CFU/100 mL, below the GM Advisory threshold of ${T.gm}.`
    };
  }
  return {
    driver:'Latest sample below Caution',
    display_status:'Good',
    reason:`Latest sample is below the Caution range. A 30-day GM needs at least 2 recent samples and is not currently calculated for this site.`
  };
}

function snapshotSentence(advCount, cauCount, total, latestAdvCount=0, gmAdvCount=0){
  if(total === 0) return 'No current site summaries are available.';
  if(advCount > 0){
    const pieces = [];
    if(latestAdvCount > 0) pieces.push(`${latestAdvCount} driven by the latest sample`);
    if(gmAdvCount > 0) pieces.push(`${gmAdvCount} driven by the 30-day GM`);
    const driverText = pieces.length ? ` (${pieces.join('; ')})` : '';
    const cautionText = cauCount > 0 ? ` ${cauCount} additional site${cauCount===1?' is':'s are'} in Caution.` : '';
    return `${advCount} of ${total} monitored site${total===1?'':'s'} currently ${advCount===1?'has':'have'} an Advisory status${driverText}.${cautionText} The boxes below show whether the concern is the newest sample or the 30-day GM.`;
  }
  if(cauCount > 0) return `${cauCount} of ${total} monitored site${total===1?'':'s'} currently ${cauCount===1?'has':'have'} a Caution status based on the latest sample. Use extra caution at the Caution site${cauCount===1?'':'s'} listed here.`;
  return `All ${total} monitored site${total===1?' is':'s are'} currently below the dashboard’s Caution and Advisory thresholds. Use normal precautions for natural rivers and streams.`;
}
function latestBandLabel(v){
  const T = thresholds();
  if(isFinite(v) && v >= T.stv) return 'Latest high';
  if(isFinite(v) && v >= T.legacy_single_sample) return 'Latest elevated';
  if(isFinite(v)) return 'Latest below Caution';
  return 'Latest unavailable';
}
function renderSiteChipList(id, sites, status, emptyText, metric=false){
  const el = document.getElementById(id);
  if(!el) return;
  el.classList.remove('loading');
  if(!sites.length){
    el.classList.add('empty');
    el.textContent = emptyText;
    return;
  }
  el.classList.remove('empty');
  el.innerHTML = sites.map(s => {
    const cls = siteStatusClass(s);
    const gmText = s.n30>=2 && s.gm30 ? formatNumber(s.gm30) : '—';
    const title = `${escapeHtml(s.waterbody)} • ${formatDate(s.latest_dt)} • ${escapeHtml(s.reason)}`;
    if(metric){
      return `<span class="site-chip metric ${cls}" title="${title}"><strong>${escapeHtml(s.site_name)}</strong><span>${latestBandLabel(s.latest_value)}: ${formatNumber(s.latest_value)}</span><span>30-day GM: ${gmText}</span></span>`;
    }
    return `<span class="site-chip ${cls}" title="${title}">${escapeHtml(s.site_name)}</span>`;
  }).join('');
}
function formatDate(d){ return d instanceof Date && !isNaN(d) ? d.toLocaleDateString() : '—'; }
function formatNumber(x){
  if(x == null || !isFinite(x)) return '—';
  if(x >= 1000) return Number(x).toLocaleString(undefined, {maximumFractionDigits:0});
  if(x >= 100) return Number(x).toFixed(0);
  if(x >= 10) return Number(x).toFixed(1).replace(/\.0$/,'');
  return Number(x).toFixed(1).replace(/\.0$/,'');
}
function setKpi(boxId, labelId, valueId, count, singular, plural, colorClass){
  const box = document.getElementById(boxId);
  const label = document.getElementById(labelId);
  const value = document.getElementById(valueId);
  if (!box || !label || !value) return;
  value.textContent = count;
  label.textContent = (count === 1 ? singular : plural);
  box.classList.remove('advisory','caution');
  if (colorClass && count > 0) box.classList.add(colorClass);
}

async function main(){
  const csvUrl = `data/ecoli_samples.csv?v=${Date.now()}`;
  let text = '';
  try{
    text = await (await fetch(csvUrl, {cache:'no-store'})).text();
  } catch(err){
    const snapshot = document.getElementById('snapshotText');
    if(snapshot) snapshot.textContent = 'Could not load data/ecoli_samples.csv. When testing locally, run the dashboard through a local web server instead of opening index.html directly.';
    renderSiteChipList('latestAdvisorySitesList', [], 'Advisory', 'Data could not be loaded.', true);
    renderSiteChipList('gmAdvisorySitesList', [], 'Advisory', 'Data could not be loaded.', true);
    renderSiteChipList('cautionSitesList', [], 'Caution', 'Data could not be loaded.', true);
    console.error(err);
    return;
  }

  const parsed = Papa.parse(text, {header:true, dynamicTyping:true, skipEmptyLines:true});
  const allRows = parsed.data || [];
  if (!allRows.length){ return; }

  const FIRST = allRows.find(r=>r && Object.keys(r).length>0) || allRows[0];
  const ecoliAliases = ['ecolicfu100ml','ecolimpn100ml','ecoli100ml','ecoli','e.coli(cfu/100ml)','ecolicfu','ecoli(cfu/100ml)','ecolicfu/100ml','ecolimpn','ecoliresult','result'];
  const dateAliases = ['sampledatetimelocal','sampledate','date','sample_date','collectiondate','datecollected'];
  const qualifierAliases = ['qualifier','qual','flag','symbol','ineq'];
  const siteNameAliases = ['sitename','location','site','monitoringsite'];
  const siteIdAliases = ['siteid','site_id','stationid','station'];

  const ecoliKey = pickKey(FIRST, ecoliAliases) || 'ecoli_cfu_100ml';
  const dateKey = pickKey(FIRST, dateAliases) || 'sample_datetime_local';
  const qualKey = pickKey(FIRST, qualifierAliases) || 'qualifier';
  const siteNameKey = pickKey(FIRST, siteNameAliases) || 'site_name';
  const siteIdKey = pickKey(FIRST, siteIdAliases) || 'site_id';

  const rows = allRows.filter(r=>r && (r[siteIdKey] || r[siteNameKey]));
  rows.forEach(r=>{
    r.__date = parseSampleDate(r[dateKey]);
    let v = Number(r[ecoliKey]);
    if(!isFinite(v)){ v = Number(String(r[ecoliKey]).replace(/[, ]/g,'')); }
    const q = String(r[qualKey]||'').trim();
    if(q==='<'){ v = Math.max(1, v/2); }
    r.__qual = q;
    r.__value = isFinite(v) ? v : null;
    r.__site_name = r[siteNameKey] || r[siteIdKey] || 'Site';
    r.__site_id = r[siteIdKey] || r.__site_name.toLowerCase().replace(/\s+/g,'-');
    r.lat = (r.lat==='' || r.lat==null)? null : Number(r.lat);
    r.lon = (r.lon==='' || r.lon==null)? null : Number(r.lon);
    r.waterbody = (r.waterbody && String(r.waterbody).trim().length>0) ? String(r.waterbody).trim() : 'Unspecified';
  });

  const bySite = {};
  for (const r of rows){
    (bySite[r.__site_id] ||= {meta:r, samples:[]});
    bySite[r.__site_id].samples.push(r);
  }
  for (const s of Object.values(bySite)){
    s.samples = s.samples.filter(x=>x.__date instanceof Date && !isNaN(x.__date) && isFinite(x.__value));
    s.samples.sort((a,b)=> b.__date - a.__date);
  }

  const siteSummaries = [];
  let mostRecent = null;
  for (const [site_id, o] of Object.entries(bySite)){
    if(!o.samples.length) continue;
    const latest = o.samples[0];
    if(!mostRecent || latest.__date > mostRecent) mostRecent = latest.__date;
    const cutoff = new Date(latest.__date.getTime() - 30*24*3600*1000);
    const vals30 = o.samples.filter(s=>s.__date >= cutoff).map(s=>s.__value);
    const n30 = vals30.filter(v => isFinite(v) && v > 0).length;
    const gm30 = gm(vals30);
    const stat = statusFor(latest.__value, gm30, n30);
    const detail = statusDetails(latest.__value, gm30, n30, stat.code);
    siteSummaries.push({
      site_id,
      site_name: latest.__site_name,
      waterbody: latest.waterbody || 'Unspecified',
      lat: latest.lat,
      lon: latest.lon,
      latest_value: latest.__value,
      latest_dt: latest.__date,
      gm30,
      n30,
      status: stat.code,
      display_status: detail.display_status,
      driver: detail.driver,
      reason: detail.reason,
      color: stat.color,
      guidance: publicGuidance(stat.code),
      series: o.samples.slice().reverse()
    });
  }

  const T = thresholds();
  const latestAdvisorySites = siteSummaries.filter(s=>s.status==='Advisory' && isFinite(s.latest_value) && s.latest_value >= T.stv);
  const gmAdvisorySites = siteSummaries.filter(s=>s.status==='Advisory' && !(isFinite(s.latest_value) && s.latest_value >= T.stv));
  const cautionSites = siteSummaries.filter(s=>s.status==='Caution');
  const advCount = latestAdvisorySites.length + gmAdvisorySites.length;
  const cauCount = cautionSites.length;
  setKpi('kpi-total-box','kpi-total-label','kpi-total', siteSummaries.length, 'Site monitored', 'Sites monitored', null);
  setKpi('kpi-adv-box','kpi-adv-label','kpi-adv', advCount, 'Site in Advisory', 'Sites in Advisory', 'advisory');
  setKpi('kpi-cau-box','kpi-cau-label','kpi-cau', cauCount, 'Site in Caution', 'Sites in Caution', 'caution');
  const dateString = formatDate(mostRecent);
  const lastUpdated = document.getElementById('lastUpdated');
  const kpiDate = document.getElementById('kpi-date');
  if(lastUpdated) lastUpdated.textContent = dateString;
  if(kpiDate) kpiDate.textContent = dateString;
  const snapshot = document.getElementById('snapshotText');
  if(snapshot) snapshot.textContent = snapshotSentence(advCount, cauCount, siteSummaries.length, latestAdvisorySites.length, gmAdvisorySites.length);

  siteSummaries.sort((a,b)=> statusRank(a.status)-statusRank(b.status) || b.latest_value-a.latest_value || a.site_name.localeCompare(b.site_name, 'en', {sensitivity:'base'}));
  latestAdvisorySites.sort((a,b)=> b.latest_value-a.latest_value || a.site_name.localeCompare(b.site_name, 'en', {sensitivity:'base'}));
  gmAdvisorySites.sort((a,b)=> (b.gm30||0)-(a.gm30||0) || a.site_name.localeCompare(b.site_name, 'en', {sensitivity:'base'}));
  cautionSites.sort((a,b)=> b.latest_value-a.latest_value || a.site_name.localeCompare(b.site_name, 'en', {sensitivity:'base'}));

  renderSiteChipList('latestAdvisorySitesList', latestAdvisorySites, 'Advisory', 'No sites have a latest sample at the Advisory level.', true);
  renderSiteChipList('gmAdvisorySitesList', gmAdvisorySites, 'Advisory', 'No sites are Advisory from the 30-day GM alone.', true);
  renderSiteChipList('cautionSitesList', cautionSites, 'Caution', 'No Caution sites in the latest results.', true);

  const siteStatusCards = document.getElementById('siteStatusCards');
  if(siteStatusCards){
    siteStatusCards.innerHTML = siteSummaries.map(s=>`
      <div class="site-pill ${siteStatusClass(s)}">
        <span class="pin" aria-hidden="true"></span>
        <div class="site-pill-body">
          <h3>${escapeHtml(s.site_name)} <span class="badge ${siteStatusClass(s)}">${escapeHtml(s.display_status)}</span></h3>
          <p>${escapeHtml(s.waterbody)} • ${formatDate(s.latest_dt)}</p>
          <div class="site-metrics">
            <span><strong>Latest:</strong> ${formatNumber(s.latest_value)}</span>
            <span><strong>30-day GM:</strong> ${s.n30>=2 && s.gm30 ? formatNumber(s.gm30) : '—'}</span>
          </div>
          <p class="status-reason"><strong>Why:</strong> ${escapeHtml(s.reason)}</p>
        </div>
      </div>
    `).join('');
  }

  const mapDiv = document.getElementById('map');
  if(mapDiv && window.L){
    const map = L.map('map').setView([35.47,-83.3],9);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:'&copy; OpenStreetMap'}).addTo(map);
    const latlngs=[];
    siteSummaries.forEach(s=>{
      if (isFinite(s.lat) && isFinite(s.lon)){
        latlngs.push([s.lat,s.lon]);
        const marker = L.circleMarker([s.lat,s.lon], {
          radius:10,
          color:'#ffffff',
          fillColor:s.color,
          fillOpacity:.95,
          weight:3,
          opacity:1
        }).addTo(map);
        marker.bindPopup(
          `<b>${escapeHtml(s.site_name)}</b><br>${escapeHtml(s.waterbody)}` +
          `<br><b>Status:</b> ${escapeHtml(s.display_status)}` +
          `<br><b>Why:</b> ${escapeHtml(s.reason)}` +
          `<br><b>Public guidance:</b> ${escapeHtml(s.guidance)}` +
          `<br><b>Latest sample:</b> ${formatNumber(s.latest_value)} CFU/100 mL` +
          `<br><b>30-day GM:</b> ${s.n30>=2 && s.gm30 ? formatNumber(s.gm30) : 'Not calculated (need ≥2 samples)'}` +
          `<br><span class="note">Sampled: ${s.latest_dt ? s.latest_dt.toLocaleString() : '—'}</span>`
        );
      }
    });
    if (latlngs.length){ map.fitBounds(L.latLngBounds(latlngs), {padding:[24,24]}); }
  }

  const tbody = document.querySelector('#results tbody');
  if(tbody){
    tbody.innerHTML = '';
    for (const s of siteSummaries){
      const gmStr = (s.n30 >= 2 && s.gm30 && isFinite(s.gm30)) ? formatNumber(s.gm30) : '—';
      const tr = document.createElement('tr');
      tr.innerHTML =
        `<td><strong>${escapeHtml(s.site_name)}</strong></td>`+
        `<td>${escapeHtml(s.waterbody)}</td>`+
        `<td>${formatDate(s.latest_dt)}</td>`+
        `<td><span class="result-value">${formatNumber(s.latest_value)}</span><br><span class="note">CFU/100 mL</span></td>`+
        `<td>${gmStr}<br><span class="note">n=${s.n30} in 30 days</span></td>`+
        `<td><span class="badge ${siteStatusClass(s)}">${escapeHtml(s.status)}</span></td>`+
        `<td class="guidance-text">${escapeHtml(s.guidance)}</td>`;
      tbody.appendChild(tr);
    }
  }


  const siteSelect = document.getElementById('siteFilter');
  const latestChartDiv = document.getElementById('latestSampleChart');
  const gmChartDiv = document.getElementById('gmTrendChart');
  const latestChartTitle = document.getElementById('latestChartTitle');
  const gmChartTitle = document.getElementById('gmChartTitle');
  const siteNames = [...new Set(siteSummaries.map(s=>s.site_name))].sort((a,b)=>a.localeCompare(b));

  if(siteSelect && latestChartDiv && gmChartDiv && window.Plotly){
    const gmChartPanel = gmChartDiv.closest('.trend-chart-panel');
    const latestChartPanel = latestChartDiv.closest('.trend-chart-panel');

    siteSelect.innerHTML =
      '<option value="__ALL_LATEST__">All sites — latest sample results</option>' +
      '<option value="__ALL_GM__">All sites — 30-day GM by site</option>' +
      '<option disabled>──────────</option>' +
      siteNames.map(n=>`<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');

    function sampleBand(v){
      const T = thresholds();
      if(isFinite(v) && v >= T.stv) return {label:'Advisory range', color:palette().advisory};
      if(isFinite(v) && v >= T.legacy_single_sample) return {label:'Caution range', color:palette().caution};
      return {label:'Good range', color:palette().ok};
    }

    function chartConfig(){
      return {
        responsive:true,
        displaylogo:false,
        modeBarButtonsToRemove:['lasso2d','select2d','autoScale2d']
      };
    }

    function showSingleChartMode(){
      if(latestChartPanel) latestChartPanel.style.display = '';
      if(gmChartPanel) gmChartPanel.style.display = 'none';
      if(gmChartDiv) Plotly.purge(gmChartDiv);
    }

    function showTwoChartMode(){
      if(latestChartPanel) latestChartPanel.style.display = '';
      if(gmChartPanel) gmChartPanel.style.display = '';
    }

    function baseHorizontalBarLayout(title, xTitle, height, shapes, annotations){
      return {
        title:{text:title, x:0.02, font:{size:18}},
        xaxis:{title:xTitle, zeroline:false, gridcolor:'#e8eef4', rangemode:'tozero'},
        yaxis:{title:'', automargin:true, autorange:'reversed'},
        margin:{l:210,r:110,t:58,b:68},
        height,
        paper_bgcolor:'rgba(0,0,0,0)',
        plot_bgcolor:'#ffffff',
        shapes:shapes || [],
        annotations:annotations || [],
        hoverlabel:{align:'left'},
        showlegend:false
      };
    }

    function noDataLayout(title, message){
      return {
        title:{text:title, x:0.02, font:{size:18}},
        xaxis:{visible:false},
        yaxis:{visible:false},
        margin:{l:40,r:30,t:60,b:40},
        height:280,
        paper_bgcolor:'rgba(0,0,0,0)',
        plot_bgcolor:'#ffffff',
        annotations:[{text:message, x:0.5, y:0.5, xref:'paper', yref:'paper', showarrow:false, font:{size:14, color:'#475569'}, align:'center'}]
      };
    }

    function renderAllSitesLatestChart(){
      showSingleChartMode();
      const T = thresholds();
      const P = palette();
      const chartNote = document.getElementById('chartStatusNote');
      if(chartNote){
        chartNote.innerHTML = '<strong>How to read this chart:</strong> this default view shows the newest sample at each site. Choose <strong>All sites — 30-day GM by site</strong> from the dropdown to see the 30-day GM chart. A site can still be <strong>Advisory</strong> even when the newest sample looks lower if the 30-day GM remains at or above 126 CFU/100 mL.';
      }
      if(latestChartTitle) latestChartTitle.textContent = 'Latest sample results by site';
      if(gmChartTitle) gmChartTitle.textContent = '30-day GM results';

      const ordered = [...siteSummaries].sort((a,b)=> statusRank(a.status)-statusRank(b.status) || b.latest_value - a.latest_value || a.site_name.localeCompare(b.site_name));
      const y = ordered.map(s=>s.site_name);
      const x = ordered.map(s=>s.latest_value);
      const height = Math.max(520, ordered.length * 36 + 170);
      latestChartDiv.style.height = `${height}px`;
      const custom = ordered.map(s=>[s.waterbody, s.display_status, formatDate(s.latest_dt), s.n30>=2 && s.gm30 ? formatNumber(s.gm30) : 'Not calculated', s.reason]);
      const shapes = [
        {type:'line', x0:T.legacy_single_sample, x1:T.legacy_single_sample, y0:0, y1:1, xref:'x', yref:'paper', line:{color:P.caution, width:2, dash:'dot'}},
        {type:'line', x0:T.stv, x1:T.stv, y0:0, y1:1, xref:'x', yref:'paper', line:{color:P.advisory, width:3, dash:'dash'}}
      ];
      const annotations = [
        {x:T.legacy_single_sample, y:1.08, xref:'x', yref:'paper', text:'Caution 235', showarrow:false, font:{size:12, color:'#7a3e00'}, xanchor:'left'},
        {x:T.stv, y:1.15, xref:'x', yref:'paper', text:'Advisory 410', showarrow:false, font:{size:12, color:'#7f1d1d'}, xanchor:'left'}
      ];
      const layout = baseHorizontalBarLayout('Latest E. coli result by site', 'Latest E. coli result (CFU/100 mL)', height, shapes, annotations);
      layout.xaxis.range = [0, Math.max(...x.filter(v=>isFinite(v)), T.stv, 1) * 1.12];
      Plotly.newPlot(latestChartDiv, [{
        type:'bar',
        orientation:'h',
        name:'Latest sample',
        x,
        y,
        marker:{color:ordered.map(s=>s.color), line:{color:'rgba(15,23,42,0.18)', width:1}},
        text:x.map(v=>formatNumber(v)),
        textposition:'outside',
        cliponaxis:false,
        textfont:{size:11},
        customdata:custom,
        hovertemplate:'<b>%{y}</b><br>Waterbody: %{customdata[0]}<br>Latest result: %{x} CFU/100 mL<br>Status: %{customdata[1]}<br>Sample date: %{customdata[2]}<br>30-day GM: %{customdata[3]}<br><br><b>Why:</b> %{customdata[4]}<extra></extra>'
      }], layout, chartConfig());
    }

    function renderAllSitesGmChart(){
      showSingleChartMode();
      const T = thresholds();
      const P = palette();
      const chartNote = document.getElementById('chartStatusNote');
      if(chartNote){
        chartNote.innerHTML = '<strong>30-day GM view:</strong> this chart summarizes recent overall water quality by site when there are at least 2 samples in the last 30 days. A GM at or above <strong>126 CFU/100 mL</strong> can keep a site in <strong>Advisory</strong> even if the latest sample has improved.';
      }
      if(latestChartTitle) latestChartTitle.textContent = '30-day GM by site';
      if(gmChartTitle) gmChartTitle.textContent = '30-day GM results';

      const ordered = [...siteSummaries]
        .filter(s=>s.n30 >= 2 && s.gm30 != null && isFinite(s.gm30))
        .sort((a,b)=> statusRank(a.status)-statusRank(b.status) || b.gm30 - a.gm30 || a.site_name.localeCompare(b.site_name));
      if(!ordered.length){
        latestChartDiv.style.height = '280px';
        Plotly.newPlot(latestChartDiv, [], noDataLayout('30-day GM by site', 'No site currently has enough recent samples to calculate a 30-day GM.'), chartConfig());
        return;
      }
      const y = ordered.map(s=>s.site_name);
      const x = ordered.map(s=>s.gm30);
      const height = Math.max(520, ordered.length * 36 + 170);
      latestChartDiv.style.height = `${height}px`;
      const custom = ordered.map(s=>[s.waterbody, s.display_status, formatDate(s.latest_dt), formatNumber(s.latest_value), s.n30, s.reason]);
      const shapes = [
        {type:'line', x0:T.gm, x1:T.gm, y0:0, y1:1, xref:'x', yref:'paper', line:{color:P.gmAdvisory || '#C2410C', width:3, dash:'dash'}}
      ];
      const annotations = [
        {x:T.gm, y:1.08, xref:'x', yref:'paper', text:'GM Advisory threshold 126', showarrow:false, font:{size:12, color:'#7c2d12'}, xanchor:'left'}
      ];
      const layout = baseHorizontalBarLayout('30-day geometric mean by site', '30-day GM (CFU/100 mL)', height, shapes, annotations);
      layout.xaxis.range = [0, Math.max(...x.filter(v=>isFinite(v)), T.gm, 1) * 1.18];
      Plotly.newPlot(latestChartDiv, [{
        type:'bar',
        orientation:'h',
        name:'30-day GM',
        x,
        y,
        marker:{color:x.map(v=>v >= T.gm ? (P.gmAdvisory || '#C2410C') : (P.teal || '#38A3A5')), line:{color:'rgba(15,23,42,0.18)', width:1}},
        text:x.map(v=>formatNumber(v)),
        textposition:'outside',
        cliponaxis:false,
        textfont:{size:11},
        customdata:custom,
        hovertemplate:'<b>%{y}</b><br>Waterbody: %{customdata[0]}<br>30-day GM: %{x:.1f} CFU/100 mL<br>Samples in GM: %{customdata[4]}<br>Latest result: %{customdata[3]} CFU/100 mL<br>Status: %{customdata[1]}<br><br><b>Why:</b> %{customdata[5]}<extra></extra>'
      }], layout, chartConfig());
    }

    function rollingGmSeries(points){
      return points.map(p=>{
        const cutoff = new Date(p.__date.getTime() - 30*24*3600*1000);
        const vals = points.filter(q=>q.__date >= cutoff && q.__date <= p.__date).map(q=>q.__value);
        const n = vals.filter(v=>isFinite(v) && v>0).length;
        return n >= 2 ? gm(vals) : null;
      });
    }

    function renderSingleSiteCharts(site){
      showTwoChartMode();
      const T = thresholds();
      const P = palette();
      const chartNote = document.getElementById('chartStatusNote');
      if(chartNote){
        chartNote.innerHTML = `<strong>Current status: ${escapeHtml(site.display_status)}.</strong> ${escapeHtml(site.reason)} The first chart shows individual sample results for this site; the second chart shows the site’s 30-day GM over time.`;
      }
      if(latestChartTitle) latestChartTitle.textContent = `${site.site_name}: sample results over time`;
      if(gmChartTitle) gmChartTitle.textContent = `${site.site_name}: 30-day GM over time`;

      const points = site.series.filter(p=>p.__date instanceof Date && isFinite(p.__value));
      const xs = points.map(p=>p.__date);
      const ys = points.map(p=>p.__value);
      const xMin = xs.length ? xs[0] : new Date();
      const xMax = xs.length ? xs[xs.length-1] : new Date();
      const latest = points[points.length-1];
      const markerColors = ys.map(v=>sampleBand(v).color);
      const markerBands = ys.map(v=>sampleBand(v).label);
      const latestYmax = Math.max(...ys, T.stv, 1) * 1.15;
      latestChartDiv.style.height = '500px';

      const latestShapes = [
        {type:'rect', xref:'paper', x0:0, x1:1, yref:'y', y0:0, y1:T.legacy_single_sample, fillcolor:'rgba(46,125,50,0.07)', line:{width:0}, layer:'below'},
        {type:'rect', xref:'paper', x0:0, x1:1, yref:'y', y0:T.legacy_single_sample, y1:T.stv, fillcolor:'rgba(180,83,9,0.08)', line:{width:0}, layer:'below'},
        {type:'rect', xref:'paper', x0:0, x1:1, yref:'y', y0:T.stv, y1:latestYmax, fillcolor:'rgba(185,28,28,0.08)', line:{width:0}, layer:'below'},
        {type:'line', xref:'paper', x0:0, x1:1, yref:'y', y0:T.legacy_single_sample, y1:T.legacy_single_sample, line:{color:P.caution, width:2, dash:'dot'}},
        {type:'line', xref:'paper', x0:0, x1:1, yref:'y', y0:T.stv, y1:T.stv, line:{color:P.advisory, width:3, dash:'dash'}}
      ];
      const latestAnnotations = [
        {x:1, y:T.legacy_single_sample, xref:'paper', yref:'y', text:'Caution 235', showarrow:false, xanchor:'right', yanchor:'bottom', font:{size:12, color:'#7a3e00'}},
        {x:1, y:T.stv, xref:'paper', yref:'y', text:'Advisory 410', showarrow:false, xanchor:'right', yanchor:'bottom', font:{size:12, color:'#7f1d1d'}}
      ];
      if(latest){
        latestAnnotations.push({
          x:latest.__date,
          y:latest.__value,
          text:`Latest: ${formatNumber(latest.__value)}`,
          showarrow:true,
          arrowhead:2,
          ax:35,
          ay:-35,
          bgcolor:'#ffffff',
          bordercolor:'#dbe7ef',
          borderpad:5,
          font:{size:12, color:'#10233c'}
        });
      }
      Plotly.newPlot(latestChartDiv, [{
        type:'scatter',
        mode:'lines+markers',
        name:'Individual samples',
        x:xs,
        y:ys,
        line:{color:P.water || '#22577A', width:3},
        marker:{size:10, color:markerColors, line:{color:'#ffffff', width:2}},
        customdata:points.map((p,i)=>[markerBands[i], site.waterbody]),
        hovertemplate:'<b>Sample result</b><br>Date: %{x|%b %d, %Y}<br>Result: %{y} CFU/100 mL<br>Sample band: %{customdata[0]}<br>Waterbody: %{customdata[1]}<extra></extra>'
      }], {
        title:{text:`${site.site_name} — individual sample results`, x:0.02, font:{size:18}},
        xaxis:{title:'Sample date', tickformat:'%b %d, %Y', tickangle:-20, gridcolor:'#e8eef4', range:[xMin, xMax]},
        yaxis:{title:'E. coli (CFU/100 mL)', range:[0, latestYmax], gridcolor:'#e8eef4', rangemode:'tozero'},
        margin:{l:75,r:40,t:60,b:80},
        paper_bgcolor:'rgba(0,0,0,0)',
        plot_bgcolor:'#ffffff',
        shapes:latestShapes,
        annotations:latestAnnotations,
        hovermode:'closest',
        hoverlabel:{align:'left'},
        showlegend:false
      }, chartConfig());

      const rollingGm = rollingGmSeries(points);
      const gmValues = rollingGm.filter(v=>v != null && isFinite(v));
      gmChartDiv.style.height = '430px';
      if(!gmValues.length){
        Plotly.newPlot(gmChartDiv, [], noDataLayout(`${site.site_name} — 30-day GM`, 'Not enough recent samples to calculate a 30-day GM over this time period.'), chartConfig());
        return;
      }
      const gmYmax = Math.max(...gmValues, T.gm, 1) * 1.2;
      const gmShapes = [
        {type:'rect', xref:'paper', x0:0, x1:1, yref:'y', y0:0, y1:T.gm, fillcolor:'rgba(56,163,165,0.08)', line:{width:0}, layer:'below'},
        {type:'rect', xref:'paper', x0:0, x1:1, yref:'y', y0:T.gm, y1:gmYmax, fillcolor:'rgba(194,65,12,0.09)', line:{width:0}, layer:'below'},
        {type:'line', xref:'paper', x0:0, x1:1, yref:'y', y0:T.gm, y1:T.gm, line:{color:P.gmAdvisory || '#C2410C', width:3, dash:'dash'}}
      ];
      const gmAnnotations = [
        {x:1, y:T.gm, xref:'paper', yref:'y', text:'GM Advisory threshold 126', showarrow:false, xanchor:'right', yanchor:'bottom', font:{size:12, color:'#7c2d12'}}
      ];
      Plotly.newPlot(gmChartDiv, [{
        type:'scatter',
        mode:'lines+markers',
        name:'30-day GM',
        x:xs,
        y:rollingGm,
        connectgaps:false,
        line:{color:P.teal || '#38A3A5', width:3},
        marker:{symbol:'diamond', size:9, color:rollingGm.map(v=>v >= T.gm ? (P.gmAdvisory || '#C2410C') : (P.teal || '#38A3A5')), line:{color:'#ffffff', width:1.5}},
        hovertemplate:'<b>30-day GM</b><br>Date: %{x|%b %d, %Y}<br>GM: %{y:.1f} CFU/100 mL<extra></extra>'
      }], {
        title:{text:`${site.site_name} — 30-day geometric mean`, x:0.02, font:{size:18}},
        xaxis:{title:'Sample date', tickformat:'%b %d, %Y', tickangle:-20, gridcolor:'#e8eef4', range:[xMin, xMax]},
        yaxis:{title:'30-day GM (CFU/100 mL)', range:[0, gmYmax], gridcolor:'#e8eef4', rangemode:'tozero'},
        margin:{l:75,r:40,t:60,b:80},
        paper_bgcolor:'rgba(0,0,0,0)',
        plot_bgcolor:'#ffffff',
        shapes:gmShapes,
        annotations:gmAnnotations,
        hovermode:'closest',
        hoverlabel:{align:'left'},
        showlegend:false
      }, chartConfig());
    }

    function renderSiteChart(){
      const val = siteSelect.value;
      if(val === '__ALL_LATEST__' || val === '__ALL__'){
        renderAllSitesLatestChart();
        return;
      }
      if(val === '__ALL_GM__'){
        renderAllSitesGmChart();
        return;
      }
      const site = siteSummaries.find(s=>s.site_name===val);
      if(site) renderSingleSiteCharts(site);
    }

    siteSelect.addEventListener('change', renderSiteChart);
    renderSiteChart();
  }


}

document.addEventListener('DOMContentLoaded', main);
