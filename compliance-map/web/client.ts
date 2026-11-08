import { formClient } from "./form-client.js";

export const complianceClient =
  String.raw`
(()=>{
  const el=id=>document.getElementById(id),config=JSON.parse(el('view-model').textContent),raw=JSON.parse(el('initial-report').textContent);
  let activeReport=0,filter='all',draft=null,controller=null;
  const status=el('status');
  const announce=(message,error=false)=>{status.textContent=message;status.classList.toggle('error',error)};
  const activePanel=()=>document.querySelector('[data-report="'+activeReport+'"]');
  const slug=(text,fallback)=>text.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,55)||fallback;
  const animate=node=>{node.classList.remove('changed');void node.offsetWidth;node.classList.add('changed')};
  function download(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  function applyFilter(){const query=el('report-search').value.trim().toLowerCase();let shown=0;activePanel().querySelectorAll('.fact,.unknowns').forEach(node=>{const kinds=(node.dataset.kinds||node.dataset.kind||'').split(' '),visible=(filter==='all'||kinds.includes(filter))&&(!query||node.textContent.toLowerCase().includes(query));node.hidden=!visible;if(visible)shown++});announce(shown+' source detail sections shown. The comparison summary is unchanged. No new research.');}
  document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));applyFilter()}));
  el('report-search').addEventListener('input',applyFilter);
  document.querySelectorAll('[data-activity-tab]').forEach(button=>button.addEventListener('click',()=>{const index=Number(button.dataset.activityTab);if(!Number.isInteger(index)||!config.reports[index])return;activeReport=index;document.querySelectorAll('[data-report]').forEach(panel=>panel.hidden=Number(panel.dataset.report)!==index);document.querySelectorAll('[data-activity-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));selectPlace(0);applyFilter();animate(activePanel())}));
  function selectPlace(index){const place=config.reports[activeReport]?.places[index];if(!place)return;el('atlas-name').textContent=place.name;el('atlas-detail').textContent=[place.region,place.country].filter(Boolean).join(' · ');el('atlas-count').textContent=String(place.facts.length);document.querySelectorAll('[data-atlas]').forEach((button,i)=>{button.setAttribute('aria-pressed',String(i===index));const p=config.reports[activeReport].places[i];button.hidden=!p;if(p)button.querySelector('strong').textContent=p.name});activePanel().querySelectorAll('.place').forEach((card,i)=>card.classList.toggle('is-focused',i===index));animate(document.querySelector('.atlas-caption'));}
  document.querySelectorAll('[data-atlas]').forEach(button=>button.addEventListener('click',()=>{selectPlace(Number(button.dataset.atlas));announce('Showing '+el('atlas-name').textContent+' from the recorded comparison.')}));
  el('expand-sources').addEventListener('click',()=>{const all=[...activePanel().querySelectorAll('[data-source-details]')],open=all.some(d=>!d.open);all.forEach(d=>d.open=open);el('expand-sources').textContent=open?'Close all sources':'Open all sources';announce((open?'Opened':'Closed')+' the source disclosures.');});
  el('download').addEventListener('click',()=>download(raw,'compliance-map-report.json'));
` +
  formClient +
  String.raw`
  const motionMedia=window.matchMedia('(prefers-reduced-motion: reduce)');
  let manualReduced=false;
  function syncMotion(){const reduced=motionMedia.matches||manualReduced;document.documentElement.dataset.motion=reduced?'reduced':'full';const button=el('motion-toggle');button.textContent=motionMedia.matches?'Motion: reduced (system)':reduced?'Motion: reduced':'Motion: on';button.setAttribute('aria-pressed',String(reduced));button.disabled=motionMedia.matches;}
  el('motion-toggle').addEventListener('click',()=>{manualReduced=!manualReduced;syncMotion()});
  motionMedia.addEventListener('change',syncMotion);syncMotion();
  syncPlaces();
})();
`;
