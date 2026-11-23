import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut,getIdTokenResult} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,collection,doc,getDoc,onSnapshot,updateDoc,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {firebaseConfig,padCode,esc,stamp,phoneDigits,errorText} from './common.js';
const app=initializeApp(firebaseConfig,'porto-mobi-admin');
const auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
let unsubs=[],rows=[],drivers=[];
const msg=(s,bad=false)=>{$('message').textContent=s;$('message').className=bad?'error':'success'};
const stop=()=>{for(const f of unsubs)f();unsubs=[];rows=[];drivers=[]};
$('loginForm').onsubmit=async e=>{e.preventDefault();try{msg('Entrando...');await signInWithEmailAndPassword(auth,$('email').value.trim(),$('password').value)}catch(err){msg(errorText(err),true)}};
$('logout').onclick=()=>signOut(auth);
$('filter').onchange=render;
function render(){
 const f=$('filter').value,visible=rows.filter(r=>f==='todas'||r.statusReserva===f);
 $('total').textContent=rows.length;
 $('pending').textContent=rows.filter(r=>r.statusReserva==='pendente').length;
 $('confirmed').textContent=rows.filter(r=>['confirmada','em_andamento'].includes(r.statusReserva)).length;
 const available=drivers.filter(d=>d.situacao==='ativo'||d.aprovado===true);
 $('reservations').innerHTML=visible.length?visible.map(r=>{
  const controls=r.statusReserva==='pendente'?`<div class="actions"><select aria-label="Motorista para reserva ${esc(r.codigoReserva)}" data-driver-for="${esc(r.id)}"><option value="">Escolha motorista autorizado</option>${available.map(d=>`<option value="${esc(d.id)}">${esc(d.nomeMotorista)} — ${esc(d.codigoMotorista)}</option>`).join('')}</select><button data-action="assign" data-id="${esc(r.id)}">Oferecer corrida</button><button class="danger" data-action="refuse" data-id="${esc(r.id)}">Recusar</button></div>`:'';
  const notify=r.statusReserva==='oferecida'?`<div class="actions"><button class="secondary" data-action="whatsapp" data-id="${esc(r.id)}">Avisar motorista pelo WhatsApp</button></div>`:'';
  const driver=drivers.find(d=>d.id===r.motoristaUid);
  return `<article class="item"><div class="top"><strong>${esc(r.codigoReserva||r.id)}</strong><span>${esc(r.statusReserva||'')}</span></div><p><b>Cliente:</b> ${esc(r.nomeCliente)} (${esc(r.codigoCliente)})<br><b>Telefone:</b> ${esc(r.telefoneCliente)}<br><b>Origem:</b> ${esc(r.localEmbarque)}<br><b>Destino:</b> ${esc(r.localDestino)}<br><b>Viagem:</b> ${esc(stamp(r.dataViagem))}<br><b>Passageiros:</b> ${esc(r.passageiros||1)}<br><b>Motorista:</b> ${esc(driver?.nomeMotorista||'Não atribuído')}<br><b>Observações:</b> ${esc(r.observacoes||'Nenhuma')}</p>${controls}${notify}</article>`;
 }).join(''):'<p>Nenhuma reserva encontrada.</p>';
 $('driverApplicants').innerHTML=drivers.filter(d=>d.situacao==='pendente').length?
  drivers.filter(d=>d.situacao==='pendente').map(d=>`<article class="item"><strong>${esc(d.nomeMotorista)}</strong><p>E-mail: ${esc(d.email)}<br>Telefone: ${esc(d.telefoneMotorista||d.telefone)}<br>Veículo: ${esc(d.veiculoModelo||d.modeloVeiculo)} — ${esc(d.veiculoPlaca||d.placaVeiculo)} — ${esc(d.veiculoCor||d.corVeiculo)}</p><button data-approve="${esc(d.id)}">Autorizar motorista</button></article>`).join(''):
  '<p>Nenhum motorista aguardando autorização.</p>';
}
$('reservations').addEventListener('click',async e=>{
 const b=e.target.closest('button[data-action]');if(!b)return;
 const r=rows.find(x=>x.id===b.dataset.id);if(!r)return;
 if(b.dataset.action==='whatsapp'){
  const d=drivers.find(x=>x.id===r.motoristaUid);if(!d)return msg('Motorista não encontrado.',true);
  const digits=phoneDigits(d.telefoneMotorista||d.telefone),phone=digits.startsWith('55')?digits:'55'+digits;
  if(!/^55\d{10,11}$/.test(phone))return msg('Telefone do motorista inválido.',true);
  const texto=`Porto Mobi - Nova corrida ${r.codigoReserva}\nEmbarque: ${r.localEmbarque}\nDestino: ${r.localDestino}\nData: ${stamp(r.dataViagem)}\nEntre no aplicativo do motorista para aceitar ou recusar.`;
  window.open('https://wa.me/'+phone+'?text='+encodeURIComponent(texto),'_blank','noopener,noreferrer');return;
 }
 if(r.statusReserva!=='pendente')return msg('Esta reserva não está pendente.',true);
 if(b.dataset.action==='refuse'){
  if(!confirm('Recusar a reserva '+r.codigoReserva+'?'))return;
  b.disabled=true;try{await updateDoc(doc(db,'reservas',r.id),{statusReserva:'recusada',motoristaUid:'',codigoMotorista:'',dataAtualizacao:serverTimestamp()});msg('Reserva recusada.')}catch(err){msg(errorText(err),true)}finally{b.disabled=false}return;
 }
 if(b.dataset.action==='assign'){
  const selected=$('reservations').querySelector(`select[data-driver-for="${CSS.escape(r.id)}"]`)?.value;
  const d=drivers.find(x=>x.id===selected&&(x.situacao==='ativo'||x.aprovado===true));
  if(!d)return msg('Selecione um motorista autorizado.',true);
  if(!confirm('Oferecer '+r.codigoReserva+' para '+d.nomeMotorista+'?'))return;
  b.disabled=true;try{
   await updateDoc(doc(db,'reservas',r.id),{statusReserva:'oferecida',motoristaUid:d.id,codigoMotorista:d.codigoMotorista,dataAtualizacao:serverTimestamp()});
   msg('Corrida oferecida. Use o botão WhatsApp para avisar o motorista.');
  }catch(err){msg(errorText(err),true)}finally{b.disabled=false}
 }
});
$('driverApplicants').addEventListener('click',async e=>{
 const b=e.target.closest('button[data-approve]');if(!b)return;
 const d=drivers.find(x=>x.id===b.dataset.approve&&x.situacao==='pendente');if(!d)return;
 if(!confirm('Autorizar '+d.nomeMotorista+' como motorista?'))return;
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
  msg('Motorista autorizado.');
 }catch(err){msg(err.message||errorText(err),true)}finally{b.disabled=false}
});
onAuthStateChanged(auth,async user=>{
 stop();$('dashboard').classList.add('hidden');$('login').classList.remove('hidden');
 if(!user)return;
 try{
  const token=await getIdTokenResult(user,true);
  const byClaim=token.claims.admin===true;
  const adminDoc=byClaim?null:await getDoc(doc(db,'administradores',user.uid));
  const byDocument=byClaim||(adminDoc.exists()&&adminDoc.data().ativo===true);
  if(!byDocument){msg('Esta conta não possui autorização administrativa.',true);await signOut(auth);return}
  $('who').textContent=user.email||'';$('login').classList.add('hidden');$('dashboard').classList.remove('hidden');msg('');
  unsubs.push(onSnapshot(collection(db,'reservas'),snap=>{rows=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.dataSolicitacao?.seconds||0)-(a.dataSolicitacao?.seconds||0));render()},err=>msg('Erro ao carregar reservas: '+errorText(err),true)));
  unsubs.push(onSnapshot(collection(db,'motoristas'),snap=>{drivers=snap.docs.map(d=>({id:d.id,...d.data()}));render()},err=>msg('Erro ao carregar motoristas: '+errorText(err),true)));
 }catch(err){msg('Erro ao validar autorização: '+errorText(err),true)}
});
