
function gm(values){const v=values.filter(x=>x>0 && isFinite(x)); if(!v.length) return null; 
  const s=v.reduce((a,x)=>a+Math.log(x),0); return Math.exp(s/v.length);}
function statusFor(val,gm30){const T=window.EBCI_CONFIG.thresholds; 
  if(val>=T.stv || (gm30!=null && gm30>T.gm)) return {code:'Advisory', color:window.EBCI_CONFIG.palette.advisory};
  if(val>=T.legacy_single_sample && val<T.stv) return {code:'Caution', color:window.EBCI_CONFIG.palette.caution};
  return {code:'Good', color:window.EBCI_CONFIG.palette.ok};}
async function main(){
  const csvUrl=`data/ecoli_samples.csv?v=${Date.now()}`;
  const text=await (await fetch(csvUrl,{cache:'no-store'})).text();
  const rows=Papa.parse(text,{header:true,dynamicTyping:true}).data.filter(r=>r.site_id);
  rows.forEach(r=>{r.sample_datetime_local=new Date(String(r.sample_datetime_local).replace(' ','T'));
    r.ecoli_cfu_100ml=Number(r.ecoli_cfu_100ml); r.lat=r.lat===''?null:Number(r.lat); r.lon=r.lon===''?null:Number(r.lon);});
  const bySite={}; for(const r of rows){(bySite[r.site_id] ||= {meta:r, samples:[]}).samples.push(r);} 
  for(const s of Object.values(bySite)){s.samples.sort((a,b)=>b.sample_datetime_local-a.sample_datetime_local);}
  const siteSummaries=[]; let mostRecent=null;
  for(const [site_id,o] of Object.entries(bySite)){const latest=o.samples[0]; if(!mostRecent||latest.sample_datetime_local>mostRecent) mostRecent=latest.sample_datetime_local;
    const cutoff=new Date(latest.sample_datetime_local.getTime()-30*24*3600*1000);
    const vals30=o.samples.filter(s=>s.sample_datetime_local>=cutoff).map(s=>{const q=(s.qualifier||'').trim(); let v=s.ecoli_cfu_100ml; if(q==='<'){v=Math.max(1,v/2);} return Number(v);});
    const gm30=gm(vals30); const stat=statusFor(latest.ecoli_cfu_100ml,gm30);
    siteSummaries.push({site_id, site_name:latest.site_name, waterbody:latest.waterbody||'—', lat:latest.lat, lon:latest.lon,
      latest_value:latest.ecoli_cfu_100ml, latest_dt:latest.sample_datetime_local, gm30, status:stat.code, color:stat.color});}
  document.getElementById('kpi-total').textContent=siteSummaries.length;
  document.getElementById('kpi-adv').textContent=siteSummaries.filter(s=>s.status==='Advisory').length;
  document.getElementById('kpi-cau').textContent=siteSummaries.filter(s=>s.status==='Caution').length;
  if(mostRecent){document.querySelector('small.muted').textContent=`Public transparency dashboard • Last updated: ${mostRecent.toLocaleDateString()}`;}
  const map=L.map('map').setView([35.47,-83.3],9); 
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19, attribution:'&copy; OpenStreetMap'}).addTo(map);
  const latlngs=[]; siteSummaries.forEach(s=>{if(s.lat!=null && s.lon!=null && isFinite(s.lat) && isFinite(s.lon)){latlngs.push([s.lat,s.lon]);
      const m=L.circleMarker([s.lat,s.lon],{radius:9,color:s.color,fillColor:s.color,fillOpacity:.9,weight:2}).addTo(map);
      m.bindPopup(`<b>${s.site_name}</b><br>${s.waterbody}<br><b>Latest:</b> ${s.latest_value} CFU/100 mL<br><b>30‑day GM:</b> ${s.gm30? s.gm30.toFixed(0):'—'}<br><b>Status:</b> ${s.status}<br><span class="note">Sampled: ${s.latest_dt.toLocaleString()}</span>`);}});
  if(latlngs.length){map.fitBounds(L.latLngBounds(latlngs),{padding:[20,20]});} 
  else {document.getElementById('map-note').textContent='Map markers will appear once latitude/longitude are provided in the site registry sheet.';}
  siteSummaries.sort((a,b)=>b.latest_value-a.latest_value);
  const tbody=document.querySelector('#results tbody'); for(const s of siteSummaries){const tr=document.createElement('tr');
    tr.innerHTML=`<td>${s.site_name}</td><td>${s.waterbody}</td><td>${s.latest_dt.toLocaleDateString()}</td><td><b>${s.latest_value}</b></td><td>${s.gm30? s.gm30.toFixed(0):'—'}</td><td><span class="badge ${s.status.toLowerCase()}">${s.status}</span></td>`; tbody.appendChild(tr);}
  Plotly.newPlot('bar',[{type:'bar',x:siteSummaries.map(s=>s.site_name),y:siteSummaries.map(s=>s.latest_value),
    text:siteSummaries.map(s=>`${s.latest_value} CFU/100 mL`),textposition:'auto',marker:{color:siteSummaries.map(s=>s.color)},
    hovertemplate:'%{x}<br>%{y} CFU/100 mL<extra></extra>'}],{title:'Latest E. coli by Site (CFU/100 mL)',xaxis:{automargin:true},yaxis:{title:'CFU/100 mL',rangemode:'tozero'},margin:{l:50,r:20,t:40,b:100}},
    {responsive:true,displaylogo:false});}
document.addEventListener('DOMContentLoaded',main);
