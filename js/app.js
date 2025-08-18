
function gm(values){
  const v = values.filter(x => x>0 && isFinite(x));
  if(!v.length) return null;
  const s = v.reduce((a,x)=>a+Math.log(x),0);
  return Math.exp(s/v.length);
}

// Robust CSV date parser: handles ISO (YYYY-MM-DD[ HH:mm[:ss]]), US (M/D/YYYY [h:mm[:ss] AM/PM]),
// and Excel serial numbers.
function parseSampleDate(x){
  if(x===null || x===undefined || x==='') return null;
  if (typeof x === 'number' && isFinite(x)) {
    // Excel serial date -> JS Date
    const ms = Math.round((x - 25569) * 86400 * 1000);
    return new Date(ms);
  }
  const s = String(x).trim();
  let m;
  // ISO-like
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if(m){
    const Y=+m[1], M=+m[2]-1, D=+m[3], h=+(m[4]||0), mi=+(m[5]||0), se=+(m[6]||0);
    return new Date(Y,M,D,h,mi,se);
  }
  // US M/D/YYYY with optional time & AM/PM
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i);
  if(m){
    let M=+m[1], D=+m[2], Y=+m[3]; if(Y<100) Y=2000+Y;
    let h=+(m[4]||0), mi=+(m[5]||0), se=+(m[6]||0);
    const ap = (m[7]||'').toUpperCase();
    if(ap==='PM' && h<12) h+=12;
    if(ap==='AM' && h===12) h=0;
    return new Date(Y,M-1,D,h,mi,se);
  }
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function statusFor(val, gm30){
  const T = window.EBCI_CONFIG.thresholds;
  if(val>=T.stv || (gm30!=null && gm30>T.gm)) return {code:'Advisory', color:window.EBCI_CONFIG.palette.advisory};
  if(val>=T.legacy_single_sample && val<T.stv) return {code:'Caution', color:window.EBCI_CONFIG.palette.caution};
  return {code:'Good', color:window.EBCI_CONFIG.palette.ok};
}

async function main(){
  const csvUrl = `data/ecoli_samples.csv?v=${Date.now()}`;
  const text = await (await fetch(csvUrl, {cache:'no-store'})).text();
  const rows = Papa.parse(text, {header:true, dynamicTyping:true}).data.filter(r=>r.site_id);

  rows.forEach(r=>{
    r.sample_datetime_local = parseSampleDate(r.sample_datetime_local);
    r.ecoli_cfu_100ml = Number(r.ecoli_cfu_100ml);
    r.lat = (r.lat==='' || r.lat==null)? null : Number(r.lat);
    r.lon = (r.lon==='' || r.lon==null)? null : Number(r.lon);
    r.waterbody = (r.waterbody && String(r.waterbody).trim().length>0) ? String(r.waterbody).trim() : "Unspecified";
  });

  // Group by site
  const bySite = {};
  for(const r of rows){
    (bySite[r.site_id] ||= {meta:r, samples:[]});
    bySite[r.site_id].samples.push(r);
  }
  for(const s of Object.values(bySite)){
    s.samples = s.samples.filter(x=>x.sample_datetime_local instanceof Date && !isNaN(x.sample_datetime_local));
    s.samples.sort((a,b)=>b.sample_datetime_local - a.sample_datetime_local);
  }

  // Summaries
  const siteSummaries = [];
  let mostRecent = null;
  for(const [site_id, o] of Object.entries(bySite)){
    if(!o.samples.length) continue;
    const latest = o.samples[0];
    if(!mostRecent || latest.sample_datetime_local > mostRecent) mostRecent = latest.sample_datetime_local;
    const cutoff = new Date(latest.sample_datetime_local.getTime() - 30*24*3600*1000);
    const vals30 = o.samples.filter(s=>s.sample_datetime_local>=cutoff).map(s=>{
      const q=(s.qualifier||'').trim(); let v=s.ecoli_cfu_100ml; if(q==='<'){v=Math.max(1,v/2);} return Number(v);
    });
    const gm30 = gm(vals30);
    const stat = statusFor(latest.ecoli_cfu_100ml, gm30);
    siteSummaries.push({
      site_id, site_name: latest.site_name, waterbody: latest.waterbody||'Unspecified',
      lat: latest.lat, lon: latest.lon,
      latest_value: latest.ecoli_cfu_100ml, latest_dt: latest.sample_datetime_local,
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
      m.bindPopup(`<b>${s.site_name}</b><br>${s.waterbody}<br><b>Latest:</b> ${s.latest_value} CFU/100 mL<br><b>30‑day GM:</b> ${s.gm30? s.gm30.toFixed(0):'—'}<br><b>Status:</b> ${s.status}<br><span class="note">Sampled: ${s.latest_dt ? s.latest_dt.toLocaleString() : '—'}</span>`);
    }
  });
  if(latlngs.length){ map.fitBounds(L.latLngBounds(latlngs), {padding:[20,20]}); }

  // Table (sorted high→low by latest)
  siteSummaries.sort((a,b)=>b.latest_value - a.latest_value);
  const tbody = document.querySelector('#results tbody');
  for(const s of siteSummaries){
    const tr = document.createElement('tr');
    const dateStr = s.latest_dt ? s.latest_dt.toLocaleDateString() : '—';
    tr.innerHTML = `<td>${s.site_name}</td><td>${s.waterbody}</td><td>${dateStr}</td><td><b>${s.latest_value}</b></td><td>${s.gm30? s.gm30.toFixed(0):'—'}</td><td><span class="badge ${s.status.toLowerCase()}">${s.status}</span></td>`;
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
        const xs = s.series.map(p=>p.sample_datetime_local);
        const ys = s.series.map(p=>p.ecoli_cfu_100ml);
        traces.push({type:'scatter', mode:'lines+markers', name:s.name, x:xs, y:ys});
        if(xs.length){ if(!xMin || xs[0]<xMin) xMin=xs[0]; if(!xMax || xs[xs.length-1]>xMax) xMax=xs[xs.length-1]; }
      }
    } else {
      const site = siteSummaries.find(s=>s.site_name===val);
      if(site){
        const xs = site.series.map(p=>p.sample_datetime_local);
        const ys = site.series.map(p=>p.ecoli_cfu_100ml);
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
