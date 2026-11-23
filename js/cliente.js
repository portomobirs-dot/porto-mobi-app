import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,onAuthStateChanged,createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut,deleteUser} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,doc,getDoc,runTransaction,collection,query,where,getDocs,serverTimestamp,Timestamp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {firebaseConfig,padCode,todayLocal,esc,formatPhone,phoneDigits,errorText} from './common.js';

// Nome diferente por aplicativo = sessao Firebase Auth independente no navegador.
const app=initializeApp(firebaseConfig,'porto-mobi-clientes');
const auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
const views=['loginView','registerView','registerReview','homeView','bookingView','bookingReview'];
const message=(s,bad=false)=>{const el=$('message');el.textContent=s;el.className='status '+(bad?'error':'success')};
const show=id=>{views.forEach(v=>$(v).classList.toggle('hidden',v!==id));message('')};
const val=id=>$(id).value.trim();
$('travelDate').min=todayLocal();
let currentProfile=null,currentUser=null,registering=false,loadingHome=false;

for(const btn of document.querySelectorAll('[data-toggle]'))btn.addEventListener('click',()=>{
 const el=$(btn.dataset.toggle);el.type=el.type==='password'?'text':'password';btn.textContent=el.type==='password'?'Mostrar':'Ocultar';
});
$('showRegister').onclick=()=>show('registerView');
$('backLogin').onclick=()=>show('loginView');
$('editRegister').onclick=()=>show('registerView');
$('backHome').onclick=()=>show('homeView');
$('editBooking').onclick=()=>show('bookingView');
$('showBooking').onclick=()=>show('bookingView');
$('regPhone').addEventListener('input',e=>{e.target.value=formatPhone(e.target.value)});
$('loginForm').onsubmit=async e=>{
 e.preventDefault();try{message('Entrando...');await signInWithEmailAndPassword(auth,val('loginEmail'),$('loginPassword').value)}
 catch(err){message(errorText(err),true)}
};
$('reviewRegister').onclick=()=>{
 if(!$('registerForm').reportValidity())return;
 if($('regPassword').value!==$('regConfirm').value)return message('As senhas não coincidem.',true);
 if(![10,11].includes(phoneDigits(val('regPhone')).length))return message('Informe telefone com DDD.',true);
 $('registerSummary').textContent=`Nome: ${val('regName')}\nTelefone: ${val('regPhone')}\nE-mail: ${val('regEmail')}`;
 $('registerSummary').style.whiteSpace='pre-line';show('registerReview');
};
$('confirmRegister').onclick=async()=>{
 const b=$('confirmRegister');b.disabled=true;registering=true;let cred=null;
 try{
  message('Criando sua conta...');
  cred=await createUserWithEmailAndPassword(auth,val('regEmail'),$('regPassword').value);
  currentUser=cred.user;
  await createProfile(cred.user);
  await loadHome();message('Cadastro realizado!');
 }catch(err){
  // Evita deixar uma conta Authentication sem perfil quando a transacao falha.
  if(cred){try{await deleteUser(cred.user);currentUser=null}catch(_){/* pode requerer suporte da administracao */}}
  show('registerView');message('Cadastro não concluído. '+errorText(err),true);
 }finally{registering=false;b.disabled=false}
};
async function createProfile(user){
 const ref=doc(db,'clientes',user.uid),counter=doc(db,'contadores','clientes');
 return runTransaction(db,async t=>{
  const profile=await t.get(ref),c=await t.get(counter);
  if(profile.exists())return profile.data();
  const next=(c.exists()?Number(c.data().ultimo||0):0)+1;
  if(next>20)throw Object.assign(new Error('Limite de 20 clientes atingido.'),{code:'limite-clientes'});
  const data={uid:user.uid,numeroCliente:next,codigoCliente:padCode('PMC',next),nomeCliente:val('regName'),telefoneCliente:val('regPhone'),email:user.email,dataCadastro:serverTimestamp()};
  t.set(counter,{ultimo:next,ultimoUid:user.uid});t.set(ref,data);return data;
 });
}
$('logout').onclick=async()=>{await signOut(auth);currentProfile=null;currentUser=null;show('loginView')};
$('reviewBooking').onclick=()=>{
 if(!$('bookingForm').reportValidity())return;
 const when=new Date(`${val('travelDate')}T${val('travelTime')}:00`);
 if(!Number.isFinite(when.getTime())||when.getTime()<=Date.now())return message('Escolha data e horário futuros.',true);
 $('bookingSummary').textContent=`Embarque: ${val('pickup')}\nDestino: ${val('destination')}\nData: ${val('travelDate')}\nHorário: ${val('travelTime')}\nObservações: ${val('notes')||'Nenhuma'}`;
 $('bookingSummary').style.whiteSpace='pre-line';show('bookingReview');
};
$('confirmBooking').onclick=async()=>{
 if(!currentUser||!currentProfile)return message('Entre na sua conta novamente.',true);
 const b=$('confirmBooking');b.disabled=true;
 try{
  message('Enviando solicitação...');
  const counter=doc(db,'contadores','reservas'),newRef=doc(collection(db,'reservas'));
  await runTransaction(db,async t=>{
   const c=await t.get(counter),next=(c.exists()?Number(c.data().ultimo||0):0)+1;
   if(next>9999)throw new Error('Limite de numeração atingido.');
   const data={numeroReserva:next,codigoReserva:padCode('PMR',next),clienteUid:currentUser.uid,codigoCliente:currentProfile.codigoCliente,nomeCliente:currentProfile.nomeCliente,telefoneCliente:currentProfile.telefoneCliente,
    codigoMotorista:'',motoristaUid:'',localEmbarque:val('pickup'),localDestino:val('destination'),dataViagem:Timestamp.fromDate(new Date(`${val('travelDate')}T${val('travelTime')}:00`)),dataSolicitacao:serverTimestamp(),observacoes:val('notes'),statusReserva:'pendente',valorViagem:0};
   t.set(counter,{ultimo:next,ultimoReservaId:newRef.id,ultimoClienteUid:currentUser.uid});t.set(newRef,data);
  });
  $('bookingForm').reset();$('travelDate').min=todayLocal();await loadHome();message('Solicitação enviada! Aguarde a administração.');
 }catch(err){message('Não foi possível solicitar: '+errorText(err),true)}finally{b.disabled=false}
};
const completed=new Set(['concluida','recusada','cancelada','cancelado','encerrada','finalizada']);
function reservationHtml(r){
 const dt=r.dataViagem?.toDate?.();const money=Number(r.valorViagem)>0?Number(r.valorViagem).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'A definir';
 return `<div class="item"><strong>${esc(r.codigoReserva)}</strong> — ${esc(r.statusReserva)}<p class="small">${esc(r.localEmbarque)} → ${esc(r.localDestino)}<br>${dt?dt.toLocaleString('pt-BR'):'Data não informada'}<br>Valor: ${money}</p></div>`;
}
async function loadHome(){
 if(!currentUser||loadingHome)return;loadingHome=true;
 try{
  const snap=await getDoc(doc(db,'clientes',currentUser.uid));
  if(!snap.exists()){currentProfile=null;show('loginView');message('Sua conta não possui perfil de cliente. Contate a administração.',true);return}
  currentProfile=snap.data();$('profileInfo').textContent=`${currentProfile.nomeCliente||''} • ${currentProfile.codigoCliente||''}`;
  show('homeView');$('activeReservations').textContent='Carregando...';$('reservationHistory').textContent='Carregando...';
  const rs=await getDocs(query(collection(db,'reservas'),where('clienteUid','==',currentUser.uid)));
  const data=rs.docs.map(d=>d.data()).sort((a,b)=>(b.dataSolicitacao?.seconds||0)-(a.dataSolicitacao?.seconds||0));
  const active=data.filter(r=>!completed.has(String(r.statusReserva).toLowerCase()));const history=data.filter(r=>completed.has(String(r.statusReserva).toLowerCase()));
  $('activeReservations').innerHTML=active.length?active.map(reservationHtml).join(''):'<p>Nenhuma reserva em andamento.</p>';
  $('reservationHistory').innerHTML=history.length?history.map(reservationHtml).join(''):'<p>Nenhuma reserva no histórico.</p>';
 }catch(err){message('Não foi possível carregar suas reservas. '+errorText(err),true)}finally{loadingHome=false}
}
onAuthStateChanged(auth,async user=>{
 if(registering)return;currentUser=user;
 if(!user){currentProfile=null;show('loginView');return}
 await loadHome();
});
