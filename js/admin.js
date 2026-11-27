import {offerWhatsApp} from './common.js?v=wa25';
import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut,getIdTokenResult} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,collection,doc,getDoc,getDocsFromServer,onSnapshot,updateDoc,runTransaction,serverTimestamp,Timestamp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {firebaseConfig,padCode,esc,stamp,phoneDigits,errorText,calculateFare,moneyBRL} from './common.js';
const app=initializeApp(firebaseConfig,'porto-mobi-admin');
const auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
let unsubs=[],rows=[],drivers=[],quoteHistory=[],refusalHistory=[];
const quoteDrafts=new Map();
let manualClients=[],manualReady=false,manualBusy=false;
const msg=(s,bad=false)=>{$('message').textContent=s;$('message').className=bad?'error':'success'};
const stop=()=>{manualClients=[];manualReady=false;$('manualForm')?.reset();refreshManual();const clientScreen=$('adminScreen3');if(clientScreen){const list=clientScreen.querySelector('[data-live-clients]');if(list)list.textContent='Carregando clientes...';}for(const f of unsubs)f();unsubs=[];rows=[];drivers=[];quoteHistory=[];refusalHistory=[];quoteDrafts.clear();renderQuoteStatus();renderOperationalScreens()};
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

function quoteForm(r){
 const data=quoteDrafts.get(r.id)||r;
 const inputs=moneyFields.map(field=>{
  const value=data[field.name]??'';
  return '<label>'+field.label+'<input type="number" min="0" step="'+field.step+'" required data-price="'+field.name+'" value="'+esc(value)+'"></label>';
 }).join('');
 return '<div class="quote" data-quote-id="'+esc(r.id)+'"><h3>Cálculos da reserva</h3><div class="actions"><button type="button" data-action="gps" data-id="'+esc(r.id)+'">ABRIR GPS — CONSULTAR TRAJETO</button></div><div class="quote-grid">'+inputs+'</div><span class="quote-total" data-total>Valor total: preencher os campos</span><p class="quote-note">Consulte o trajeto no Google Maps e informe a distância e o tempo estimados nos campos do orçamento.</p><div class="actions"><button data-action="quote" data-id="'+esc(r.id)+'">ENVIAR PROPOSTA AO CLIENTE</button><button class="danger" data-action="refuse" data-id="'+esc(r.id)+'">RECUSAR RESERVA</button></div></div>';
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
  const back=screen.querySelector(':scope > .admin-refresh-row')||screen.querySelector(':scope > [data-admin-screen="2"]');
  for(const child of [...screen.children])if(child.tagName!=='H2'&&child!==back)child.remove();
  screen.insertBefore(mount,back?.nextSibling||null);
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
 const mount=(n,html)=>{const screen=$('adminScreen'+n);if(!screen)return;let node=screen.querySelector('[data-live-operational]');if(!node){node=document.createElement('div');node.dataset.liveOperational='';const back=screen.querySelector(':scope > .admin-refresh-row')||screen.querySelector(':scope > [data-admin-screen="2"]');for(const child of [...screen.children])if(child.tagName!=='H2'&&child!==back)child.remove();screen.insertBefore(node,back?.nextSibling||null);}node.innerHTML=html;};
 const list=(items,fn,empty)=>items.length?items.map(fn).join(''):'<p class="muted">'+empty+'</p>';
 const trip=r=>'<article class="item"><strong>'+esc(r.codigoReserva||r.id)+'</strong><p>Cliente: '+esc(r.nomeCliente)+'<br>Motorista: '+esc(r.nomeMotoristaDesignado||'Não atribuído')+'<br>Embarque: '+esc(r.localEmbarque)+'<br>Destino: '+esc(r.localDestino)+'<br>Viagem: '+esc(stamp(r.dataViagem))+'<br>Situação: '+esc(r.statusReserva)+'<br>Valor: '+(Number.isFinite(r.valorViagem)?moneyBRL(r.valorViagem):'A calcular')+'</p></article>';
 mount(4,list(drivers,d=>'<article class="item"><strong>'+esc(d.codigoMotorista||'Sem código')+'</strong><p>Nome: '+esc(d.nomeMotorista)+'<br>Situação: '+esc(d.situacao||'Não informada')+'<br>Veículo: '+esc(d.veiculoModelo||d.modeloVeiculo||'Não informado')+'</p>'+(d.situacao==='pendente'?'<div class="actions"><button type="button" data-approve="'+esc(d.id)+'">APROVAR</button><button type="button" class="danger" data-reject="'+esc(d.id)+'">RECUSAR</button></div>':'')+'</article>','Nenhum motorista cadastrado.'));
 mount(10,list(rows.filter(r=>['oferecida','confirmada','em_andamento'].includes(r.statusReserva)),trip,'Nenhum atendimento ativo.'));
 mount(11,list(rows.filter(r=>['oferecida','confirmada','em_andamento'].includes(r.statusReserva)).sort((a,b)=>(a.dataViagem?.seconds||0)-(b.dataViagem?.seconds||0)),trip,'Nenhum atendimento agendado.'));
 mount(12,list(rows.filter(r=>r.statusReserva==='concluida'),trip,'Nenhum atendimento concluído.'));
}
function render(){
 const selectedDrivers=new Map([...$('reservations').querySelectorAll('select[data-driver-for]')].map(el=>[el.dataset.driverFor,el.value]));
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
 for(const el of $('reservations').querySelectorAll('select[data-driver-for]')){const v=selectedDrivers.get(el.dataset.driverFor);if(v&&[...el.options].some(o=>o.value===v))el.value=v;}
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
   quoteDrafts.delete(r.id);msg('Orçamento '+moneyBRL(data.valorViagem)+' enviado para avaliação do Cliente.');offerWhatsApp(r.telefoneCliente,'Porto Mobi: orçamento '+r.codigoReserva+': '+moneyBRL(data.valorViagem)+'. Consulte o aplicativo.');
  }catch(err){msg(errorText(err),true)}finally{b.disabled=false}
  return;
 }
 if(!['pendente','orcamento_aceito','orcamento_recusado'].includes(r.statusReserva))return msg('Esta reserva não pode ser alterada.',true);
 if(b.dataset.action==='refuse'){
  if(!confirm('Recusar a reserva '+r.codigoReserva+'?'))return;
  b.disabled=true;try{await updateDoc(doc(db,'reservas',r.id),{statusReserva:'recusada',motoristaUid:'',codigoMotorista:'',dataAtualizacao:serverTimestamp()});msg('Reserva recusada.');offerWhatsApp(r.telefoneCliente,'Porto Mobi: reserva '+r.codigoReserva+' recusada. Entre em contato conosco.')}catch(err){msg(errorText(err),true)}finally{b.disabled=false}return;
 }
 if(b.dataset.action==='assign'){
  const selected=$('reservations').querySelector(`select[data-driver-for="${CSS.escape(r.id)}"]`)?.value;
  if(r.statusReserva!=='orcamento_aceito')return msg('Aguarde o Cliente aceitar o orçamento.',true);
  const d=drivers.find(x=>x.id===selected&&(x.situacao==='ativo'||x.aprovado===true));
  if(!d)return msg('Selecione um motorista autorizado.',true);
  try{scheduleConflict(d.id,r.dataViagem,Number(r.tempoPercursoMin),Number(r.intervaloDeslocamentoMin??30),r.id)}catch(err){return msg(err.message,true)}
  b.disabled=true;try{
   if(!await confirmDriverDecision('Oferecer '+r.codigoReserva+' para '+d.nomeMotorista+'?'))return;
   scheduleConflict(d.id,r.dataViagem,Number(r.tempoPercursoMin),Number(r.intervaloDeslocamentoMin??30),r.id);
   await updateDoc(doc(db,'reservas',r.id),{statusReserva:'oferecida',motoristaUid:d.id,codigoMotorista:d.codigoMotorista,nomeMotoristaDesignado:d.nomeMotorista,dataAtualizacao:serverTimestamp()});
   if($('filter').value==='orcamento_aceito'){$('filter').value='oferecida';render();}
   msg('Corrida oferecida. Use o botão WhatsApp para avisar o motorista.');offerWhatsApp(d.telefoneMotorista||d.telefone,'Porto Mobi: nova oferta '+r.codigoReserva+'. Consulte o aplicativo.');
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
  try{await updateDoc(doc(db,'motoristas',d.id),{situacao:'recusado',dataRecusa:serverTimestamp()});driverDecisionMessage('Cadastro de '+d.nomeMotorista+' recusado.');offerWhatsApp(d.telefoneMotorista||d.telefone,'Porto Mobi: cadastro de motorista não autorizado.')}
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
  driverDecisionMessage('Motorista autorizado.');offerWhatsApp(d.telefoneMotorista||d.telefone,'Porto Mobi: cadastro autorizado. Acesse o aplicativo.');
 }catch(err){driverDecisionMessage(err.message||errorText(err),true)}finally{b.disabled=false}
}
$('driverApplicants').addEventListener('click',handleDriverDecision);
$('adminScreen4')?.addEventListener('click',handleDriverDecision);
onAuthStateChanged(auth,async user=>{
 adminSessionUid=null;
 try{
 stop();$('dashboard').classList.add('hidden');$('login').classList.remove('hidden');
 if(!user)return;
 msg('Validando autorização administrativa...');
  const token=await getIdTokenResult(user,true);
  const byClaim=false; // A autorização exige cadastro administrativo vinculado ao UID e e-mail.
  const adminDoc=byClaim?null:await getDoc(doc(db,'administradores',user.uid));
  const byDocument=user.email?.toLowerCase()==='portomobirs@gmail.com' && adminDoc.exists() && adminDoc.data().ativo===true && adminDoc.data().papel==='administrador' && adminDoc.data().codigo==='PMA-001';
  if(!byDocument){msg('Esta conta não possui autorização administrativa.',true);await signOut(auth);return}
  adminSessionUid=user.uid;
  $('who').textContent=user.email||'';$('login').classList.add('hidden');$('dashboard').classList.remove('hidden');msg('');
  const clientScreen=$('adminScreen3');
  if(clientScreen){
   let list=clientScreen.querySelector('[data-live-clients]');
   if(!list){
    list=document.createElement('div');list.dataset.liveClients='';list.setAttribute('aria-live','polite');
    const sample=clientScreen.querySelector(':scope > p');if(sample)sample.replaceWith(list);else clientScreen.insertBefore(list,clientScreen.querySelector('button'));
   }
   list.textContent='Carregando clientes...';
   unsubs.push(onSnapshot(collection(db,'clientes'),snap=>{
    applyClientSnapshot(snap,list);
   },err=>{list.textContent='Erro ao carregar clientes: '+errorText(err);}));
  }
  unsubs.push(onSnapshot(collection(db,'reservas'),snap=>{rows=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.dataSolicitacao?.seconds||0)-(a.dataSolicitacao?.seconds||0));render()},err=>msg('Erro ao carregar reservas: '+errorText(err),true)));
  unsubs.push(onSnapshot(collection(db,'motoristas'),snap=>{drivers=snap.docs.map(d=>({id:d.id,...d.data()}));refreshManual();render()},err=>msg('Erro ao carregar motoristas: '+errorText(err),true)));
  unsubs.push(onSnapshot(collection(db,'historicoOrcamentos'),snap=>{quoteHistory=snap.docs.map(d=>({id:d.id,...d.data()}));render()},err=>msg('Erro ao consultar histórico de orçamentos: '+errorText(err),true)));
  unsubs.push(onSnapshot(collection(db,'historicoRecusasMotoristas'),snap=>{refusalHistory=snap.docs.map(d=>({id:d.id,...d.data()}));render()},err=>msg('Erro ao consultar recusas dos motoristas: '+errorText(err),true)));
 }catch(err){msg('Erro ao validar autorização: '+(err.message||errorText(err)),true)}
});


function scheduleConflict(driver,start,duration,buffer,exclude=''){
 const ms=v=>v?.toMillis?.()??(v instanceof Date?+v:v?.toDate?+v.toDate():NaN);
 const begin=ms(start),end=begin+(duration+buffer)*60000;
 if(!Number.isFinite(begin)||!Number.isFinite(duration)||duration<=0||!Number.isFinite(buffer)||buffer<0)throw Error('Informe a duração estimada do atendimento.');
 for(const r of rows){
  if(r.id===exclude||r.motoristaUid!==driver||!['oferecida','confirmada','em_andamento'].includes(r.statusReserva))continue;
  const other=ms(r.dataViagem),minutes=Number(r.tempoPercursoMin),gap=Number(r.intervaloDeslocamentoMin??30);
  if(!Number.isFinite(other)||!Number.isFinite(minutes)||minutes<=0||!Number.isFinite(gap)||gap<0)throw Error('CONFLITO DE HORÁRIOS: confira a duração da reserva '+r.codigoReserva+' antes de designar.');
  if(r.statusReserva==='em_andamento'&&begin<=Date.now())throw Error('Motorista em atendimento.');
  if(begin<other+(minutes+gap)*60000&&other<end)throw Error('CONFLITO DE HORÁRIOS: '+r.codigoReserva+' — '+stamp(r.dataViagem)+'. Selecione outro motorista ou altere o horário.');
 }
}
function refreshManual(){
 const c=$('manualClient'),d=$('manualDriver');if(!c||!d)return;
 const cv=c.value,dv=d.value;
 c.innerHTML='<option value="">Novo cliente sem aplicativo</option>'+manualClients.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.codigoCliente+' — '+x.nomeCliente+' — '+x.telefoneCliente)+'</option>').join('');
 d.innerHTML='<option value="">Designar depois</option>'+drivers.filter(x=>(x.situacao==='ativo'||x.aprovado===true)&&x.codigoMotorista).map(x=>'<option value="'+esc(x.id)+'">'+esc(x.codigoMotorista+' — '+x.nomeMotorista)+'</option>').join('');
 c.value=cv;d.value=dv;
 $('manualSubmit').disabled=!manualReady||manualBusy;
}
$('manualClient').onchange=()=>{
 const c=manualClients.find(x=>x.id===$('manualClient').value);
 $('manualPMC').value=c?.codigoCliente||'Automático';
 $('manualName').value=c?.nomeCliente||'';$('manualPhone').value=c?.telefoneCliente||'';
};
$('manualCancel').onclick=()=>{if(manualBusy)return;$('manualForm').reset();$('manualNotice').textContent='Lançamento cancelado.';window.adminVisualShow(2)};
$('manualForm').onsubmit=async e=>{
 e.preventDefault();if(manualBusy||!manualReady||!auth.currentUser)return;
 const notice=$('manualNotice'),uid=auth.currentUser.uid;
 const duration=Number($('manualDuration').value),buffer=Number($('manualBuffer').value);
 const selected=$('manualClient').value,name=$('manualName').value.trim(),phone=phoneDigits($('manualPhone').value);
 const pickup=$('manualPickup').value.trim(),dest=$('manualDestination').value.trim(),date=new Date($('manualDate').value+'T'+$('manualTime').value+':00-03:00'),pass=Number($('manualPassengers').value),value=Number($('manualValue').value),notes=$('manualNotes').value.trim(),driver=$('manualDriver').value;
 if(!Number.isInteger(duration)||duration<1||duration>100000||!Number.isInteger(buffer)||buffer<0||buffer>1440){notice.textContent='Confira duração e intervalo de deslocamento.';return}
 if(name.length<3||phone.length<10||phone.length>13||pickup.length<3||dest.length<3||!Number.isFinite(+date)||date<=new Date()||!Number.isInteger(pass)||pass<1||pass>4||!Number.isFinite(value)||value<0||value>1000000){notice.textContent='Confira os campos e informe uma data futura.';return}
 if(!selected&&manualClients.some(c=>phoneDigits(c.telefoneCliente||'')===phone)){notice.textContent='Telefone já cadastrado. Selecione o cliente existente.';return}
 manualBusy=true;refreshManual();
 try{
  if(!await confirmDriverDecision('Confirmar reserva manual de '+name+' por '+moneyBRL(value)+'?'))return;
  if(auth.currentUser?.uid!==uid)throw Error('Sessão alterada.');
  if(driver)scheduleConflict(driver,date,duration,buffer);
  notice.textContent='Registrando reserva...';
  const clientRef=doc(db,'clientes',selected||'manual-'+phone),tripRef=doc(collection(db,'reservas')),cc=doc(db,'contadores','clientes'),rc=doc(db,'contadores','reservas');
  const result=await runTransaction(db,async t=>{
   const client=await t.get(clientRef),counter=await t.get(rc),clientCounter=client.exists()?null:await t.get(cc),driverDoc=driver?await t.get(doc(db,'motoristas',driver)):null;
   if(selected&&!client.exists())throw Error('Cliente não encontrado.');
   if(!selected&&client.exists())throw Error('Cliente já cadastrado. Selecione-o na lista.');
   const d=driverDoc?.data();if(driver&&(!d||!(d.situacao==='ativo'||d.aprovado===true)||!d.codigoMotorista))throw Error('Motorista indisponível.');
   let pmc=client.data()?.codigoCliente;
   if(!client.exists()){
    const n=(clientCounter.exists()?clientCounter.data().ultimo:0)+1;if(n>40)throw Error('Limite de 40 clientes atingido.');
    pmc=padCode('PMC',n);
    t.set(cc,{ultimo:n,ultimoUid:clientRef.id});
    t.set(clientRef,{uid:clientRef.id,numeroCliente:n,codigoCliente:pmc,nomeCliente:name,telefoneCliente:phone,email:'',origemCadastro:'manual',dataCadastro:serverTimestamp()});
   }
   const n=(counter.exists()?counter.data().ultimo:0)+1,pmr=padCode('PMR',n);
   t.set(rc,{ultimo:n,ultimoReservaId:tripRef.id,ultimoClienteUid:clientRef.id});
   t.set(tripRef,{numeroReserva:n,codigoReserva:pmr,clienteUid:clientRef.id,codigoCliente:pmc,nomeCliente:name,telefoneCliente:phone,codigoMotorista:d?.codigoMotorista||'',motoristaUid:driver,nomeMotoristaDesignado:d?.nomeMotorista||'',localEmbarque:pickup,localDestino:dest,dataViagem:Timestamp.fromDate(date),dataSolicitacao:serverTimestamp(),dataAtualizacao:serverTimestamp(),passageiros:pass,observacoes:notes,statusReserva:driver?'oferecida':'orcamento_aceito',valorViagem:value,tempoPercursoMin:duration,intervaloDeslocamentoMin:buffer,numeroOrcamento:1,origemReserva:'manual'});
   return {pmc,pmr};
  });
  $('manualForm').reset();$('manualPMC').value=result.pmc;$('manualPMR').value=result.pmr;notice.textContent='Reserva '+result.pmr+' registrada com sucesso!';msg(notice.textContent);offerWhatsApp(phone,'Porto Mobi: reserva '+result.pmr+' registrada. Valor combinado: '+moneyBRL(value)+'. Aguarde confirmação.');if(driver){const d=drivers.find(x=>x.id===driver);offerWhatsApp(d?.telefoneMotorista||d?.telefone,'Porto Mobi: nova oferta '+result.pmr+'. Consulte o aplicativo.');}
 }catch(err){notice.textContent='Não foi possível registrar: '+(err.message||errorText(err));}
 finally{manualBusy=false;refreshManual()}
};

function applyClientSnapshot(snap,list){
    manualClients=snap.docs.map(d=>({id:d.id,...d.data()}));manualReady=true;refreshManual();
    const clients=snap.docs.map(d=>d.data()).sort((a,b)=>(a.numeroCliente||0)-(b.numeroCliente||0));
    list.innerHTML='<p>Total de clientes: '+clients.length+'</p>'+ (clients.length?clients.map(c=>'<article class="item"><strong>'+esc(c.codigoCliente||'')+'</strong><p>Nome: '+esc(c.nomeCliente||'Não informado')+'<br>Cadastro: '+esc(stamp(c.dataCadastro))+'<br>Telefone: '+esc(c.telefoneCliente||'Não informado')+'<br>E-mail: '+esc(c.email||'Não informado')+'</p></article>').join(''):'<p>Nenhum cliente cadastrado.</p>');
}
let refreshBusy=false,adminSessionUid=null;
async function refreshAdminData(){
 if(refreshBusy||manualBusy||!adminSessionUid||auth.currentUser?.uid!==adminSessionUid)return;
 const uid=adminSessionUid,buttons=[...document.querySelectorAll('[data-admin-refresh]')],notices=[...document.querySelectorAll('[data-refresh-notice]')];
 const status=(message,bad=false)=>{for(const n of notices){n.textContent=message;n.style.color=bad?'#ff7777':'#8de49b';}};
 refreshBusy=true;for(const b of buttons)b.disabled=true;status('Consultando Firebase...');
 try{
  const names=['clientes','motoristas','reservas','historicoOrcamentos','historicoRecusasMotoristas'];
  const [clients,ds,rs,qs,fs]=await Promise.all(names.map(n=>getDocsFromServer(collection(db,n))));
  if(auth.currentUser?.uid!==uid||adminSessionUid!==uid)return;
  const map=snap=>snap.docs.map(d=>({id:d.id,...d.data()}));
  drivers=map(ds);rows=map(rs).sort((a,b)=>(b.dataSolicitacao?.seconds||0)-(a.dataSolicitacao?.seconds||0));quoteHistory=map(qs);refusalHistory=map(fs);
  applyClientSnapshot(clients,$('adminScreen3').querySelector('[data-live-clients]'));render();
  status('Dados atualizados às '+new Date().toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo'})+'.');
 }catch(err){if(adminSessionUid===uid)status('Não foi possível atualizar. '+errorText(err),true);}
 finally{refreshBusy=false;for(const b of buttons)b.disabled=false;}
}
for(const screen of [$('adminVisualPanel'),...document.querySelectorAll('.admin-visual-screen')]){
 const heading=screen.querySelector('h1,h2');if(!heading)continue;
 const wrap=document.createElement('div');wrap.className='admin-refresh-row';wrap.style.setProperty('display','grid','important');wrap.style.setProperty('grid-template-columns',screen.id==='adminVisualPanel'?'1fr':'repeat(2,minmax(0,1fr))','important');wrap.style.setProperty('gap','8px','important');
 const b=document.createElement('button');b.type='button';b.dataset.adminRefresh='';b.textContent='↻ ATUALIZAR';b.onclick=refreshAdminData;for(const [k,v] of Object.entries({background:'#1565C0','background-image':'none',color:'#FFFFFF','border-color':'#1565C0',width:'100%',margin:'0'}))b.style.setProperty(k,v,'important');
 const notice=document.createElement('p');notice.style.setProperty('grid-column','1/-1','important');notice.dataset.refreshNotice='';notice.setAttribute('role','status');wrap.append(b);
 const back=[...screen.querySelectorAll(':scope > button[data-admin-screen="2"]')].find(el=>el.textContent.trim()==='PAINEL DO ADMINISTRADOR');
 if(back){back.textContent='PAINEL';back.dataset.adminPanelReturn='';back.style.setProperty('width','100%','important');back.style.setProperty('margin','0','important');wrap.append(back);}
 wrap.append(notice);heading.after(wrap);
}

 
// Atendimento via WhatsApp, usando os contatos cadastrados.
for(const [id,tipo] of [['adminScreen13','cliente'],['adminScreen14','motorista']]){
 const screen=$(id),panel=document.createElement('div');
 for(const el of [...screen.children])if(!el.matches('h2,.admin-refresh-row,button[data-admin-screen]'))el.remove();
 const select=document.createElement('select');select.setAttribute('aria-label','Selecionar '+tipo);
 const send=document.createElement('button');send.type='button';send.textContent='CONTATAR PELO WHATSAPP';
 const notice=document.createElement('p');notice.setAttribute('role','status');
 function load(){select.replaceChildren(new Option('Selecione um '+tipo,''));if(!adminSessionUid)return;for(const p of (tipo==='cliente'?manualClients:drivers))select.add(new Option(p.nomeCliente||p.nomeMotorista||p.id,p.id));}
 send.onclick=()=>{if(!adminSessionUid||auth.currentUser?.uid!==adminSessionUid)return;const p=(tipo==='cliente'?manualClients:drivers).find(x=>x.id===select.value);const phone=p?.telefoneCliente||p?.telefoneMotorista||p?.telefone;if(!phone){notice.textContent='Selecione um cadastro com telefone.';return;}offerWhatsApp(phone,'Olá! Aqui é o atendimento da Porto Mobi Executivo.');};
 panel.append(select,send,notice);screen.append(panel);
 onAuthStateChanged(auth,()=>{select.replaceChildren();notice.textContent='';});
 document.addEventListener('click',e=>{if(e.target.closest('[data-admin-screen="'+id.replace('adminScreen','')+'"]'))load();});
}

 // Financeiro: competência pela conclusão, valores inteiros em centavos.
 for(const n of [15,16,17,18,19]){
 const screen=$('adminScreen'+n);
 const nav=[...screen.querySelectorAll('button[data-admin-screen]')].filter(b=>!b.closest('.admin-refresh-row'));
 for(const el of [...screen.children])if(!el.matches('h2,.admin-refresh-row'))el.remove();
 const panel=document.createElement('div'), client=document.createElement('select'), month=document.createElement('input');
 month.type='month';month.value=new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'}).slice(0,7);
 client.setAttribute('aria-label','Cliente');month.setAttribute('aria-label','Mês de competência');
 const summary=document.createElement('pre');summary.style.whiteSpace='pre-wrap';
 const notice=document.createElement('p');notice.setAttribute('role','status');
 let current=null, trips=[], total=0, ready=false, busy=false, revision=0;
 const money=c=>moneyBRL(c/100);
 const button=(label,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=async()=>{if(busy)return;busy=true;try{await fn()}catch(e){notice.textContent=errorText(e)}finally{busy=false}};panel.append(b);};
 const input=(label,type)=>{const l=document.createElement('label'),i=document.createElement('input');i.type=type;l.textContent=label;l.append(i);panel.append(l);return i;};
 function clients(){const old=client.value;client.replaceChildren(new Option('Selecione o cliente',''));for(const p of manualClients)client.add(new Option((p.codigoCliente||'')+' — '+p.nomeCliente,p.id));client.value=old;}
 function key(){return client.value+'_'+month.value;}
 function authorized(){return adminSessionUid&&auth.currentUser?.uid===adminSessionUid;}
 function monthOf(r){const d=r.dataConclusao?.toDate?.()||new Date((r.dataConclusao?.seconds||0)*1000);return d.toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'}).slice(0,7);}
 async function load(){const v=++revision,uid=adminSessionUid;ready=false;current=null;summary.textContent='';if(!authorized()||!month.value)return;
 try{
 if(n===15){const snap=await getDocsFromServer(collection(db,'fechamentos'));if(v!==revision||uid!==adminSessionUid)return;const docs=snap.docs.map(d=>d.data()).filter(d=>d.mes===month.value);const billed=docs.reduce((s,d)=>s+d.total-d.desconto,0),paid=docs.reduce((s,d)=>s+d.recebido,0);summary.textContent='Fechamentos: '+docs.length+'\nFaturado: '+money(billed)+'\nRecebido: '+money(paid)+'\nA receber: '+money(billed-paid);return;}
 if(!client.value)return;const k=key();const snap=await getDoc(doc(db,'fechamentos',k));if(v!==revision||uid!==adminSessionUid||k!==key())return;
 current=snap.exists()?snap.data():null;trips=rows.filter(r=>r.clienteUid===client.value&&r.statusReserva==='concluida'&&monthOf(r)===month.value);
 if(trips.some(r=>!Number.isFinite(r.valorViagem)||r.valorViagem<0))throw Error('Existem corridas sem valor válido.');
 total=trips.reduce((s,r)=>s+Math.round(r.valorViagem*100),0);ready=true;
 summary.textContent=trips.map(r=>r.codigoReserva+' — '+money(Math.round(r.valorViagem*100))+' — '+r.localEmbarque+' / '+r.localDestino).join('\n')+'\nTotal de atendimentos: '+trips.length+'\nTotal: '+money(total)+(current?'\nFechamento: '+money(current.total-current.desconto)+'\nRecebido: '+money(current.recebido)+'\nSaldo: '+money(current.total-current.desconto-current.recebido)+'\nVencimento: '+current.vencimento:'\nSem fechamento registrado.');
 notice.textContent='';
 }catch(e){if(v===revision)notice.textContent=errorText(e)}}
 function requireReady(){if(!authorized()||!ready||!client.value)throw Error('Selecione cliente e mês e aguarde a consulta.');}
 function send(text){requireReady();const p=manualClients.find(p=>p.id===client.value);if(!p?.telefoneCliente)throw Error('Cliente sem telefone cadastrado.');offerWhatsApp(p.telefoneCliente,'Porto Mobi Executivo — '+month.value+'\n'+text);}
 if(n!==15)panel.append(client);panel.append(month,summary,notice);
 if(n===16){button('GERAR EXTRATO',async()=>{requireReady();window.print()});button('ENVIAR AO CLIENTE',async()=>send(summary.textContent));}
 if(n===17){const discount=input('Desconto (R$)','number'),due=input('Vencimento','date');discount.min='0';discount.step='0.01';discount.value='0';const advance=input('Valor antecipado (R$)','number');advance.min='0';advance.step='0.01';advance.value='0';const advanceDate=input('Data do adiantamento','date');
 const setDue=()=>{const [y,m]=month.value.split('-').map(Number);due.value=y&&m?String(y+(m===12?1:0)).padStart(4,'0')+'-'+String(m===12?1:m+1).padStart(2,'0')+'-05':'';};due.readOnly=true;month.addEventListener('change',setDue);setDue();
 button('CONFIRMAR FECHAMENTO',async()=>{requireReady();const uid=adminSessionUid,k=key(),d=Math.round(Number(discount.value)*100),v=due.value;if(current||!trips.length||!Number.isSafeInteger(d)||d<0||d>total||!v)throw Error('Verifique os atendimentos, desconto e vencimento.');const antecipado=Math.round(Number(advance.value)*100),dataAntecipada=advanceDate.value;if(!Number.isSafeInteger(antecipado)||antecipado<0||antecipado>total-d||(antecipado>0&&!dataAntecipada))throw Error('Informe adiantamento válido e sua data.');const data={clienteUid:client.value,mes:month.value,total,desconto:d,vencimento:v,reservas:trips.map(r=>r.id),recebido:antecipado,pagamentos:antecipado?[{valor:antecipado,data:dataAntecipada,forma:'Adiantamento'}]:[],criadoEm:serverTimestamp()};if(!await confirmDriverDecision('Confirmar fechamento de '+money(total-d)+' com adiantamento de '+money(antecipado)+'?')||adminSessionUid!==uid||key()!==k)return;await runTransaction(db,async t=>{const ref=doc(db,'fechamentos',k);if((await t.get(ref)).exists())throw Error('Fechamento já registrado.');t.set(ref,data)});await load();notice.textContent='Fechamento registrado.';});}
 if(n===18){
 function invoice(){requireReady();if(!current)throw Error('Confirme o fechamento mensal primeiro.');const items=current.reservas.map(id=>rows.find(r=>r.id===id));if(items.some(r=>!r))throw Error('Atendimento do fechamento indisponível.');const date=r=>r.dataViagem?.toDate?.()||new Date((r.dataViagem?.seconds||0)*1000);const sorted=items.sort((a,b)=>date(a)-date(b));const balance=current.total-current.desconto-current.recebido;return 'FATURA MENSAL DE ATENDIMENTOS — Porto Mobi Executivo\nCliente: '+client.selectedOptions[0].textContent+'\nCompetência: '+month.value+'\nVencimento: '+current.vencimento.split('-').reverse().join('/')+'\n'+sorted.map(r=>date(r).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'})+' | '+r.localEmbarque+' | '+r.localDestino+' | '+money(Math.round(r.valorViagem*100))).join('\n')+'\nTotal: '+money(current.total)+'\nDesconto: '+money(current.desconto)+'\nRecebido: '+money(current.recebido)+'\nSaldo a pagar: '+money(balance);}
 button('VISUALIZAR FATURA',async()=>{summary.textContent=invoice()});
 button('IMPRIMIR FATURA',async()=>{summary.textContent=invoice();window.print()});
 button('ENVIAR RESUMO DA FATURA',async()=>send(invoice()));
 function receipt(){requireReady();if(!current||current.recebido<=0)throw Error('Nenhum pagamento registrado para emitir recibo.');return 'RECIBO — Porto Mobi Executivo\nCliente: '+client.selectedOptions[0].textContent+'\nCompetência: '+month.value+'\nValor recebido: '+money(current.recebido)+'\n'+current.pagamentos.map(p=>p.data+' — '+money(p.valor)+' — '+p.forma).join('\n');}button('VISUALIZAR DOCUMENTO',async()=>{summary.textContent=receipt()});button('GERAR PDF',async()=>{summary.textContent=receipt();window.print()});button('ENVIAR AO CLIENTE',async()=>send(receipt()));}
 if(n===19){const amount=input('Valor recebido (R$)','number'),date=input('Data do pagamento','date'),method=document.createElement('select');amount.min='0.01';amount.step='0.01';for(const f of ['PIX','Dinheiro','Transferência','Cartão'])method.add(new Option(f,f));panel.append(method);
 button('CONFIRMAR PAGAMENTO',async()=>{requireReady();const uid=adminSessionUid,k=key(),valor=Math.round(Number(amount.value)*100),data=date.value,forma=method.value;if(!current||!Number.isSafeInteger(valor)||valor<=0||!data||valor>current.total-current.desconto-current.recebido)throw Error('Informe pagamento válido dentro do saldo.');if(!await confirmDriverDecision('Registrar recebimento de '+money(valor)+'?')||adminSessionUid!==uid||key()!==k)return;await runTransaction(db,async t=>{const ref=doc(db,'fechamentos',k),snap=await t.get(ref);if(!snap.exists())throw Error('Fechamento inexistente.');const f=snap.data();if(valor>f.total-f.desconto-f.recebido)throw Error('Valor excede saldo atualizado.');t.update(ref,{recebido:f.recebido+valor,pagamentos:[...f.pagamentos,{valor,data,forma}]});});amount.value='';await load();notice.textContent='Pagamento registrado.';});
 button('HISTÓRICO DE PAGAMENTOS',async()=>{requireReady();summary.textContent=current?.pagamentos.map(p=>p.data+' — '+money(p.valor)+' — '+p.forma).join('\n')||'Nenhum pagamento registrado.';});}
 screen.append(panel,...nav);client.onchange=load;month.onchange=load;
 document.addEventListener('click',e=>{if(e.target.closest('[data-admin-screen="'+n+'"]')||e.target.closest('#adminScreen'+n+' [data-admin-refresh]')){clients();load();}});
 onAuthStateChanged(auth,()=>{revision++;ready=false;current=null;trips=[];total=0;client.replaceChildren();summary.textContent='';notice.textContent='';});
 }
