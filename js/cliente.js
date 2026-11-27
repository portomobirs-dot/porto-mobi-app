import {offerWhatsApp} from './common.js?v=wa25';
import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,onAuthStateChanged,createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut,deleteUser,sendPasswordResetEmail} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {addDoc,getFirestore,doc,getDoc,runTransaction,writeBatch,collection,query,where,getDocs,onSnapshot,serverTimestamp,Timestamp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {firebaseConfig,padCode,todayLocal,esc,formatPhone,phoneDigits,errorText,moneyBRL} from './common.js';

// Nome diferente por aplicativo = sessao Firebase Auth independente no navegador.
const app=initializeApp(firebaseConfig,'porto-mobi-clientes');
const auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
const views=['loginView','registerView','registerReview','homeView','bookingView','bookingReview','bookingTracking','budgetView','historyView','serviceTrackingView','clientSupportView','clientCompletedView'];
const message=(s,bad=false)=>{const el=$('message');el.textContent=s;el.className='status '+(bad?'error':'success')};
let stopServiceTracking=null;
const show=id=>{if(id!=='serviceTrackingView'&&stopServiceTracking){stopServiceTracking();stopServiceTracking=null;}views.forEach(v=>$(v).classList.toggle('hidden',v!==id));message('')};
const val=id=>$(id).value.trim();
$('travelDate').min=todayLocal();
$('regDate').value=todayLocal();
$('bookingCreatedDate').value=todayLocal();
const setBookingCount=n=>{$('passengers').value=String(Math.min(4,Math.max(1,Number(n)||1)))};
$('decreasePassengers').onclick=()=>setBookingCount(Number($('passengers').value)-1);
$('increasePassengers').onclick=()=>setBookingCount(Number($('passengers').value)+1);
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
const invalidateRegistrationReview=()=>{reviewedRegistration=null;$('confirmRegister').setAttribute('aria-disabled','true');hideReviewPassword()};
for(const field of $('registerForm').querySelectorAll('input:not([readonly])'))field.addEventListener('input',invalidateRegistrationReview);
$('showRegister').onclick=()=>{
 for(const id of ['regName','regPhone','regEmail','regPassword','regConfirm'])$(id).readOnly=false;
 $('registerForm').reset();$('clientCodePreview').value='PMC-0000';$('regDate').value=todayLocal();
 $('reviewRegister').disabled=false;
 $('registerViewLogout').textContent='PAINEL DO CLIENTE';
 invalidateRegistrationReview();show('registerView');
};
let reviewedBooking=null,submittingBooking=false;
const bookingSnapshot=()=>JSON.stringify(['bookingCreatedDate','pickup','destination','travelDate','travelTime','passengers','notes'].map(id=>$(id).value));
function invalidateBookingReview(){reviewedBooking=null;$('confirmBooking').setAttribute('aria-disabled','true');}
$('bookingForm').onsubmit=e=>e.preventDefault();
$('bookingForm').addEventListener('input',invalidateBookingReview);
$('bookingForm').addEventListener('change',invalidateBookingReview);
for(const id of ['decreasePassengers','increasePassengers'])$(id).addEventListener('click',invalidateBookingReview);
$('confirmBooking').onclick=()=>submitBooking();
$('editBooking').onclick=()=>{if(!submittingBooking){invalidateBookingReview();show('bookingView')}};
$('bookingReviewHome').onclick=()=>{if(!submittingBooking){invalidateBookingReview();show('homeView')}};
$('backToBooking').onclick=()=>show('homeView');
const serviceDate=d=>d.toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'});
function eligibleService(){
 if(!currentUser)return null;
 return clientReservations.filter(r=>r.clienteUid===currentUser.uid&&['confirmada','em_andamento'].includes(r.statusReserva)&&r.dataViagem?.toDate?.()&&serviceDate(r.dataViagem.toDate())===serviceDate(new Date())).sort((a,b)=>a.dataViagem.toDate()-b.dataViagem.toDate())[0]||null;
}
function serviceStatus(r){return r.statusReserva==='concluida'?'Atendimento concluído.':r.statusReserva==='em_andamento'?'Atendimento em andamento.':r.statusReserva==='confirmada'&&r.dataChegadaMotorista?'Seu Motorista, '+(r.nomeMotoristaDesignado||'Motorista')+', está à sua disposição.':'Aguardando início do atendimento.';}
$('viewServiceTracking').onclick=async()=>{
 await loadHome();
 const r=eligibleService();if(!r)return;
 const d=r.dataViagem.toDate();
 const fields={Welcome:'Olá, '+(currentProfile?.nomeCliente||'Cliente')+'!',Client:currentProfile?.codigoCliente,Code:r.codigoReserva,Date:serviceDate(d),Time:d.toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}),Pickup:r.localEmbarque,Destination:r.localDestino,Driver:r.nomeMotoristaDesignado,Vehicle:r.veiculoModelo,Plate:r.veiculoPlaca,Color:r.veiculoCor,Status:serviceStatus(r)};
 for(const [key,value] of Object.entries(fields))$('serviceTracking'+key).textContent=value||'Não informado';
 show('serviceTrackingView');
 if(stopServiceTracking)stopServiceTracking();
 stopServiceTracking=onSnapshot(doc(db,'reservas',r.id),snap=>{if(snap.exists()&&snap.data().clienteUid===currentUser?.uid){const latest=snap.data();if(latest.statusReserva==='concluida'){$('clientCompletedCode').textContent='Reserva: '+(latest.codigoReserva||'');show('clientCompletedView');}else $('serviceTrackingStatus').textContent=serviceStatus(latest);}},()=>message('Não foi possível atualizar o acompanhamento.',true));
 if(!history.state?.serviceTracking)history.pushState({serviceTracking:true},'');
};
$('viewClientSupport').onclick=()=>show('clientSupportView');
$('clientSupportBack').onclick=()=>show('homeView');
$('clientCompletedBack').onclick=()=>show('homeView');
$('serviceTrackingLogout').onclick=()=> $('logout').click();
function openClientPanel(which){
 $('activeBlock').classList.toggle('hidden',which!=='active');

}
$('viewActiveReservations').onclick=async()=>{await loadHome();const r=clientReservations[0];if(r)showTracking(r);else openClientPanel('active')};
$('viewReservationHistory').onclick=()=>{
 $('historyWelcome').textContent='Olá, '+(currentProfile?.nomeCliente||'Cliente')+'!';
 $('historyClientCode').value=currentProfile?.codigoCliente||'';
 $('historyBookingCode').value=$('lastBookingCode').value;
 $('historyLatestReservation').innerHTML=historyLatestHtml(clientReservations[0]);
 show('historyView');
 if(!history.state?.clientHistory)history.pushState({clientHistory:true},'');
};
$('historyBackToRegister').onclick=()=>show('homeView');
$('viewMyProfile').onclick=()=>{
 if(!currentUser||!currentProfile)return;
 invalidateRegistrationReview();
 $('clientCodePreview').value=currentProfile.codigoCliente||'';
 const date=currentProfile.dataCadastro?.toDate?.();
 $('regDate').value=date?date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0'):'';
 $('regName').value=currentProfile.nomeCliente||'';
 $('regPhone').value=currentProfile.telefoneCliente||'';
 $('regEmail').value=currentProfile.email||currentUser.email||'';
 $('regPassword').value='';$('regConfirm').value='';
 for(const id of ['regName','regPhone','regEmail','regPassword','regConfirm'])$(id).readOnly=true;
 $('reviewRegister').disabled=true;
 $('registerViewLogout').textContent='PAINEL DO CLIENTE';
 show('registerView');
};
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
const checkRegisterPasswords=()=>{
 const senha=$('regPassword').value,confirmacao=$('regConfirm').value;
 if(confirmacao && senha!==confirmacao){
  $('regConfirm').setCustomValidity('As senhas não coincidem. Confira e tente novamente.');
  message('As senhas não coincidem. Confira e tente novamente.',true);
  return false;
 }
 $('regConfirm').setCustomValidity('');
 return true;
};
$('regConfirm').addEventListener('blur',checkRegisterPasswords);
for(const id of ['regPassword','regConfirm'])$(id).addEventListener('input',()=>{$('regConfirm').setCustomValidity('')});
$('reviewRegister').onclick=()=>{
 if(!checkRegisterPasswords())return;
 if(!$('registerForm').reportValidity())return;
 if(![10,11].includes(phoneDigits(val('regPhone')).length))return message('Informe telefone com DDD.',true);
 $('registerSummary').textContent=`Código do Cliente: PMC-0000\nData de cadastro: ${val('regDate')}\nNome: ${val('regName')}\nTelefone: ${val('regPhone')}\nE-mail: ${val('regEmail')}`;
 $('registerSummary').style.whiteSpace='pre-line';
 reviewedRegistration=registrationSnapshot();
 hideReviewPassword();
 $('confirmRegister').setAttribute('aria-disabled','false');
 show('registerReview');
};
$('confirmRegister').onclick=async()=>{
 if(registering)return;
  if(!reviewedRegistration||reviewedRegistration!==registrationSnapshot())return message('Revise seu cadastro antes de continuar.',true);
 if(!$('registerForm').reportValidity()||$('regPassword').value!==$('regConfirm').value||![10,11].includes(phoneDigits(val('regPhone')).length))return message('Confira os dados e revise novamente.',true);
 const b=$('confirmRegister');b.disabled=true;registering=true;let cred=null;
 try{
  message('Criando sua conta...');
  cred=await createUserWithEmailAndPassword(auth,val('regEmail'),$('regPassword').value);
  currentUser=cred.user;
  await createProfile(cred.user);
  await loadHome();message('Cadastro realizado!');offerWhatsApp('5551990082119','Porto Mobi: novo cadastro de cliente '+(currentProfile?.codigoCliente||'')+'.');
 }catch(err){
  // Evita deixar uma conta Authentication sem perfil quando a transacao falha.
  if(cred){try{await deleteUser(cred.user);currentUser=null}catch(_){/* pode requerer suporte da administracao */}}
  invalidateRegistrationReview();show('registerView');message(err?.code==='permission-denied'?'Cadastro bloqueado pelas regras do Firestore da homologação. Seus dados não foram gravados. Aguarde a atualização segura das regras antes de tentar novamente.':'Cadastro não concluído. '+errorText(err),true);
 }finally{registering=false;b.disabled=false;b.setAttribute('aria-disabled',reviewedRegistration===null?'true':'false')}
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
/* Ações da tela de cadastro: dados pessoais só após autenticação. */
$('registerViewLogout').onclick=async()=>{if(currentUser)show('homeView');else show('loginView');};

$('reviewBooking').onclick=()=>{
 if(!$('bookingForm').reportValidity())return;
 const when=new Date(`${val('travelDate')}T${val('travelTime')}:00`);
 if(!Number.isFinite(when.getTime())||when.getTime()<=Date.now())return message('Escolha data e horário futuros.',true);
 $('bookingSummary').textContent=`Cliente: ${currentProfile?.nomeCliente||''}\nCódigo do Cliente: ${currentProfile?.codigoCliente||''}\nData da Reserva: ${val('bookingCreatedDate')}\nCódigo da Reserva: PMR-000000\nEmbarque: ${val('pickup')}\nDestino: ${val('destination')}\nData: ${val('travelDate')}\nHorário: ${val('travelTime')}\nPassageiros: ${val('passengers')}\nObservações: ${val('notes')||'Nenhuma'}`;
 $('bookingSummary').style.whiteSpace='pre-line';reviewedBooking=bookingSnapshot();$('confirmBooking').setAttribute('aria-disabled','false');show('bookingReview');
};
async function submitBooking(){
 if(submittingBooking||$('bookingReview').classList.contains('hidden'))return;
 if(!reviewedBooking||reviewedBooking!==bookingSnapshot())return message('Revise sua solicitação antes de solicitar.',true);
 if(!$('bookingForm').reportValidity())return;
 const when=new Date(`${val('travelDate')}T${val('travelTime')}:00`);
 if(!Number.isFinite(when.getTime())||when.getTime()<=Date.now())return message('Escolha data e horário futuros.',true);
 if(!currentUser||!currentProfile)return message('Entre na sua conta novamente.',true);
 submittingBooking=true;$('confirmBooking').disabled=true;
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
  invalidateBookingReview();$('bookingForm').reset();setBookingCount(1);$('travelDate').min=todayLocal();$('bookingCreatedDate').value=todayLocal();await loadHome();showTracking(clientReservations.find(r=>r.codigoReserva===assignedCode));message('Solicitação '+assignedCode+' enviada! Aguarde a administração.');offerWhatsApp('5551990082119','Porto Mobi: nova solicitação '+assignedCode+'.');
 }catch(err){message('Não foi possível solicitar: '+errorText(err),true)}finally{submittingBooking=false;const valid=reviewedBooking!==null&&reviewedBooking===bookingSnapshot();$('confirmBooking').disabled=false;$('confirmBooking').setAttribute('aria-disabled',String(!valid))}
}
const completed=new Set(['concluida','recusada','cancelada','cancelado','encerrada','finalizada']);

async function respondBudget(event){
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
  show('homeView');
  message(response==='aceito'?'Orçamento aceito. Aguarde a designação do Motorista.':'Orçamento recusado. A administração poderá preparar uma nova proposta.');offerWhatsApp('5551990082119','Porto Mobi: orçamento da reserva '+r.codigoReserva+' '+response+'.');
 }catch(err){message('Não foi possível registrar sua resposta: '+errorText(err),true)}
 finally{button.disabled=false}
}
$('activeReservations').addEventListener('click',respondBudget);
$('budgetDetails').addEventListener('click',respondBudget);
$('budgetDetails').addEventListener('click',event=>{if(event.target.closest('#budgetBackToPanel')&&currentUser&&currentProfile)show('homeView')});

function historyLatestHtml(r){
 if(!r)return '<p>Nenhuma reserva cadastrada.</p>';
 const status=String(r.statusReserva||'pendente');
 const labels={pendente:'Aguardando confirmação',orcamento_pendente:'Orçamento aguardando resposta',orcamento_aceito:'Orçamento aceito',orcamento_recusado:'Orçamento recusado',oferecida:'Aguardando motorista',confirmada:'Confirmada',em_andamento:'Em andamento',concluida:'Concluída',recusada:'Recusada',cancelada:'Cancelada'};
 const rows=[
 ['Cliente',currentProfile?.nomeCliente||'Não informado'],
 ['Código do cliente',currentProfile?.codigoCliente||'Não informado'],
 ['Código da reserva',r.codigoReserva||'Não informado'],
 ['Data da solicitação',r.dataSolicitacao?.toDate?.().toLocaleDateString('pt-BR')||'Não informada'],
 ['Local de embarque',r.localEmbarque||'Não informado'],
 ['Destino',r.localDestino||'Não informado'],
 ['Data e horário da viagem',r.dataViagem?.toDate?.().toLocaleString('pt-BR')||'Não informado'],
 ['Passageiros',String(r.passageiros||1)],
 ['Observações',r.observacoes||'Nenhuma'],
 ['Valor',r.numeroOrcamento?moneyBRL(r.valorViagem):'A definir'],
 ['Status da reserva',labels[status]||status],
 ['Motorista',r.nomeMotoristaDesignado||'A definir']
 ];
 return rows.map(([label,value])=>'<div class="history-data-line"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>').join('');
}
function reservationHtml(r, budgetOnly=false){
 const dt=r.dataViagem?.toDate?.();
 const money=Number.isInteger(r.numeroOrcamento)&&r.numeroOrcamento>0&&Number.isFinite(r.valorViagem)?moneyBRL(r.valorViagem):'A definir';
 const response=r.statusReserva==='orcamento_pendente'?'<div class="actions"><button data-budget-response="aceito" data-id="'+esc(r.id)+'">ACEITAR</button><button class="secondary" data-budget-response="recusado" data-id="'+esc(r.id)+'">RECUSAR</button></div>':'';
 return '<div class="item"><strong>'+esc(r.codigoReserva)+'</strong> — '+esc(r.statusReserva)+'<p class="small">'+esc(r.localEmbarque)+' → '+esc(r.localDestino)+'<br>'+(dt?dt.toLocaleString('pt-BR'):'Data não informada')+'<br>Passageiros: '+esc(r.passageiros||1)+(budgetOnly?'':'<br><b>Valor da Reserva:</b> '+money)+'<br><b>Motorista Designado:</b> '+esc(r.nomeMotoristaDesignado||'A definir')+'</p>'+(budgetOnly?'<label for="budgetValue" class="budget-value-title">Valor da Reserva</label><input id="budgetValue" readonly value="'+esc(money)+'">':'')+response+'</div>';
}
function showBudget(r){
 $('budgetWelcome').textContent='Olá, '+(currentProfile?.nomeCliente||'Cliente')+'!';
 $('budgetClientCode').value=currentProfile?.codigoCliente||'';
 $('budgetCode').value=r.codigoReserva||'';
 $('budgetDetails').innerHTML=reservationHtml(r,true);
 const actions=$('budgetDetails').querySelector('.actions');
 if(actions){const b=document.createElement('button');b.type='button';b.id='budgetBackToPanel';b.textContent='PAINEL DO CLIENTE';actions.append(b)}
 show('budgetView');
 if(!history.state?.bookingTracking)history.pushState({bookingTracking:true},'');
}
function showTracking(r){
 if(r?.statusReserva==='orcamento_pendente')return showBudget(r);
 if(!r)return;
 const travelDate=r.dataViagem?.toDate?.();
 const summary={trackingClient:currentProfile?.nomeCliente||'Não informado',trackingClientCode:currentProfile?.codigoCliente||'Não informado',trackingCode:r.codigoReserva||'Não informado',trackingRequestDate:r.dataSolicitacao?.toDate?.().toLocaleDateString('pt-BR')||'Aguardando registro',trackingPickup:r.localEmbarque||'Não informado',trackingDestination:r.localDestino||'Não informado',trackingTravelDate:travelDate?.toLocaleString('pt-BR')||'Não informado',trackingPassengers:String(r.passageiros||1),trackingNotes:r.observacoes||'Nenhuma',trackingPrice:r.numeroOrcamento?moneyBRL(r.valorViagem):'A definir'};
 for(const [id,value] of Object.entries(summary))$(id).textContent=value;
 const status=r.statusReserva;
 const confirmed=['confirmada','em_andamento','concluida'].includes(status);
 $('trackingDriverDetails').classList.toggle('hidden',!confirmed);
 for(const [id,value] of Object.entries({trackingDriverName:r.nomeMotoristaDesignado,trackingVehicle:r.veiculoModelo,trackingPlate:r.veiculoPlaca,trackingColor:r.veiculoCor}))$(id).value=confirmed?(value||'Não informado'):'';
 $('trackingStatus').textContent=status==='recusada'?'Recusada':['confirmada','em_andamento','concluida'].includes(status)?'Confirmada':['cancelada','cancelado'].includes(status)?'Cancelada':'Aguardando confirmação';

 show('bookingTracking');
 if(!history.state?.bookingTracking)history.pushState({bookingTracking:true},'');
}
window.addEventListener('popstate',()=>{if(currentUser&&currentProfile)show('homeView')});
async function loadHome(){
 if(!currentUser||loadingHome)return;loadingHome=true;clientReservations=[];$('viewServiceTracking').disabled=true;
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
  clientReservations=data;$('viewServiceTracking').disabled=!eligibleService();
  $('lastBookingCode').value=data[0]?.codigoReserva||'Nenhuma reserva';
  const active=data.filter(r=>!completed.has(String(r.statusReserva).toLowerCase()));const history=data.filter(r=>completed.has(String(r.statusReserva).toLowerCase()));
  $('activeReservations').innerHTML=active.length?active.map(reservationHtml).join(''):'<p>Nenhuma reserva em andamento.</p>';
  $('historyLatestReservation').innerHTML=historyLatestHtml(data[0]);
  $('reservationHistory').innerHTML=history.length?history.map(r=>reservationHtml(r)).join(''):'<p>Nenhuma reserva no histórico.</p>';
  const pendingBudget=active.find(r=>r.statusReserva==='orcamento_pendente');if(pendingBudget)showBudget(pendingBudget);
 }catch(err){message('Não foi possível carregar suas reservas. '+errorText(err),true)}finally{loadingHome=false}
}
onAuthStateChanged(auth,async user=>{
 if(registering)return;currentUser=user;
 if(!user){currentProfile=null;clientReservations=[];$('viewServiceTracking').disabled=true;show('loginView');return}
 await loadHome();
});

 // Suporte isolado do fluxo de reservas.
 {
 const screen=$('clientSupportView'), panel=document.createElement('div');
 const input=document.createElement('textarea');input.maxLength=2000;input.placeholder='Digite sua mensagem';input.setAttribute('aria-label','Mensagem de suporte');
 const send=document.createElement('button');send.type='button';send.textContent='ENVIAR MENSAGEM';
 const history=document.createElement('button');history.type='button';history.textContent='HISTÓRICO DE MENSAGENS';
 const status=document.createElement('p');status.setAttribute('role','status');
 const list=document.createElement('div');panel.append(input,send,history,status,list);screen.append(panel);
 async function loadSupport(){
 const uid=auth.currentUser?.uid;list.replaceChildren();if(!uid)return;
 try{const snap=await getDocs(query(collection(db,'suporte'),where('uid','==',uid)));
 if(auth.currentUser?.uid!==uid||screen.classList.contains('hidden'))return;
 const items=snap.docs.map(d=>d.data()).filter(d=>d.tipo==='cliente').sort((a,b)=>(b.criadoEm?.seconds||0)-(a.criadoEm?.seconds||0));
 for(const item of items){const p=document.createElement('p');p.textContent=item.mensagem+' — '+(item.resposta||'Aguardando resposta');list.append(p);}
 if(!items.length)list.textContent='Nenhuma mensagem.';
 }catch(e){status.textContent='Não foi possível consultar o suporte. '+errorText(e);}
 }
 history.onclick=loadSupport;
 send.onclick=async()=>{const uid=auth.currentUser?.uid,mensagem=input.value.trim();if(!uid||!mensagem)return;send.disabled=true;
 try{await addDoc(collection(db,'suporte'),{uid,tipo:'cliente',mensagem,criadoEm:serverTimestamp()});if(auth.currentUser?.uid!==uid)return;input.value='';status.textContent='Mensagem registrada.';await loadSupport();}
 catch(e){status.textContent='Não foi possível enviar. '+errorText(e);}finally{send.disabled=false;}};
 onAuthStateChanged(auth,()=>{input.value='';list.replaceChildren();status.textContent='';});
 $('viewClientSupport').onclick=()=>{show('clientSupportView');loadSupport();};
 }
