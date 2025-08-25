// ---------- Helpers ----------
function gm(values){
  const v = values.filter(x => x>0 && isFinite(x));
  if(!v.length) return null;
  const s = v.reduce((a,x)=>a+Math.log(x),0);
  return Math.exp(s/v.length);
}
function parseSampleDate(x){
  if(x===null || x===undefined || x==='') return null;
  if (typeof x === 'number' && isFinite(x)) {
    const ms = Math.round((x - 25569) * 86400 * 1000); // Excel serial
    return new Date(ms);
  }
  const s = String(x).trim();
  let m;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if(m){ const Y=+m[1],M=+m[2]-1,D=+m[3],h=+(m[4]||0),mi=+(m[5]||0),se=+(m[6]||0); return new Date(Y,M,D,h,mi,se); }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i);
  if(m){
    let M=+m[1],D=+m[2],Y=+m[3]; if(Y<100) Y=2000+Y;
    let h=+(m[4]||0),mi=+(m[5]||0),se=+(m[6]||0); const ap=(m[7]||'').toUpperCase();
    if(ap==='PM'&&h<12)h+=12; if(ap==='AM'&&h===12)h=0; return new Date(Y,M-1,D,h,mi,se);
  }
  const d = new Date(s); return isNaN(d)? null : d;
}
function norm(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]/g,''); }
function pickKey(row, aliases){
  const keys = Object.keys(row||{});
  for(const k of keys){ const n = norm(k); if(aliases.some(a => n===a || n.endsWith(a))) return k; }
  // loose contains
  for(const k of keys){ const n = norm(k); if(aliases.some(a => n.includes(a))) return k; }
  return null;
}
function statusFor(val, gm30){
  const T = window.EBCI_CONFIG.thresholds;
  if(val>=T.stv || (gm30!=null && gm30>T.gm)) return {code:'Advisory', color:window.EBCI_CONFIG.palette.advisory};
  if(val>=T.legacy_single_sample && val<T.stv) return {code:'Caution', color:window.EBCI_CONFIG.palette.caution};
  return {code:'Good', color:window.EBCI_CONFIG.palette.ok};
}

// ---------- Main ----------
async function main(){
  const csvUrl = `data/ecoli_samples.csv?v=${Date.now()}`;
  const text = await (await fetch(csvUrl, {cache:'no-store'})).text();
  const parsed = Papa.parse(text, {header:true, dynamicTyping:true});
  const allRows = parsed.data;

  if(!allRows.length){ return; }

  // Column detection
  const FIRST = allRows.find(r=>r && Object.keys(r).length>0) || allRows[0];
  const ecoliAliases = [
    'ecolicfu100ml','ecolimpn100ml','ecoli100ml','ecoli', 'e.coli(cfu/100ml)','ecolicfu',
    'ecoli(cfu/100ml)','ecolicfu/100ml','ecolimpn','e coli','ecoliresult'
  ];
  const dateAliases = ['sampledatetimelocal','sampledate','date','sample_date','collectiondate','datecollected'];
  const qualifierAliases = ['qualifier','qual','flag','symbol','ineq'];
  const siteNameAliases = ['sitename','location','site','monitoringsite'];
  const siteIdAliases = ['siteid','site_id','stationid','station'];

  const ecoliKey = pickKey(FIRST, ecoliAliases) || 'ecoli_cfu_100ml';
  const dateKey = pickKey(FIRST, dateAliases) || 'sample_datetime_local';
  const qualKey = pickKey(FIRST, qualifierAliases) || 'qualifier';
  const siteNameKey = pickKey(FIRST, siteNameAliases) || 'site_name';
  const siteIdKey = pickKey(FIRST, siteIdAliases) || 'site_id';

  // Normalize rows
  const rows = allRows.filter(r=>r && (r[siteIdKey] || r[siteNameKey]));
  rows.forEach(r=>{
    r.__date = parseSampleDate(r[dateKey]);
    let v = Number(r[ecoliKey]);
    if(!isFinite(v)){ v = Number(String(r[ecoliKey]).replace(/[, ]/g,'')); }
    const q = String(r[qualKey]||'').trim();
    if(q==='<'){ v = Math.max(1, v/2); } // treat "<" as half DL if provided
    r.__value = isFinite(v)? v : null;
    r.__site_name = r[siteNameKey] || r[siteIdKey] || 'Site';
    r.__site_id = r[siteIdKey] || r.__site_name.toLowerCase().replace(/\s+/g,'-');
    r.lat = (r.lat==='' || r.lat==null)? null : Number(r.lat);
    r.lon = (r.lon==='' || r.lon==null)? null : Number(r.lon);
    r.waterbody = (r.waterbody && String(r.waterbody).trim().length>0) ? String(r.waterbody).trim() : "Unspecified";
  });

  // Group by site
  const bySite = {};
  for(const r of rows){
    (bySite[r.__site_id] ||= {meta:r, samples:[]});
    bySite[r.__site_id].samples.push(r);
  }
  for(const s of Object.values(bySite)){
    s.samples = s.samples.filter(x=>x.__date instanceof Date && !isNaN(x.__date) && isFinite(x.__value));
    s.samples.sort((a,b)=>b.__date - a.__date);
  }

  // Summaries
  const siteSummaries = [];
  let mostRecent = null;
  for(const [site_id, o] of Object.entries(bySite)){
    if(!o.samples.length) continue;
    const latest = o.samples[0];
    if(!mostRecent || latest.__date > mostRecent) mostRecent = latest.__date;
    const cutoff = new Date(latest.__date.getTime() - 30*24*3600*1000);
    const vals30 = o.samples.filter(s=>s.__date>=cutoff).map(s=>s.__value);
    const gm30 = gm(vals30);
    const stat = statusFor(latest.__value, gm30);
    siteSummaries.push({
      site_id, site_name: latest.__site_name, waterbody: latest.waterbody||'Unspecified',
      lat: latest.lat, lon: latest.lon,
      latest_value: latest.__value, latest_dt: latest.__date,
      gm30, status: stat.code, color: stat.color, series: o.samples.slice().reverse()
    });
  }

  // KPIs and last updated
  document.getElementById('kpi-total').textContent = siteSummaries.length;
  document.getElementById('kpi-adv').textContent = siteSummaries.filter(s=>s.status==='Advisory').length;
  document.getElementById('kpi-cau').textContent = siteSummaries.filter(s=>s.status==='Caution').length;
  if(mostRecent){
    document.querySelector('small.muted').textContent = `Public transparency dashboard • Last updated: ${mostRecent.toLocaleDateString()}`;
  }

  // Map
  const map = L.map('map').setView([35.47,-83.3],9);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19, attribution:'&copy; OpenStreetMap'}).addTo(map);
  const latlngs=[];
  siteSummaries.forEach(s=>{
    if(s.lat!=null && s.lon!=null && isFinite(s.lat) && isFinite(s.lon)){
      latlngs.push([s.lat,s.lon]);
      const m = L.circleMarker([s.lat,s.lon], {radius:9, color:s.color, fillColor:s.color, fillOpacity:.9, weight:2}).addTo(map);
      m.bindPopup(`<b>${s.site_name}</b><br>${s.waterbody}<br><b>Latest:</b> ${s.latest_value} CFU/100 mL<br><b>30-day GM:</b> ${s.gm30? s.gm30.toFixed(0):'—'}<br><b>Status:</b> ${s.status}<br><span class="note">Sampled: ${s.latest_dt ? s.latest_dt.toLocaleString() : '—'}</span>`);
    }
  });
  if(latlngs.length){ map.fitBounds(L.latLngBounds(latlngs), {padding:[20,20]}); }

  // Table (NOW alphabetized by Site name A→Z)
  siteSummaries.sort((a,b)=> a.site_name.localeCompare(b.site_name, 'en', {sensitivity:'base'}));
  const tbody = document.querySelector('#results tbody');
  for(const s of siteSummaries){
    const dateStr = s.latest_dt ? s.latest_dt.toLocaleDateString() : '—';
    const gmStr = (s.gm30 && isFinite(s.gm30)) ? s.gm30.toFixed(0) : '—';
    const valStr = (s.latest_value!=null && isFinite(s.latest_value)) ? `<b>${s.latest_value}</b>` : '—';
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${s.site_name}</td><td>${s.waterbody}</td><td>${dateStr}</td><td>${valStr}</td><td>${gmStr}</td><td><span class="badge ${s.status.toLowerCase()}">${s.status}</span></td>`;
    tbody.appendChild(tr);
  }

  // ---- Site filter -> single line graph ----
  const siteSelect = document.getElementById('siteFilter');
  const siteChartDiv = document.getElementById('siteChart');

  const siteNames = siteSummaries.map(s=>s.site_name);
  siteNames.sort((a,b)=>a.localeCompare(b));
  siteSelect.innerHTML = '<option value="__ALL__">All sites</option>' + siteNames.map(n=>`<option value="${n}">${n}</option>`).join('');

  function renderSiteChart(){
    const val = siteSelect.value;
    let traces = [];
    let xMin = null, xMax = null;

    if(val === '__ALL__'){
      const seriesList = siteSummaries.map(s=>({name:s.site_name, series:s.series}));
      for(const s of seriesList){
        const xs = s.series.map(p=>p.__date);
        const ys = s.series.map(p=>p.__value);
        traces.push({type:'scatter', mode:'lines+markers', name:s.name, x:xs, y:ys});
        if(xs.length){ if(!xMin || xs[0]<xMin) xMin=xs[0]; if(!xMax || xs[xs.length-1]>xMax) xMax=xs[xs.length-1]; }
      }
    } else {
      const site = siteSummaries.find(s=>s.site_name===val);
      if(site){
        const xs = site.series.map(p=>p.__date);
        const ys = site.series.map(p=>p.__value);
        traces.push({type:'scatter', mode:'lines+markers', name:site.site_name, x:xs, y:ys});
        if(xs.length){ xMin=xs[0]; xMax=xs[xs.length-1]; }
      }
    }
    if(xMin && xMax){
      traces.push({type:'scatter', mode:'lines', name:'EPA STV 410', x:[xMin,xMax], y:[window.EBCI_CONFIG.thresholds.stv, window.EBCI_CONFIG.thresholds.stv], line:{dash:'dot'}});
    }
    const ymaxSel = Math.max(
      ...traces.filter(t=>t.name!=='EPA STV 410').map(t=>Math.max(...t.y.filter(y=>isFinite(y)))),
      window.EBCI_CONFIG.thresholds.stv
    );
    Plotly.newPlot(siteChartDiv, traces, {
      title: (val==='__ALL__' ? 'All sites — E. coli trends' : (val + ' — E. coli trend')),
      xaxis:{tickformat:'%b %d, %Y', tickangle:-20},
      yaxis:{title:'CFU/100 mL', range:[0, ymaxSel*1.05]},
      margin:{l:60,r:20,t:40,b:70},
      legend:{orientation:'h', y:-0.3}
    }, {responsive:true, displaylogo:false});
  }
  siteSelect.addEventListener('change', renderSiteChart);
  renderSiteChart();
}
document.addEventListener('DOMContentLoaded', main);
