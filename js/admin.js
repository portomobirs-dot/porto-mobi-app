import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut,getIdTokenResult} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,collection,doc,getDoc,onSnapshot,updateDoc,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {firebaseConfig,padCode,esc,stamp,phoneDigits,errorText,calculateFare,moneyBRL} from './common.js';
const app=initializeApp(firebaseConfig,'porto-mobi-admin');
const auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
let unsubs=[],rows=[],drivers=[],quoteHistory=[],refusalHistory=[];
const quoteDrafts=new Map();
const msg=(s,bad=false)=>{$('message').textContent=s;$('message').className=bad?'error':'success'};
const stop=()=>{const clientScreen=$('adminScreen3');if(clientScreen){const list=clientScreen.querySelector('[data-live-clients]');if(list)list.textContent='Carregando clientes...';}for(const f of unsubs)f();unsubs=[];rows=[];drivers=[];quoteHistory=[];refusalHistory=[];quoteDrafts.clear();renderQuoteStatus();renderOperationalScreens()};
$('adminVisualExit').addEventListener('click',async e=>{e.stopImmediatePropagation();try{await signOut(auth);window.adminVisualShow(2);}catch(err){msg(errorText(err),true)}},true);
$('loginForm').onsubmit=async e=>{e.preventDefault();try{msg('Entrando...');await signInWithEmailAndPassword(auth,$('email').value.trim(),$('password').value)}catch(err){msg(errorText(err),true)}};

$('filter').onchange=render;
const moneyFields=[
 {name:'kmPercurso',label:'KM do percurso',step:'0.01'},
 {name:'tempoPercursoMin',label:'Tempo do percurso (minutos)',step:'1'},
 {name:'tarifaBase',label:'Tarifa Base (R$)',step:'0.01'},
 {name:'valorPorKm',label:'Valor por km (R$/km)',step:'0.01'},
 {name:'valorPorTempo',label:'Valor por tempo (R$/min)',step:'0.01'},
 {name:'valorExtra',label:'Valor extra (R$)',step:'0.01'}
];

const routeKeyName='pm.admin.ors.key';
let routeBusy=false;
function getRouteKey(){try{return localStorage.getItem(routeKeyName)||''}catch{return ''}}
async function routeApi(path,key,body){
 const res=await fetch('https://api.heigit.org'+path,{headers:{Authorization:key,...(body?{'Content-Type':'application/json'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000),referrerPolicy:'no-referrer'});
 if(!res.ok)throw Error(res.status===429?'Limite de consultas atingido.':res.status===401||res.status===403?'Chave inválida ou sem permissão.':'Serviço indisponível ('+res.status+').');
 return res.json();
}
async function routeSummary(key,coordinates){
 const data=await routeApi('/openrouteservice/v2/directions/driving-car/json',key,{coordinates,instructions:false});
 const v=data.routes?.[0]?.summary;
 if(!v||!Number.isFinite(v.distance)||!Number.isFinite(v.duration)||v.distance<=0||v.duration<=0)throw Error('Percurso não encontrado.');
 return v;
}
function routeConfig(){
 const d=document.createElement('dialog');
 d.style.cssText='background:#080808;color:white;border:2px solid #D4AF37;border-radius:12px;padding:20px;max-width:85vw';
 d.innerHTML='<h3>CONFIGURAÇÃO DO GPS</h3><p>Chave local neste navegador. Use somente em dispositivo confiável.</p><label>Basic Key<input type="password" autocomplete="off" style="width:100%"></label><p role="status"></p><div class="actions"><button type="button" data-save>SALVAR CHAVE</button><button type="button" data-test>TESTAR CONEXÃO</button><button type="button" data-remove>REMOVER CHAVE</button><button type="button" data-close>FECHAR</button></div>';
 const input=d.querySelector('input'),notice=d.querySelector('[role=status]');input.value=getRouteKey();
 d.querySelector('[data-save]').onclick=()=>{try{if(!input.value.trim())throw Error('Insira a chave.');localStorage.setItem(routeKeyName,input.value.trim());notice.textContent='Chave salva neste navegador.'}catch(e){notice.textContent=e.message}};
 d.querySelector('[data-remove]').onclick=()=>{try{localStorage.removeItem(routeKeyName);input.value='';notice.textContent='Chave removida.'}catch{notice.textContent='Não foi possível remover a chave.'}};
 const test=d.querySelector('[data-test]');test.onclick=async()=>{test.disabled=true;notice.textContent='Testando...';try{await routeSummary(input.value.trim(),[[-51.2300,-30.0350],[-51.2220,-30.0400]]);notice.textContent='Conexão funcionando!'}catch(e){notice.textContent='Falha no teste. '+e.message}finally{test.disabled=false}};
 d.querySelector('[data-close]').onclick=()=>d.close();d.addEventListener('close',()=>d.remove());document.body.append(d);d.showModal();
}
async function chooseRoutePoint(key,address,title){
 const q=new URLSearchParams({text:address,'boundary.country':'BRA',size:'8'});
 const data=await routeApi('/pelias/v1/search?'+q,key);
 const options=(data.features||[]).filter(f=>{const c=f.geometry?.coordinates;return Array.isArray(c)&&c.length===2&&c.every(Number.isFinite)&&c[0]>=-57.65&&c[0]<=-48.0&&c[1]>=-33.76&&c[1]<=-25.5&&['rio grande do sul','santa catarina','rs','sc'].includes(String(f.properties?.region||f.properties?.region_a||'').toLowerCase())&&['address','street','venue'].includes(f.properties?.layer)});
 if(!options.length)throw Error('Endereço não localizado no RS ou SC. Confira no GPS manual.');
 return new Promise(resolve=>{
 const d=document.createElement('dialog');d.style.cssText='background:#080808;color:white;border:2px solid #D4AF37;border-radius:12px;padding:16px;max-width:85vw';
 const h=document.createElement('h3');h.textContent=title;d.append(h);
 const p=document.createElement('p');p.textContent='Confirme o endereço correspondente: '+address;d.append(p);
 let value=null;
 for(const f of options){const b=document.createElement('button');b.type='button';b.style.cssText='display:block;width:100%;margin:8px 0';b.textContent=f.properties.label||'Endereço sem descrição';b.onclick=()=>{value=f.geometry.coordinates;d.close()};d.append(b)}
 const cancel=document.createElement('button');cancel.type='button';cancel.textContent='CANCELAR';cancel.onclick=()=>d.close();d.append(cancel);d.addEventListener('close',()=>{d.remove();resolve(value)});document.body.append(d);d.showModal();
 });
}
async function calculateRoute(b,r){
 if(routeBusy)return;
 const key=getRouteKey();if(!key){routeConfig();return}
 const card=b.closest('.quote'),note=card.querySelector('[data-route-note]'),uid=auth.currentUser?.uid;
 if(!uid)return;
 if(!await confirmDriverDecision('Consultar endereços de embarque e destino na HeiGIT para estimar o percurso?'))return;
 if(routeBusy||!card.isConnected||auth.currentUser?.uid!==uid)return;
 routeBusy=true;b.disabled=true;note.textContent='Buscando endereços...';
 try{
 const start=await chooseRoutePoint(key,r.localEmbarque,'CONFIRMAR EMBARQUE');if(!start)throw Error('Consulta cancelada.');
 const end=await chooseRoutePoint(key,r.localDestino,'CONFIRMAR DESTINO');if(!end)throw Error('Consulta cancelada.');
 if(auth.currentUser?.uid!==uid||!card.isConnected)throw Error('Tela atualizada. Repita a consulta.');
 note.textContent='Calculando percurso...';
 const v=await routeSummary(key,[start,end]);
 if(auth.currentUser?.uid!==uid||!card.isConnected)throw Error('Tela atualizada. Repita a consulta.');
 card.querySelector('[data-price="kmPercurso"]').value=(v.distance/1000).toFixed(2);
 const time=card.querySelector('[data-price="tempoPercursoMin"]');time.value=Math.max(1,Math.round(v.duration/60));time.dispatchEvent(new Event('input',{bubbles:true}));
 note.textContent='Percurso calculado! Estimativa sem trânsito em tempo real. Confira os valores.';
 }catch(e){note.textContent='Não foi possível calcular: '+e.message+' Use o GPS manual.'}finally{routeBusy=false;b.disabled=false}
}

function quoteForm(r){
 const data=quoteDrafts.get(r.id)||r;
 const inputs=moneyFields.map(field=>{
  const value=data[field.name]??'';
  return '<label>'+field.label+'<input type="number" min="0" step="'+field.step+'" required data-price="'+field.name+'" value="'+esc(value)+'"></label>';
 }).join('');
 return '<div class="quote" data-quote-id="'+esc(r.id)+'"><h3>Cálculos da reserva</h3><div class="actions"><button type="button" data-action="gps" data-id="'+esc(r.id)+'">ABRIR GPS — CONSULTAR TRAJETO</button><button type="button" data-action="route" data-id="'+esc(r.id)+'">CALCULAR PERCURSO AUTOMATICAMENTE</button><button type="button" data-action="route-config" data-id="'+esc(r.id)+'">CONFIGURAR GPS</button></div><p data-route-note role="status">Rotas: openrouteservice / © OpenStreetMap contributors.</p><div class="quote-grid">'+inputs+'</div><span class="quote-total" data-total>Valor total: preencher os campos</span><p class="quote-note">Consulte o trajeto no Google Maps e informe a distância e o tempo estimados nos campos do orçamento.</p><div class="actions"><button data-action="quote" data-id="'+esc(r.id)+'">ENVIAR PROPOSTA AO CLIENTE</button><button class="danger" data-action="refuse" data-id="'+esc(r.id)+'">RECUSAR RESERVA</button></div></div>';
}
function renderHistory(){
 const sorted=items=>[...items].sort((a,b)=>(b.dataResposta?.seconds||b.dataRecusa?.seconds||0)-(a.dataResposta?.seconds||a.dataRecusa?.seconds||0));
 const quoteHtml=(r)=>'<div class="item"><strong>'+esc(r.codigoReserva)+' — '+esc(r.codigoCliente||'')+'</strong><p><b>Cliente:</b> '+esc(r.nomeCliente||'')+'<br><b>Orçamento nº:</b> '+esc(r.numeroOrcamento)+'<br><b>Valor:</b> '+moneyBRL(r.valorTotal||0)+'<br><b>Resposta:</b> '+esc(stamp(r.dataResposta))+'</p></div>';
 for(const [id,status,label] of [['acceptedQuotes','aceito','Nenhum orçamento aceito'],['refusedQuotes','recusado','Nenhum orçamento recusado']]){
  const items=sorted(quoteHistory.filter(x=>x.resposta===status));
  $(id).innerHTML=items.length?items.map(quoteHtml).join(''):'<p class="muted">'+label+'.</p>';
 }
 const completed=rows.filter(r=>r.statusReserva==='concluida').sort((a,b)=>(b.dataConclusao?.seconds||0)-(a.dataConclusao?.seconds||0));
 $('completedServices').innerHTML=completed.length?completed.map(r=>'<div class="item"><strong>'+esc(r.codigoReserva)+'</strong><p><b>Cliente:</b> '+esc(r.nomeCliente)+'<br><b>Motorista:</b> '+esc(r.nomeMotoristaDesignado||r.codigoMotorista||'Não informado')+'<br><b>Valor:</b> '+(Number.isFinite(r.valorViagem)?moneyBRL(r.valorViagem):'Não informado')+'<br><b>Conclusão:</b> '+esc(stamp(r.dataConclusao))+'</p></div>').join(''):'<p class="muted">Nenhum atendimento concluído.</p>';
 const refusals=sorted(refusalHistory);
 $('driverRefusals').innerHTML=refusals.length?refusals.map(r=>'<div class="item"><strong>'+esc(r.codigoReserva)+'</strong><p><b>Motorista:</b> '+esc(r.nomeMotorista||r.codigoMotorista||'')+'<br><b>Cliente:</b> '+esc(r.nomeCliente||'')+'<br><b>Data da recusa:</b> '+esc(stamp(r.dataRecusa))+'</p></div>').join(''):'<p class="muted">Nenhuma recusa de motorista registrada.</p>';
}
function renderQuoteStatus(){
 const screen=$('adminScreen8');if(!screen)return;
 let mount=screen.querySelector('[data-live-quote-status]');
 if(!mount){
  mount=document.createElement('div');mount.dataset.liveQuoteStatus='';mount.setAttribute('aria-live','polite');
  const back=screen.querySelector('[data-admin-screen="2"]');
  for(const child of [...screen.children])if(child.tagName!=='H2'&&child!==back)child.remove();
  screen.insertBefore(mount,back);
  mount.addEventListener('click',e=>{
   const b=e.target.closest('[data-designate]');if(!b)return;
   const r=rows.find(x=>x.id===b.dataset.designate&&x.statusReserva==='orcamento_aceito');if(!r)return;
   window.adminVisualShow(9);
   $('reservations').querySelector('select[data-driver-for="'+CSS.escape(r.id)+'"]')?.focus();
  });
 }
 const labels={orcamento_pendente:'AGUARDANDO RESPOSTA',orcamento_aceito:'ORÇAMENTO ACEITO',orcamento_recusado:'ORÇAMENTO RECUSADO'};
 const items=rows.filter(r=>Object.hasOwn(labels,r.statusReserva));
 mount.innerHTML=items.length?items.map(r=>'<article class="item"><p>Solicitação: '+esc(r.codigoReserva)+'<br>Cliente: '+esc(r.nomeCliente)+'<br>Data: '+esc(stamp(r.dataViagem))+'<br>Valor: '+(Number.isFinite(r.valorViagem)?moneyBRL(r.valorViagem):'Não informado')+'</p><p><strong>'+labels[r.statusReserva]+'</strong></p>'+(r.statusReserva==='orcamento_aceito'?'<button type="button" style="background:#218638!important;color:white!important" data-designate="'+esc(r.id)+'">DESIGNAR MOTORISTA</button>':'')+'</article>').join(''):'<p>Nenhum orçamento encontrado.</p>';
}
function renderOperationalScreens(){
 const mount=(n,html)=>{const screen=$('adminScreen'+n);if(!screen)return;let node=screen.querySelector('[data-live-operational]');if(!node){node=document.createElement('div');node.dataset.liveOperational='';const back=screen.querySelector('[data-admin-screen="2"]');for(const child of [...screen.children])if(child.tagName!=='H2'&&child!==back)child.remove();screen.insertBefore(node,back);}node.innerHTML=html;};
 const list=(items,fn,empty)=>items.length?items.map(fn).join(''):'<p class="muted">'+empty+'</p>';
 const trip=r=>'<article class="item"><strong>'+esc(r.codigoReserva||r.id)+'</strong><p>Cliente: '+esc(r.nomeCliente)+'<br>Motorista: '+esc(r.nomeMotoristaDesignado||'Não atribuído')+'<br>Embarque: '+esc(r.localEmbarque)+'<br>Destino: '+esc(r.localDestino)+'<br>Viagem: '+esc(stamp(r.dataViagem))+'<br>Situação: '+esc(r.statusReserva)+'<br>Valor: '+(Number.isFinite(r.valorViagem)?moneyBRL(r.valorViagem):'A calcular')+'</p></article>';
 mount(4,list(drivers,d=>'<article class="item"><strong>'+esc(d.codigoMotorista||'Sem código')+'</strong><p>Nome: '+esc(d.nomeMotorista)+'<br>Situação: '+esc(d.situacao||'Não informada')+'<br>Veículo: '+esc(d.veiculoModelo||d.modeloVeiculo||'Não informado')+'</p>'+(d.situacao==='pendente'?'<div class="actions"><button type="button" data-approve="'+esc(d.id)+'">APROVAR</button><button type="button" class="danger" data-reject="'+esc(d.id)+'">RECUSAR</button></div>':'')+'</article>','Nenhum motorista cadastrado.'));
 mount(10,list(rows.filter(r=>['oferecida','confirmada','em_andamento'].includes(r.statusReserva)),trip,'Nenhum atendimento ativo.'));
 mount(11,list(rows.filter(r=>['oferecida','confirmada','em_andamento'].includes(r.statusReserva)).sort((a,b)=>(a.dataViagem?.seconds||0)-(b.dataViagem?.seconds||0)),trip,'Nenhum atendimento agendado.'));
 mount(12,list(rows.filter(r=>r.statusReserva==='concluida'),trip,'Nenhum atendimento concluído.'));
}
function render(){
 renderQuoteStatus();
 renderOperationalScreens();
 const clientRefused=new Set(quoteHistory.filter(x=>x.resposta==='recusado').map(x=>x.codigoReserva).filter(Boolean));
 const driverRefused=new Set(refusalHistory.map(x=>x.codigoReserva).filter(Boolean));
 const f=$('filter').value,visible=rows.filter(r=>f==='todas'||r.statusReserva===f||(f==='cliente_recusou'&&(clientRefused.has(r.codigoReserva)||r.statusReserva==='orcamento_recusado'))||(f==='motorista_recusou'&&driverRefused.has(r.codigoReserva)));
 $('total').textContent=rows.length;
 $('pending').textContent=rows.filter(r=>r.statusReserva==='pendente').length;
 $('confirmed').textContent=rows.filter(r=>['confirmada','em_andamento'].includes(r.statusReserva)).length;
 $('completed').textContent=rows.filter(r=>r.statusReserva==='concluida').length;
 $('clientRefused').textContent=rows.filter(r=>clientRefused.has(r.codigoReserva)||r.statusReserva==='orcamento_recusado').length;
 $('driverRefused').textContent=rows.filter(r=>driverRefused.has(r.codigoReserva)).length;
 const available=drivers.filter(d=>(d.situacao==='ativo'||d.aprovado===true)&&d.codigoMotorista);
 $('reservations').innerHTML=visible.length?visible.map(r=>{
  const controls=['pendente','orcamento_recusado'].includes(r.statusReserva)?quoteForm(r):r.statusReserva==='orcamento_aceito'?`<div class="actions"><select aria-label="Motorista para reserva ${esc(r.codigoReserva)}" data-driver-for="${esc(r.id)}"><option value="">Escolha motorista autorizado</option>${available.map(d=>`<option value="${esc(d.id)}">${esc(d.nomeMotorista)} — ${esc(d.codigoMotorista)}</option>`).join('')}</select><button data-action="assign" data-id="${esc(r.id)}">CONFIRMAR</button></div>`:'';
  const notify=r.statusReserva==='oferecida'?`<div class="actions"><button class="secondary" data-action="whatsapp" data-id="${esc(r.id)}">Avisar motorista pelo WhatsApp</button></div>`:'';
  const driver=drivers.find(d=>d.id===r.motoristaUid);
  return `<article class="item"><h3>Reserva solicitada</h3><div class="top"><strong>${esc(r.codigoReserva||r.id)}</strong><span>${esc(r.statusReserva||'')}</span></div><p><b>Cliente:</b> ${esc(r.nomeCliente)} (${esc(r.codigoCliente)})<br><b>Telefone:</b> ${esc(r.telefoneCliente)}<br><b>Origem:</b> ${esc(r.localEmbarque)}<br><b>Destino:</b> ${esc(r.localDestino)}<br><b>Viagem:</b> ${esc(stamp(r.dataViagem))}<br><b>Passageiros:</b> ${esc(r.passageiros||1)}<br><b>Motorista designado:</b> ${esc(driver?.nomeMotorista||r.nomeMotoristaDesignado||'Não atribuído')}<br><b>Valor da Reserva:</b> ${Number.isFinite(r.valorViagem)&&r.numeroOrcamento?moneyBRL(r.valorViagem):'A calcular'}<br><b>Observações:</b> ${esc(r.observacoes||'Nenhuma')}</p>${controls}${notify}</article>`;
 }).join(''):'<p>Nenhuma reserva encontrada.</p>';
 for(const card of $('reservations').querySelectorAll('.quote[data-quote-id]')){
  try{card.querySelector('[data-total]').textContent='Valor total: '+moneyBRL(readQuoteInputs(card).valorViagem)}catch{}
 }
 renderHistory();
 $('driverApplicants').innerHTML=drivers.filter(d=>d.situacao==='pendente').length?
  drivers.filter(d=>d.situacao==='pendente').map(d=>`<article class="item"><strong>${esc(d.nomeMotorista)}</strong><p>E-mail: ${esc(d.email)}<br>Telefone: ${esc(d.telefoneMotorista||d.telefone)}<br>Veículo: ${esc(d.veiculoModelo||d.modeloVeiculo)} — ${esc(d.veiculoPlaca||d.placaVeiculo)} — ${esc(d.veiculoCor||d.corVeiculo)}</p><div class="actions"><button data-approve="${esc(d.id)}">APROVAR</button><button class="danger" data-reject="${esc(d.id)}">RECUSAR</button></div></article>`).join(''):
  '<p>Nenhum motorista aguardando autorização.</p>';
}
function readQuoteInputs(card){
 const data={};
 for(const field of moneyFields){
  const input=card.querySelector('input[data-price="'+field.name+'"]');
  if(!input||input.value.trim()===''||!input.checkValidity())throw Error('Preencha corretamente: '+field.label);
  data[field.name]=Number(input.value);
 }
 if(!Number.isInteger(data.tempoPercursoMin)||data.tempoPercursoMin>100000||data.kmPercurso>100000||['tarifaBase','valorPorKm','valorPorTempo','valorExtra'].some(k=>data[k]>1000000))throw Error('Valores fora dos limites permitidos para o orçamento.');
 const total=calculateFare(data);
 return {...data,valorViagem:total};
}
$('reservations').addEventListener('input',e=>{
 const card=e.target.closest('.quote[data-quote-id]');
 if(!card)return;
 const id=card.dataset.quoteId,draft={};
 for(const field of moneyFields)draft[field.name]=card.querySelector('[data-price="'+field.name+'"]').value;
 quoteDrafts.set(id,draft);
 try{
  const quote=readQuoteInputs(card);
  card.querySelector('[data-total]').textContent='Valor total: '+moneyBRL(quote.valorViagem);
 }catch{card.querySelector('[data-total]').textContent='Valor total: preencher os campos corretamente'}
});
$('reservations').addEventListener('click',async e=>{
 const b=e.target.closest('button[data-action]');if(!b)return;
 const r=rows.find(x=>x.id===b.dataset.id);if(!r)return;
 if(b.dataset.action==='route-config'){routeConfig();return;}
 if(b.dataset.action==='route'){await calculateRoute(b,r);return;}
 if(b.dataset.action==='gps'){
  const origin=String(r.localEmbarque||'').trim(),destination=String(r.localDestino||'').trim();
  if(!origin||!destination)return msg('Informe os locais de embarque e destino.',true);
  const url=new URL('https://www.google.com/maps/dir/');
  url.search=new URLSearchParams({api:'1',origin,destination,travelmode:'driving'}).toString();
  window.open(url.toString(),'_blank','noopener,noreferrer');return;
 }
 if(b.dataset.action==='whatsapp'){
  const d=drivers.find(x=>x.id===r.motoristaUid);if(!d)return msg('Motorista não encontrado.',true);
  const digits=phoneDigits(d.telefoneMotorista||d.telefone),phone=digits.startsWith('55')?digits:'55'+digits;
  if(!/^55\d{10,11}$/.test(phone))return msg('Telefone do motorista inválido.',true);
  const texto=`Porto Mobi - Nova corrida ${r.codigoReserva}\nEmbarque: ${r.localEmbarque}\nDestino: ${r.localDestino}\nData: ${stamp(r.dataViagem)}\nEntre no aplicativo do motorista para aceitar ou recusar.`;
  window.open('https://wa.me/'+phone+'?text='+encodeURIComponent(texto),'_blank','noopener,noreferrer');return;
 }
 if(b.dataset.action==='quote'){
  if(!['pendente','orcamento_recusado'].includes(r.statusReserva))return msg('Esta reserva não pode receber novo orçamento.',true);
  const card=b.closest('.quote');let data;
  try{data=readQuoteInputs(card)}catch(err){return msg(err.message,true)}
  const number=Number(r.numeroOrcamento||0)+1;
  if(!confirm('Enviar orçamento de '+moneyBRL(data.valorViagem)+' para o Cliente da reserva '+r.codigoReserva+'?'))return;
  b.disabled=true;
  try{
   await updateDoc(doc(db,'reservas',r.id),{...data,numeroOrcamento:number,statusReserva:'orcamento_pendente',dataAtualizacao:serverTimestamp()});
   quoteDrafts.delete(r.id);msg('Orçamento '+moneyBRL(data.valorViagem)+' enviado para avaliação do Cliente.');
  }catch(err){msg(errorText(err),true)}finally{b.disabled=false}
  return;
 }
 if(!['pendente','orcamento_aceito','orcamento_recusado'].includes(r.statusReserva))return msg('Esta reserva não pode ser alterada.',true);
 if(b.dataset.action==='refuse'){
  if(!confirm('Recusar a reserva '+r.codigoReserva+'?'))return;
  b.disabled=true;try{await updateDoc(doc(db,'reservas',r.id),{statusReserva:'recusada',motoristaUid:'',codigoMotorista:'',dataAtualizacao:serverTimestamp()});msg('Reserva recusada.')}catch(err){msg(errorText(err),true)}finally{b.disabled=false}return;
 }
 if(b.dataset.action==='assign'){
  const selected=$('reservations').querySelector(`select[data-driver-for="${CSS.escape(r.id)}"]`)?.value;
  if(r.statusReserva!=='orcamento_aceito')return msg('Aguarde o Cliente aceitar o orçamento.',true);
  const d=drivers.find(x=>x.id===selected&&(x.situacao==='ativo'||x.aprovado===true));
  if(!d)return msg('Selecione um motorista autorizado.',true);
  if(!confirm('Oferecer '+r.codigoReserva+' para '+d.nomeMotorista+'?'))return;
  b.disabled=true;try{
   await updateDoc(doc(db,'reservas',r.id),{statusReserva:'oferecida',motoristaUid:d.id,codigoMotorista:d.codigoMotorista,nomeMotoristaDesignado:d.nomeMotorista,dataAtualizacao:serverTimestamp()});
   if($('filter').value==='orcamento_aceito'){$('filter').value='oferecida';render();}
   msg('Corrida oferecida. Use o botão WhatsApp para avisar o motorista.');
  }catch(err){msg(errorText(err),true)}finally{b.disabled=false}
 }
});
function driverDecisionMessage(message,bad=false){
 msg(message,bad);
 for(const id of ['adminScreen4','adminScreen5']){
  const screen=$(id);if(!screen)continue;
  let notice=screen.querySelector('[data-driver-notice]');
  if(!notice){notice=document.createElement('p');notice.dataset.driverNotice='';notice.setAttribute('role','status');screen.querySelector('h2')?.after(notice);}
  notice.textContent=message;notice.style.color=bad?'#ff7777':'#8de49b';
 }
}
function confirmDriverDecision(message){
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');
  dialog.style.cssText='background:#080808;color:white;border:2px solid #D4AF37;border-radius:12px;padding:20px;max-width:85vw';
  const p=document.createElement('p');p.textContent=message;
  const yes=document.createElement('button');yes.type='button';yes.textContent='CONFIRMAR';
  const no=document.createElement('button');no.type='button';no.textContent='CANCELAR';
  dialog.append(p,yes,no);document.body.append(dialog);
  const finish=value=>{dialog.remove();resolve(value)};
  yes.onclick=()=>finish(true);no.onclick=()=>finish(false);
  dialog.addEventListener('cancel',e=>{e.preventDefault();finish(false)});
  if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
 });
}
async function handleDriverDecision(e){
 const reject=e.target.closest('button[data-reject]');
 if(reject){
  const d=drivers.find(x=>x.id===reject.dataset.reject&&x.situacao==='pendente');
  if(!d)return driverDecisionMessage('Cadastro não está pendente.',true);
  if(!await confirmDriverDecision('Recusar o cadastro de '+d.nomeMotorista+'? Esta ação não pode ser desfeita pelo aplicativo.'))return;
  reject.disabled=true;
  try{await updateDoc(doc(db,'motoristas',d.id),{situacao:'recusado',dataRecusa:serverTimestamp()});driverDecisionMessage('Cadastro de '+d.nomeMotorista+' recusado.')}
  catch(err){driverDecisionMessage('Não foi possível recusar: '+errorText(err),true)}
  finally{reject.disabled=false}
  return;
 }

 const b=e.target.closest('button[data-approve]');if(!b)return;
 const d=drivers.find(x=>x.id===b.dataset.approve&&x.situacao==='pendente');if(!d)return;
 if(!await confirmDriverDecision('Autorizar '+d.nomeMotorista+' como motorista?'))return;
 b.disabled=true;try{
  const ref=doc(db,'motoristas',d.id),counter=doc(db,'contadores','motoristas');
  await runTransaction(db,async t=>{
   const p=await t.get(ref),c=await t.get(counter);
   if(!p.exists()||p.data().situacao!=='pendente')throw new Error('Cadastro não está pendente.');
   if(!c.exists()&&drivers.some(v=>v.aprovado===true))throw new Error('O contador de motoristas antigos deve ser iniciado em 1 no Console Firebase antes de novas aprovações.');
   const next=(c.exists()?Number(c.data().ultimo||0):0)+1;
   if(next>3)throw new Error('Limite de 3 motoristas atingido.');
   t.set(counter,{ultimo:next,ultimoUid:d.id});
   t.update(ref,{situacao:'ativo',numeroMotorista:next,codigoMotorista:padCode('PMM',next),dataAprovacao:serverTimestamp()});
  });
  driverDecisionMessage('Motorista autorizado.');
 }catch(err){driverDecisionMessage(err.message||errorText(err),true)}finally{b.disabled=false}
}
$('driverApplicants').addEventListener('click',handleDriverDecision);
$('adminScreen4')?.addEventListener('click',handleDriverDecision);
onAuthStateChanged(auth,async user=>{
 stop();$('dashboard').classList.add('hidden');$('login').classList.remove('hidden');
 if(!user)return;
 try{
  const token=await getIdTokenResult(user,true);
  const byClaim=false; // A autorização exige cadastro administrativo vinculado ao UID e e-mail.
  const adminDoc=byClaim?null:await getDoc(doc(db,'administradores',user.uid));
  const byDocument=user.email?.toLowerCase()==='portomobirs@gmail.com' && adminDoc.exists() && adminDoc.data().ativo===true && adminDoc.data().papel==='administrador' && adminDoc.data().codigo==='PMA-001';
  if(!byDocument){msg('Esta conta não possui autorização administrativa.',true);await signOut(auth);return}
  $('who').textContent=user.email||'';$('login').classList.add('hidden');$('dashboard').classList.remove('hidden');msg('');
  const clientScreen=$('adminScreen3');
  if(clientScreen){
   let list=clientScreen.querySelector('[data-live-clients]');
   if(!list){
    list=document.createElement('div');list.dataset.liveClients='';list.setAttribute('aria-live','polite');
    const sample=clientScreen.querySelector('p');if(sample)sample.replaceWith(list);else clientScreen.insertBefore(list,clientScreen.querySelector('button'));
   }
   list.textContent='Carregando clientes...';
   unsubs.push(onSnapshot(collection(db,'clientes'),snap=>{
    const clients=snap.docs.map(d=>d.data()).sort((a,b)=>(a.numeroCliente||0)-(b.numeroCliente||0));
    list.innerHTML='<p>Total de clientes: '+clients.length+'</p>'+ (clients.length?clients.map(c=>'<article class="item"><strong>'+esc(c.codigoCliente||'')+'</strong><p>Nome: '+esc(c.nomeCliente||'Não informado')+'<br>Cadastro: '+esc(stamp(c.dataCadastro))+'<br>Telefone: '+esc(c.telefoneCliente||'Não informado')+'<br>E-mail: '+esc(c.email||'Não informado')+'</p></article>').join(''):'<p>Nenhum cliente cadastrado.</p>');
   },err=>{list.textContent='Erro ao carregar clientes: '+errorText(err);}));
  }
  unsubs.push(onSnapshot(collection(db,'reservas'),snap=>{rows=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.dataSolicitacao?.seconds||0)-(a.dataSolicitacao?.seconds||0));render()},err=>msg('Erro ao carregar reservas: '+errorText(err),true)));
  unsubs.push(onSnapshot(collection(db,'motoristas'),snap=>{drivers=snap.docs.map(d=>({id:d.id,...d.data()}));render()},err=>msg('Erro ao carregar motoristas: '+errorText(err),true)));
  unsubs.push(onSnapshot(collection(db,'historicoOrcamentos'),snap=>{quoteHistory=snap.docs.map(d=>({id:d.id,...d.data()}));render()},err=>msg('Erro ao consultar histórico de orçamentos: '+errorText(err),true)));
  unsubs.push(onSnapshot(collection(db,'historicoRecusasMotoristas'),snap=>{refusalHistory=snap.docs.map(d=>({id:d.id,...d.data()}));render()},err=>msg('Erro ao consultar recusas dos motoristas: '+errorText(err),true)));
 }catch(err){msg('Erro ao validar autorização: '+errorText(err),true)}
});
