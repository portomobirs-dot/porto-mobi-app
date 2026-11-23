import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,onAuthStateChanged,createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut,deleteUser,sendPasswordResetEmail} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,doc,getDoc,runTransaction,writeBatch,collection,query,where,getDocs,serverTimestamp,Timestamp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {firebaseConfig,padCode,todayLocal,esc,formatPhone,phoneDigits,errorText,moneyBRL} from './common.js';

// Nome diferente por aplicativo = sessao Firebase Auth independente no navegador.
const app=initializeApp(firebaseConfig,'porto-mobi-clientes');
const auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
const views=['loginView','registerView','registerReview','homeView','bookingView','bookingReview'];
const message=(s,bad=false)=>{const el=$('message');el.textContent=s;el.className='status '+(bad?'error':'success')};
const show=id=>{views.forEach(v=>$(v).classList.toggle('hidden',v!==id));message('')};
const val=id=>$(id).value.trim();
$('travelDate').min=todayLocal();
$('regDate').value=todayLocal();
$('bookingCreatedDate').value=todayLocal();
const setBookingCount=n=>{$('passengers').value=String(Math.min(8,Math.max(1,Number(n)||1)))};
$('decreasePassengers').onclick=()=>setBookingCount(Number($('passengers').value)-1);
$('increasePassengers').onclick=()=>setBookingCount(Number($('passengers').value)+1);
async function copyCode(id){const code=$(id).value;if(!/^(PMC-\d{4}|PMR-\d{6})$/.test(code)||/^PM[CR]-0+$/.test(code))return message('Código ainda não disponível.',true);try{await navigator.clipboard.writeText(code);message('Código '+code+' copiado.')}catch{$(id).focus();$(id).select();message('Copie o código selecionado: '+code)}}
$('copyClientCode').onclick=()=>copyCode('clientCode');
$('copyBookingCode').onclick=()=>copyCode('lastBookingCode');
$('forgotPassword').onclick=async event=>{
 event.preventDefault();
 const input=$('loginEmail');
 if(!input.value||!input.checkValidity())return message('Informe um e-mail válido na tela de acesso.',true);
 try{await sendPasswordResetEmail(auth,input.value.trim());message('Se o e-mail estiver cadastrado, você receberá instruções para redefinir a senha.')}
 catch{message('Não foi possível solicitar a recuperação. Verifique o e-mail ou tente novamente.',true)}
};
let currentProfile=null,currentUser=null,registering=false,loadingHome=false,clientReservations=[];

for(const btn of document.querySelectorAll('[data-toggle]'))btn.addEventListener('click',()=>{
 const el=$(btn.dataset.toggle);el.type=el.type==='password'?'text':'password';
 const hidden=el.type==='password';
 if(btn.classList.contains('login-eye-button')||btn.classList.contains('register-eye-button')){
  btn.setAttribute('aria-label',hidden?'Mostrar senha':'Ocultar senha');
  btn.setAttribute('title',hidden?'Mostrar senha':'Ocultar senha');
  btn.setAttribute('aria-pressed',String(!hidden));
 }else btn.textContent=hidden?'Mostrar':'Ocultar';
});
let reviewedRegistration=null;
function hideReviewPassword(){ $('reviewPassword').textContent='********';const b=$('reviewPasswordEye');b.setAttribute('aria-pressed','false');b.setAttribute('aria-label','Mostrar senha');b.title='Mostrar senha'; }
$('reviewPasswordEye').onclick=()=>{const b=$('reviewPasswordEye');if(b.getAttribute('aria-pressed')==='true')return hideReviewPassword();$('reviewPassword').textContent=$('regPassword').value;b.setAttribute('aria-pressed','true');b.setAttribute('aria-label','Ocultar senha');b.title='Ocultar senha';};
$('editRegister').onclick=()=>{hideReviewPassword();show('registerView')};
$('registerForm').onsubmit=e=>e.preventDefault();
const registrationSnapshot=()=>['regDate','regName','regPhone','regEmail','regPassword','regConfirm'].map(id=>$(id).value).join('\u0000');
const invalidateRegistrationReview=()=>{reviewedRegistration=null;$('confirmRegister').disabled=true;hideReviewPassword()};
for(const field of $('registerForm').querySelectorAll('input:not([readonly])'))field.addEventListener('input',invalidateRegistrationReview);
$('showRegister').onclick=()=>{$('regDate').value=todayLocal();invalidateRegistrationReview();show('registerView')};
let reviewedBooking=null,submittingBooking=false;
const bookingSnapshot=()=>JSON.stringify(['bookingCreatedDate','pickup','destination','travelDate','travelTime','passengers','notes'].map(id=>$(id).value));
function invalidateBookingReview(){reviewedBooking=null;$('requestBooking').disabled=true;}
$('bookingForm').onsubmit=e=>e.preventDefault();
$('bookingForm').addEventListener('input',invalidateBookingReview);
$('bookingForm').addEventListener('change',invalidateBookingReview);
for(const id of ['decreasePassengers','increasePassengers'])$(id).addEventListener('click',invalidateBookingReview);
$('requestBooking').onclick=()=>submitBooking();
$('editBooking').onclick=()=>show('bookingView');
function openClientPanel(which){
 $('activeBlock').classList.toggle('hidden',which!=='active');
 $('historyBlock').classList.toggle('hidden',which!=='history');
}
$('viewActiveReservations').onclick=()=>openClientPanel('active');
$('viewReservationHistory').onclick=()=>openClientPanel('history');
$('showBooking').onclick=()=>{
 invalidateBookingReview();
 $('bookingCreatedDate').value=todayLocal();
 $('bookingGreeting').textContent='Olá, '+(currentProfile?.nomeCliente||'Cliente')+'!';
 show('bookingView');
};
$('regPhone').addEventListener('input',e=>{e.target.value=formatPhone(e.target.value)});
$('loginForm').onsubmit=async e=>{
 e.preventDefault();try{message('Entrando...');await signInWithEmailAndPassword(auth,val('loginEmail'),$('loginPassword').value)}
 catch(err){message(errorText(err),true)}
};
$('reviewRegister').onclick=()=>{
 if(!$('registerForm').reportValidity())return;
 if($('regPassword').value!==$('regConfirm').value)return message('As senhas não coincidem.',true);
 if(![10,11].includes(phoneDigits(val('regPhone')).length))return message('Informe telefone com DDD.',true);
 $('registerSummary').textContent=`Código: PMC-0000 (automático)\nData de cadastro: ${val('regDate')}\nNome: ${val('regName')}\nTelefone: ${val('regPhone')}\nE-mail: ${val('regEmail')}`;
 $('registerSummary').style.whiteSpace='pre-line';
 reviewedRegistration=registrationSnapshot();
 hideReviewPassword();
 $('confirmRegister').disabled=false;
 show('registerReview');
};
$('confirmRegister').onclick=async()=>{
 if(registering||!reviewedRegistration||reviewedRegistration!==registrationSnapshot())return message('Revise os dados antes de cadastrar.',true);
 if(!$('registerForm').reportValidity()||$('regPassword').value!==$('regConfirm').value||![10,11].includes(phoneDigits(val('regPhone')).length))return message('Confira os dados e revise novamente.',true);
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
  invalidateRegistrationReview();show('registerView');message('Cadastro não concluído. '+errorText(err),true);
 }finally{registering=false;b.disabled=reviewedRegistration===null}
};
async function createProfile(user){
 const ref=doc(db,'clientes',user.uid),counter=doc(db,'contadores','clientes');
 return runTransaction(db,async t=>{
  const profile=await t.get(ref),c=await t.get(counter);
  if(profile.exists())return profile.data();
  const next=(c.exists()?Number(c.data().ultimo||0):0)+1;
  if(next>40)throw Object.assign(new Error('Limite de 40 clientes atingido.'),{code:'limite-clientes'});
  const data={uid:user.uid,numeroCliente:next,codigoCliente:padCode('PMC',next),nomeCliente:val('regName'),telefoneCliente:val('regPhone'),email:user.email,dataCadastro:serverTimestamp()};
  t.set(counter,{ultimo:next,ultimoUid:user.uid});t.set(ref,data);return data;
 });
}
$('logout').onclick=async()=>{await signOut(auth);currentProfile=null;currentUser=null;show('loginView')};
$('reviewBooking').onclick=()=>{
 if(!$('bookingForm').reportValidity())return;
 const when=new Date(`${val('travelDate')}T${val('travelTime')}:00`);
 if(!Number.isFinite(when.getTime())||when.getTime()<=Date.now())return message('Escolha data e horário futuros.',true);
 $('bookingSummary').textContent=`Cliente: ${currentProfile?.nomeCliente||''}\nCódigo do Cliente: ${currentProfile?.codigoCliente||''}\nData da Reserva: ${val('bookingCreatedDate')} (automática)\nCódigo da Reserva: PMR-000000 (automático)\nEmbarque: ${val('pickup')}\nDestino: ${val('destination')}\nData: ${val('travelDate')}\nHorário: ${val('travelTime')}\nPassageiros: ${val('passengers')}\nObservações: ${val('notes')||'Nenhuma'}`;
 $('bookingSummary').style.whiteSpace='pre-line';reviewedBooking=bookingSnapshot();$('requestBooking').disabled=false;show('bookingReview');
};
async function submitBooking(){
 if(submittingBooking||!reviewedBooking||reviewedBooking!==bookingSnapshot())return message('Revise a solicitação antes de enviar.',true);
 if(!$('bookingForm').reportValidity())return;
 const when=new Date(`${val('travelDate')}T${val('travelTime')}:00`);
 if(!Number.isFinite(when.getTime())||when.getTime()<=Date.now())return message('Escolha data e horário futuros.',true);
 if(!currentUser||!currentProfile)return message('Entre na sua conta novamente.',true);
 submittingBooking=true;$('requestBooking').disabled=true;
 try{
  message('Enviando solicitação...');
  const counter=doc(db,'contadores','reservas'),newRef=doc(collection(db,'reservas'));
  let assignedCode='';
  await runTransaction(db,async t=>{
   const c=await t.get(counter),next=(c.exists()?Number(c.data().ultimo||0):0)+1;
   if(next>999999)throw new Error('Limite de numeração atingido.');
   assignedCode=padCode('PMR',next);
   const data={numeroReserva:next,codigoReserva:assignedCode,clienteUid:currentUser.uid,codigoCliente:currentProfile.codigoCliente,nomeCliente:currentProfile.nomeCliente,telefoneCliente:currentProfile.telefoneCliente,
    codigoMotorista:'',motoristaUid:'',localEmbarque:val('pickup'),localDestino:val('destination'),dataViagem:Timestamp.fromDate(new Date(`${val('travelDate')}T${val('travelTime')}:00`)),dataSolicitacao:serverTimestamp(),passageiros:Number(val('passengers')),observacoes:val('notes'),statusReserva:'pendente',valorViagem:0};
   t.set(counter,{ultimo:next,ultimoReservaId:newRef.id,ultimoClienteUid:currentUser.uid});t.set(newRef,data);
  });
  invalidateBookingReview();$('bookingForm').reset();setBookingCount(1);$('travelDate').min=todayLocal();$('bookingCreatedDate').value=todayLocal();await loadHome();openClientPanel('active');message('Solicitação '+assignedCode+' enviada! Aguarde a administração.');
 }catch(err){message('Não foi possível solicitar: '+errorText(err),true)}finally{submittingBooking=false;const valid=reviewedBooking!==null&&reviewedBooking===bookingSnapshot();$('requestBooking').disabled=!valid}
}
const completed=new Set(['concluida','recusada','cancelada','cancelado','encerrada','finalizada']);

$('activeReservations').addEventListener('click',async event=>{
 const button=event.target.closest('button[data-budget-response]');
 if(!button||!currentUser)return;
 const r=clientReservations.find(x=>x.id===button.dataset.id);
 if(!r||r.statusReserva!=='orcamento_pendente'||!Number.isInteger(r.numeroOrcamento)||r.numeroOrcamento<1)return message('Orçamento indisponível para resposta.',true);
 const response=button.dataset.budgetResponse;
 if(!['aceito','recusado'].includes(response))return;
 if(!confirm((response==='aceito'?'Aceitar':'Recusar')+' orçamento de '+moneyBRL(r.valorViagem)+' da reserva '+r.codigoReserva+'?'))return;
 const batch=writeBatch(db),status='orcamento_'+response;
 batch.update(doc(db,'reservas',r.id),{statusReserva:status,dataAtualizacao:serverTimestamp()});
 batch.set(doc(db,'historicoOrcamentos',r.id+'-'+r.numeroOrcamento),{
  reservaId:r.id,codigoReserva:r.codigoReserva,codigoCliente:r.codigoCliente,
  nomeCliente:r.nomeCliente,clienteUid:currentUser.uid,
  numeroOrcamento:r.numeroOrcamento,resposta:response,valorTotal:r.valorViagem,dataResposta:serverTimestamp()
 });
 button.disabled=true;
 try{
  await batch.commit();
  await loadHome();
  message(response==='aceito'?'Orçamento aceito. Aguarde a designação do Motorista.':'Orçamento recusado. A administração poderá preparar uma nova proposta.');
 }catch(err){message('Não foi possível registrar sua resposta: '+errorText(err),true)}
 finally{button.disabled=false}
});

function reservationHtml(r){
 const dt=r.dataViagem?.toDate?.();
 const money=Number.isInteger(r.numeroOrcamento)&&r.numeroOrcamento>0&&Number.isFinite(r.valorViagem)?moneyBRL(r.valorViagem):'A definir';
 const response=r.statusReserva==='orcamento_pendente'?'<div class="actions"><button data-budget-response="aceito" data-id="'+esc(r.id)+'">Aceitar Orçamento</button><button class="secondary" data-budget-response="recusado" data-id="'+esc(r.id)+'">Recusar Orçamento</button></div>':'';
 return '<div class="item"><strong>'+esc(r.codigoReserva)+'</strong> — '+esc(r.statusReserva)+'<p class="small">'+esc(r.localEmbarque)+' → '+esc(r.localDestino)+'<br>'+(dt?dt.toLocaleString('pt-BR'):'Data não informada')+'<br>Passageiros: '+esc(r.passageiros||1)+'<br><b>Valor da Reserva:</b> '+money+'<br><b>Motorista Designado:</b> '+esc(r.nomeMotoristaDesignado||'A definir')+'</p>'+response+'</div>';
}
async function loadHome(){
 if(!currentUser||loadingHome)return;loadingHome=true;
 try{
  const snap=await getDoc(doc(db,'clientes',currentUser.uid));
  if(!snap.exists()){currentProfile=null;show('loginView');message('Sua conta não possui perfil de cliente. Contate a administração.',true);return}
  currentProfile=snap.data();$('profileInfo').textContent=`${currentProfile.nomeCliente||''} • ${currentProfile.codigoCliente||''}`;
  $('clientWelcome').textContent='Olá, '+(currentProfile.nomeCliente||'Cliente')+'!';
  $('bookingGreeting').textContent='Olá, '+(currentProfile.nomeCliente||'Cliente')+'!';
  $('clientCode').value=currentProfile.codigoCliente||'Aguardando cadastro';
  show('homeView');$('activeReservations').textContent='Carregando...';$('reservationHistory').textContent='Carregando...';
  const rs=await getDocs(query(collection(db,'reservas'),where('clienteUid','==',currentUser.uid)));
  const data=rs.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.dataSolicitacao?.seconds||0)-(a.dataSolicitacao?.seconds||0));
  clientReservations=data;
  $('lastBookingCode').value=data[0]?.codigoReserva||'Nenhuma reserva';
  $('copyBookingCode').disabled=!data[0]?.codigoReserva;
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
