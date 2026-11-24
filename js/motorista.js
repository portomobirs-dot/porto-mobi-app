import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,onAuthStateChanged,createUserWithEmailAndPassword,deleteUser,signInWithEmailAndPassword,signOut,sendPasswordResetEmail} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,doc,getDoc,setDoc,collection,query,where,onSnapshot,updateDoc,writeBatch,serverTimestamp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {firebaseConfig,esc,formatPhone,phoneDigits,stamp,todayLocal,errorText} from './common.js';
const app=initializeApp(firebaseConfig,'porto-mobi-motoristas'),auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
const views=['loginView','registerView','reviewView','pendingView','homeView','reservationView','serviceView'];
const message=(s,bad=false)=>{$('message').textContent=s;$('message').className=bad?'error':'success'};
const show=id=>{views.forEach(v=>$(v).classList.toggle('hidden',v!==id));message('')};
const val=id=>$(id).value.trim();
let user=null,profile=null,registering=false,unsub=null,driverTrips=[],serviceId=null;
$('regDate').value=todayLocal();
$('forgotPassword').onclick=async event=>{event.preventDefault();const email=$('loginEmail');if(!email.value||!email.checkValidity())return message('Informe um e-mail válido na tela de acesso.',true);try{await sendPasswordResetEmail(auth,email.value.trim());message('Se o e-mail estiver cadastrado, você receberá instruções para redefinir a senha.')}catch{message('Não foi possível solicitar a recuperação da senha.',true)}};
$('copyDriverCode').onclick=async()=>{const codigo=$('driverCode').value;if(!/^PMM-\d{3}$/.test(codigo)||codigo==='PMM-000')return message('O código será disponibilizado após a aprovação.',true);try{await navigator.clipboard.writeText(codigo);message('Código '+codigo+' copiado.')}catch{$('driverCode').focus();$('driverCode').select();message('Copie o código selecionado: '+codigo)}};
function stop(){if(unsub){unsub();unsub=null}}
for(const btn of document.querySelectorAll('[data-toggle]'))btn.addEventListener('click',()=>{
 const el=$(btn.dataset.toggle);el.type=el.type==='password'?'text':'password';
 const hidden=el.type==='password';
 if(btn.matches('.login-eye-button,.register-eye-button')){
  btn.setAttribute('aria-label',hidden?'Mostrar senha':'Ocultar senha');
  btn.setAttribute('title',hidden?'Mostrar senha':'Ocultar senha');
  btn.setAttribute('aria-pressed',String(!hidden));
 }else btn.textContent=hidden?'Mostrar':'Ocultar';
});
$('regPhone').oninput=e=>{e.target.value=formatPhone(e.target.value)};
$('regPlate').oninput=e=>{let s=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);e.target.value=s.length>3?s.slice(0,3)+'-'+s.slice(3):s};
$('showRegister').onclick=()=>{invalidateDriverReview();$('regDate').value=todayLocal();show('registerView')};$('editRegister').onclick=()=>show('registerView');
$('loginForm').onsubmit=async e=>{e.preventDefault();try{message('Entrando...');await signInWithEmailAndPassword(auth,val('loginEmail'),$('loginPassword').value)}catch(err){message(errorText(err),true)}};
let reviewedDriver=null;
const driverSnapshot=()=>JSON.stringify([...$('registerForm').querySelectorAll('input')].map(el=>el.value));
function invalidateDriverReview(){reviewedDriver=null;$('confirmRegister').disabled=true}
$('registerForm').addEventListener('input',invalidateDriverReview);
$('registerForm').addEventListener('change',invalidateDriverReview);
$('registerForm').addEventListener('submit',e=>e.preventDefault());
$('reviewRegister').onclick=()=>{
 if(!$('registerForm').reportValidity())return;
 if($('regPassword').value!==$('regConfirm').value)return message('As senhas não coincidem.',true);
 if(![10,11].includes(phoneDigits(val('regPhone')).length))return message('Telefone inválido.',true);
 if(!/^[A-Z]{3}-[0-9][A-Z0-9][0-9]{2}$/.test(val('regPlate')))return message('Placa inválida. Formato ABC-1D23 ou ABC-1234.',true);
 $('registerSummary').textContent=`Código: PMM-000 (atribuído após aprovação)\nData de cadastro: ${val('regDate')}\nNome: ${val('regName')}\nTelefone: ${val('regPhone')}\nE-mail: ${val('regEmail')}\nVeículo: ${val('regVehicle')}\nPlaca: ${val('regPlate')}\nCor: ${val('regColor')}`;
 reviewedDriver=driverSnapshot();$('confirmRegister').disabled=false;
 show('reviewView');
};
$('confirmRegister').onclick=async()=>{
 if(registering||!reviewedDriver||reviewedDriver!==driverSnapshot()||!$('registerForm').reportValidity())return message('Revise os dados antes de cadastrar.',true);
 const b=$('confirmRegister');b.disabled=true;registering=true;let cred=null;
 try{
  cred=await createUserWithEmailAndPassword(auth,val('regEmail'),$('regPassword').value);user=cred.user;
  await setDoc(doc(db,'motoristas',user.uid),{uid:user.uid,nomeMotorista:val('regName'),telefoneMotorista:val('regPhone'),email:user.email,veiculoModelo:val('regVehicle'),veiculoPlaca:val('regPlate'),veiculoCor:val('regColor'),situacao:'pendente',numeroMotorista:0,codigoMotorista:'',dataCadastro:serverTimestamp()});
  await loadProfile();message('Cadastro enviado. Aguarde autorização do administrador.');
 }catch(err){if(cred){try{await deleteUser(cred.user);user=null}catch(_){}}show('registerView');message(errorText(err),true)}finally{registering=false;b.disabled=reviewedDriver!==driverSnapshot()}
};
const logout=async()=>{stop();driverTrips=[];serviceId=null;await signOut(auth);show('loginView')};
$('logout').onclick=logout;$('logoutPending').onclick=logout;$('reservationLogout').onclick=logout;$('serviceLogout').onclick=logout;$('checkApproval').onclick=loadProfile;
async function loadProfile(){
 if(!user)return;stop();
 try{
  const snap=await getDoc(doc(db,'motoristas',user.uid));
  if(!snap.exists()){show('loginView');return message('Cadastro de motorista inexistente. Contate a administração.',true)}
  profile=snap.data();
  if(profile.situacao!=='ativo'&&profile.aprovado!==true){show('pendingView');$('pendingInfo').textContent=profile.nomeMotorista+' • Cadastro em '+stamp(profile.dataCadastro)+' • Status: '+profile.situacao;$('pendingDriverCode').value='PMM-000 (pendente)';return}
  show('homeView');$('profileInfo').textContent=`${profile.nomeMotorista} • ${profile.codigoMotorista} • ${profile.veiculoModelo||profile.modeloVeiculo||''}`;$('driverCode').value=profile.codigoMotorista||'Aguardando aprovação';
  const q=query(collection(db,'reservas'),where('motoristaUid','==',user.uid));
  unsub=onSnapshot(q,snap=>renderTrips(snap.docs.map(d=>({id:d.id,...d.data()}))),err=>message('Erro ao consultar reservas: '+errorText(err),true));
 }catch(err){message(errorText(err),true)}
}
const done=new Set(['concluida','recusada','cancelada']);
function renderTrips(rows){
 rows.sort((a,b)=>(b.dataSolicitacao?.seconds||0)-(a.dataSolicitacao?.seconds||0));
 driverTrips=rows;
 const active=rows.filter(r=>!done.has(r.statusReserva)),hist=rows.filter(r=>done.has(r.statusReserva));
 const html=(r,history=false)=>{
  const action=history?'':r.statusReserva==='oferecida'?`<div class="actions"><button data-action="accept" data-id="${esc(r.id)}">Aceitar</button><button class="danger" data-action="reject" data-id="${esc(r.id)}">Recusar</button></div>`:
   r.statusReserva==='confirmada'?`<div class="actions"><button data-action="open" data-id="${esc(r.id)}">Visualizar Atendimento da Reserva</button></div>`:
   r.statusReserva==='em_andamento'?`<div class="actions"><button data-action="open" data-id="${esc(r.id)}">Visualizar Atendimento em Andamento</button></div>`:'';
  return `<article class="item"><strong>${esc(r.codigoReserva)} — ${esc(r.statusReserva)}</strong><p>Cliente: ${esc(r.nomeCliente)}<br>Telefone: ${esc(r.telefoneCliente)}<br>Embarque: ${esc(r.localEmbarque)}<br>Destino: ${esc(r.localDestino)}<br>Viagem: ${esc(stamp(r.dataViagem))}<br>Passageiros: ${esc(r.passageiros||1)}</p>${action}</article>`;
 };
 $('activeReservations').innerHTML=active.length?active.map(r=>html(r)).join(''):'<p>Nenhuma corrida atribuída.</p>';
 $('historyReservations').innerHTML=hist.length?hist.map(r=>html(r,true)).join(''):'<p>Histórico vazio.</p>';
 if(serviceId && !$('reservationView').classList.contains('hidden'))renderReservation();
 if(serviceId && !$('serviceView').classList.contains('hidden'))renderService();
}
function maps(place){return 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination='+encodeURIComponent(place||'')}
$('activeReservations').addEventListener('click',async e=>{
 const b=e.target.closest('button[data-action]');if(!b||!user)return;
 if(b.dataset.action==='open'){openReservationById(b.dataset.id);return}
 const status={accept:'confirmada',reject:'pendente'}[b.dataset.action];if(!status)return;
 if(!confirm('Confirmar ação: '+b.textContent+'?'))return;
 const changes={statusReserva:status,dataAtualizacao:serverTimestamp()};
 b.disabled=true;
 try{
  if(b.dataset.action==='reject'){
   const r=driverTrips.find(x=>x.id===b.dataset.id);
   if(!r||r.statusReserva!=='oferecida')throw Error('Oferta não está mais disponível.');
   const number=Number(r.numeroRecusa||0)+1;
   const nextStatus=r.numeroOrcamento&&r.valorViagem>=0?'orcamento_aceito':'pendente';
   const batch=writeBatch(db);
   batch.update(doc(db,'reservas',r.id),{
    statusReserva:nextStatus,motoristaUid:'',codigoMotorista:'',nomeMotoristaDesignado:'',
    numeroRecusa:number,dataAtualizacao:serverTimestamp()
   });
   batch.set(doc(db,'historicoRecusasMotoristas',r.id+'-'+number),{
    reservaId:r.id,codigoReserva:r.codigoReserva,clienteUid:r.clienteUid||'',
    nomeCliente:r.nomeCliente||'',motoristaUid:user.uid,
    codigoMotorista:profile?.codigoMotorista||r.codigoMotorista,
    nomeMotorista:profile?.nomeMotorista||'Motorista',
    numeroRecusa:number,dataRecusa:serverTimestamp()
   });
   await batch.commit();
   message('Recusa registrada no histórico da administração.');
  }else{
   await updateDoc(doc(db,'reservas',b.dataset.id),changes);
   message('Corrida atualizada.');
  }
 }catch(err){message('Não foi possível atualizar a corrida: '+errorText(err),true)}finally{b.disabled=false}
});

function showDriverPanel(which){
 $('driverActiveBlock').classList.toggle('hidden',which!=='active');
 $('driverHistoryBlock').classList.toggle('hidden',which!=='history');
}
$('viewAssignedReservations').onclick=()=>showDriverPanel('active');
$('viewDriverHistory').onclick=()=>showDriverPanel('history');
$('reservationBack').onclick=()=>{show('homeView');showDriverPanel('active')};
$('openService').onclick=()=>{
 const r=selectedService();
 if(!r||!['confirmada','em_andamento'].includes(r.statusReserva))
  return message('Aceite a reserva antes de iniciar atendimento.',true);
 renderService();show('serviceView');
};
$('serviceBack').onclick=()=>{renderReservation();show('reservationView')};

function openReservationById(id){
 const reservation=driverTrips.find(r=>r.id===id);
 if(!reservation||!['confirmada','em_andamento'].includes(reservation.statusReserva)){
  showDriverPanel('active');return message('Esta reserva ainda não está pronta para atendimento.',true);
 }
 serviceId=id;renderReservation();show('reservationView');
}
function renderReservation(){
 const r=driverTrips.find(row=>row.id===serviceId);
 if(!r){serviceId=null;show('homeView');return}
 $('reservationDriverGreeting').textContent='Olá, '+(profile?.nomeMotorista||'Motorista')+'!';
 $('reservationClientName').textContent='Nome do Cliente: '+(r.nomeCliente||'Não informado');
 $('reservationDetails').textContent=
  'Dados da Reserva\n'+
  'Código: '+(r.codigoReserva||'')+'\n'+
  'Situação: '+(r.statusReserva||'')+'\n'+
  'Local do embarque: '+(r.localEmbarque||'')+'\n'+
  'Local do destino: '+(r.localDestino||'')+'\n'+
  'Data e horário: '+stamp(r.dataViagem)+'\n'+
  'Telefone: '+(r.telefoneCliente||'')+'\n'+
  'Passageiros: '+(r.passageiros||1)+'\n'+
  'Observações: '+(r.observacoes||'Nenhuma');
 $('reservationDetails').style.whiteSpace='pre-line';
}
function renderService(){
 const r=driverTrips.find(row=>row.id===serviceId);
 if(!r){serviceId=null;show('homeView');return}
 $('serviceClientName').textContent='Nome do Cliente: '+(r.nomeCliente||'Não informado');
 $('serviceReservationData').textContent=
  'Reserva: '+(r.codigoReserva||'')+'\n'+
  'Situação: '+(r.statusReserva||'')+'\n'+
  'Embarque: '+(r.localEmbarque||'')+'\n'+
  'Destino: '+(r.localDestino||'')+'\n'+
  'Data e horário: '+stamp(r.dataViagem)+'\n'+
  'Telefone: '+(r.telefoneCliente||'')+'\n'+
  'Passageiros: '+(r.passageiros||1)+'\n'+
  'Observações: '+(r.observacoes||'Nenhuma');
 $('serviceReservationData').style.whiteSpace='pre-line';
 const accepted=r.statusReserva==='confirmada',ongoing=r.statusReserva==='em_andamento';
 for(const id of ['serviceOnWay','servicePickupGps','serviceAvailable','serviceStart'])
  $(id).classList.toggle('hidden',!accepted);
 $('serviceComplete').classList.toggle('hidden',!ongoing);
 $('serviceDestinationGps').classList.toggle('hidden',!ongoing);
 $('servicePickupGps').href=maps(r.localEmbarque);
 $('serviceDestinationGps').href=maps(r.localDestino);
}
function selectedService(){return driverTrips.find(r=>r.id===serviceId)}
function whatsappClient(r,text){
 const digits=phoneDigits(r.telefoneCliente);
 const phone=digits.startsWith('55')&&[12,13].includes(digits.length)?digits:'55'+digits;
 if(!/^55\d{10,11}$/.test(phone)){message('Telefone do Cliente inválido para WhatsApp.',true);return}
 const link='https://wa.me/'+phone+'?text='+encodeURIComponent(text);
 const tab=window.open(link,'_blank');
 if(tab)tab.opener=null;else window.location.assign(link);
 message('Mensagem preparada. Confirme o envio no WhatsApp; o app não envia mensagens sozinho.');
}
$('serviceOnWay').onclick=()=>{
 const r=selectedService();if(!r||r.statusReserva!=='confirmada')return;
 // Tenta abrir a rota no mesmo gesto do usuario; navegadores podem bloquear multiplas abas.
 const gpsTab=window.open(maps(r.localEmbarque),'_blank');
 if(gpsTab)gpsTab.opener=null;
 whatsappClient(r,'Porto Mobi - Transporte Executivo\nOlá, '+r.nomeCliente+'! O motorista está a caminho do embarque da reserva '+r.codigoReserva+'.');
 message('Confirme o envio no WhatsApp. GPS até o embarque solicitado; se não abrir, use o botão GPS até o embarque.');
};
$('serviceAvailable').onclick=()=>{
 const r=selectedService();if(!r||r.statusReserva!=='confirmada')return;
 whatsappClient(r,'Porto Mobi - Transporte Executivo\nOlá, '+r.nomeCliente+'! O motorista está à sua disposição no ponto de embarque da reserva '+r.codigoReserva+'.');
};
$('serviceStart').onclick=async()=>{
 const r=selectedService();
 if(!r||r.statusReserva!=='confirmada')return message('Esta reserva não está confirmada para iniciar.',true);
 if(!confirm('Iniciar atendimento da reserva '+r.codigoReserva+' e abrir GPS até o destino?'))return;
 const b=$('serviceStart');b.disabled=true;
 // A aba vazia é aberta no clique do usuário; só recebe a rota após gravar no Firestore.
 const tab=window.open('about:blank','_blank');if(tab)tab.opener=null;
 try{
  await updateDoc(doc(db,'reservas',r.id),{statusReserva:'em_andamento',dataAtualizacao:serverTimestamp()});
  message('Atendimento iniciado. Abrindo rota até o destino.');
  if(tab&&!tab.closed)tab.location.replace(maps(r.localDestino));
  else window.location.assign(maps(r.localDestino));
 }catch(err){if(tab&&!tab.closed)tab.close();message('Não foi possível iniciar atendimento: '+errorText(err),true)}
 finally{b.disabled=false}
};
$('serviceComplete').onclick=async()=>{
 const r=selectedService();if(!r||r.statusReserva!=='em_andamento')return;
 if(!confirm('Concluir atendimento da reserva '+r.codigoReserva+'?'))return;
 const b=$('serviceComplete');b.disabled=true;
 try{
  await updateDoc(doc(db,'reservas',r.id),{statusReserva:'concluida',dataAtualizacao:serverTimestamp(),dataConclusao:serverTimestamp()});
  serviceId=null;show('homeView');showDriverPanel('history');
  message('Atendimento concluído. Reserva registrada no histórico.');
 }catch(err){message('Não foi possível concluir atendimento: '+errorText(err),true)}
 finally{b.disabled=false}
};

onAuthStateChanged(auth,async next=>{if(registering)return;user=next;if(!user){stop();profile=null;show('loginView');return}await loadProfile()});
