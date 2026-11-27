import {offerWhatsApp} from './common.js?v=wa25';
import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,onAuthStateChanged,createUserWithEmailAndPassword,deleteUser,signInWithEmailAndPassword,signOut,sendPasswordResetEmail} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,doc,getDoc,setDoc,collection,query,where,onSnapshot,updateDoc,writeBatch,serverTimestamp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {firebaseConfig,esc,formatPhone,phoneDigits,stamp,todayLocal,errorText} from './common.js';
const app=initializeApp(firebaseConfig,'porto-mobi-motoristas'),auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
const views=['loginView','registerView','reviewView','pendingView','homeView','reservationView','serviceView','completedView','agendaView','supportView'];
const message=(s,bad=false)=>{$('message').textContent=s;$('message').className=bad?'error':'success'};
const show=id=>{views.forEach(v=>$(v).classList.toggle('hidden',v!==id));message('')};
const val=id=>$(id).value.trim();
let user=null,profile=null,registering=false,unsub=null,driverTrips=[],serviceId=null;
$('regDate').value=todayLocal();
$('forgotPassword').onclick=async event=>{event.preventDefault();const email=$('loginEmail');if(!email.value||!email.checkValidity())return message('Informe um e-mail válido na tela de acesso.',true);try{await sendPasswordResetEmail(auth,email.value.trim());message('Se o e-mail estiver cadastrado, você receberá instruções para redefinir a senha.')}catch{message('Não foi possível solicitar a recuperação da senha.',true)}};
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
$('showRegister').onclick=()=>{if(user)return loadProfile();$('regPassword').required=true;$('regConfirm').required=true;for(const el of $('registerForm').querySelectorAll('input:not(#driverCodePreview):not(#regDate)'))el.readOnly=false;$('reviewRegister').disabled=false;invalidateDriverReview();$('regDate').value=todayLocal();show('registerView')};$('editRegister').onclick=()=>show('registerView');
$('registerDriverPanel').onclick=()=>{if(user)return loadProfile();show('loginView')};
$('driverPanelLogin').onclick=()=>{if(user)return loadProfile();$('loginForm').requestSubmit()};
$('loginForm').onsubmit=async e=>{e.preventDefault();try{message('Entrando...');await signInWithEmailAndPassword(auth,val('loginEmail'),$('loginPassword').value)}catch(err){message(errorText(err),true)}};
let reviewedDriver=null;
const driverSnapshot=()=>JSON.stringify([...$('registerForm').querySelectorAll('input')].map(el=>el.value));
function invalidateDriverReview(){reviewedDriver=null;$('confirmRegister').disabled=true}
$('registerForm').addEventListener('input',invalidateDriverReview);
$('registerForm').addEventListener('change',invalidateDriverReview);
$('registerForm').addEventListener('submit',e=>e.preventDefault());
$('reviewRegister').onclick=()=>{
 if(!$('registerForm').reportValidity())return;
 if(!user&&$('regPassword').value!==$('regConfirm').value)return message('As senhas não coincidem.',true);
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
  if(user){
   if(user.email?.toLowerCase()!==val('regEmail').toLowerCase())throw Error('O e-mail informado deve ser o mesmo da conta autenticada.');
  }else{
   cred=await createUserWithEmailAndPassword(auth,val('regEmail'),$('regPassword').value);user=cred.user;
  }
  await setDoc(doc(db,'motoristas',user.uid),{uid:user.uid,nomeMotorista:val('regName'),telefoneMotorista:val('regPhone'),email:user.email,veiculoModelo:val('regVehicle'),veiculoPlaca:val('regPlate'),veiculoCor:val('regColor'),situacao:'pendente',numeroMotorista:0,codigoMotorista:'',dataCadastro:serverTimestamp()});
  await loadProfile();message('Cadastro enviado. Aguarde autorização do administrador.');offerWhatsApp('5551990082119','Porto Mobi: novo cadastro de motorista aguardando autorização.');
 }catch(err){if(cred){try{await deleteUser(cred.user);user=null}catch(_){}}show('registerView');message(errorText(err),true)}finally{registering=false;b.disabled=reviewedDriver!==driverSnapshot()}
};
const logout=async()=>{stop();driverTrips=[];serviceId=null;await signOut(auth);show('loginView')};
$('driverPanelLogout').onclick=logout;$('pendingPanel').onclick=()=>{show('homeView');showDriverPanel('panel')};$('driverPanelStatus').onclick=async()=>{await loadProfile();if(isApproved()){show('pendingView');$('pendingInfo').textContent='Cadastro autorizado';$('pendingDriverCode').value=profile.codigoMotorista||''}};
$('backHomeRegister').onclick=()=>{
 if(!user||!profile)return;
 invalidateDriverReview();
 const fields={regName:profile.nomeMotorista,regPhone:profile.telefoneMotorista,regEmail:profile.email||user.email,regVehicle:profile.veiculoModelo,regPlate:profile.veiculoPlaca,regColor:profile.veiculoCor};
 for(const [id,value] of Object.entries(fields))$(id).value=value||'';
 const date=profile.dataCadastro?.toDate?.();if(date)$('regDate').value=date.toLocaleDateString('sv-SE');
 $('regPassword').value='';$('regConfirm').value='';
 for(const el of $('registerForm').querySelectorAll('input'))el.readOnly=true;
 $('reviewRegister').disabled=true;
 show('registerView');
 message('Cadastro já enviado. Consulta dos dados; use o retorno do navegador para voltar à tela anterior.');
 if(!history.state?.pendingRegister)history.pushState({pendingRegister:true},'');
};
window.addEventListener('popstate',()=>{if(user&&profile&&!$('registerView').classList.contains('hidden'))loadProfile()});
const isApproved=()=>profile&&(profile.situacao==='ativo'||profile.aprovado===true);
async function loadProfile(){
 if(!user)return;stop();
 try{
  const snap=await getDoc(doc(db,'motoristas',user.uid));
  if(!snap.exists()){
   profile=null;
   $('regEmail').value=user.email||'';
   $('regEmail').readOnly=true;
   $('regDate').value=todayLocal();
   $('regPassword').value='';$('regConfirm').value='';
   $('regPassword').required=false;$('regConfirm').required=false;
   invalidateDriverReview();
   show('registerView');
   return message('Sua conta existe, mas o cadastro de motorista está incompleto. Preencha os dados, toque em REVISAR CADASTRO e depois em CADASTRAR. A aprovação será feita pela administração.');
  }
  profile=snap.data();
  $('driverGreeting').textContent='Olá, '+(profile.nomeMotorista||'Motorista')+'!';$('driverCode').value=profile.codigoMotorista||'Aguardando aprovação';for(const id of ['driverPanelReservations','driverPanelService','driverPanelHistory','driverPanelAgenda'])$(id).disabled=!isApproved();if(!isApproved()){driverTrips=[];show('pendingView');$('pendingInfo').textContent=profile.nomeMotorista+' • Cadastro em '+stamp(profile.dataCadastro)+' • Status: '+profile.situacao;$('pendingDriverCode').value='PMM-000 (pendente)';return}
  show('homeView');showDriverPanel('panel');$('driverGreeting').textContent='Olá, '+(profile.nomeMotorista||'Motorista')+'!';$('homeDriverName').value=profile.nomeMotorista||'';$('driverCode').value=profile.codigoMotorista||'Aguardando aprovação';
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
  const action=history?'':r.statusReserva==='oferecida'?`<div class="actions"><button data-action="accept" data-id="${esc(r.id)}">ACEITAR</button><button class="danger" data-action="reject" data-id="${esc(r.id)}">RECUSAR</button></div>`:
   r.statusReserva==='confirmada'?`<div class="actions"><button data-action="open" data-id="${esc(r.id)}">Visualizar Atendimento da Solicitação</button></div>`:
   r.statusReserva==='em_andamento'?`<div class="actions"><button data-action="open" data-id="${esc(r.id)}">Visualizar Atendimento em Andamento</button></div>`:'';
  return `<article class="item"><strong>${esc(r.codigoReserva)} — ${esc(r.statusReserva)}</strong><p>Cliente: ${esc(r.nomeCliente)}<br>Telefone: ${esc(r.telefoneCliente)}<br>Embarque: ${esc(r.localEmbarque)}<br>Destino: ${esc(r.localDestino)}<br>Viagem: ${esc(stamp(r.dataViagem))}<br>Passageiros: ${esc(r.passageiros||1)}</p>${action}</article>`;
 };
 $('activeReservations').innerHTML=active.length?active.map(r=>html(r)).join(''):'<p>Nenhuma corrida atribuída.</p>';
 $('historyReservations').innerHTML=hist.length?hist.map(r=>`<article class="item"><strong>Solicitação: ${esc(r.codigoReserva)}</strong><p>Cliente: ${esc(r.nomeCliente)}<br>Data e horário: ${esc(stamp(r.dataViagem))}<br>Embarque: ${esc(r.localEmbarque)}<br>Destino: ${esc(r.localDestino)}<br>Passageiros: ${esc(r.passageiros||1)}</p><p>${esc(({concluida:"Atendimento concluído",recusada:"Solicitação recusada",cancelada:"Solicitação cancelada"})[r.statusReserva]||r.statusReserva)}</p></article>`).join(''):'<p>Histórico vazio.</p>';
 if(serviceId && !$('reservationView').classList.contains('hidden'))renderReservation();
 if(serviceId && !$('serviceView').classList.contains('hidden'))renderService();
}
function maps(place){return 'https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination='+encodeURIComponent(String(place||'').trim())}
$('activeReservations').addEventListener('click',async e=>{
 const b=e.target.closest('button[data-action]');if(!b||!user||!isApproved())return;
 if(b.dataset.action==='open'){openReservationById(b.dataset.id);return}
 const status={accept:'confirmada',reject:'pendente'}[b.dataset.action];if(!status)return;
 if(!confirm('Confirmar ação: '+b.textContent+'?'))return;
 const changes={statusReserva:status,dataAtualizacao:serverTimestamp()};
 if(status==='confirmada')Object.assign(changes,{nomeMotoristaDesignado:profile?.nomeMotorista||'',veiculoModelo:profile?.veiculoModelo||'',veiculoPlaca:profile?.veiculoPlaca||'',veiculoCor:profile?.veiculoCor||''});
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
   message('Recusa registrada no histórico da administração.');offerWhatsApp('5551990082119','Porto Mobi: motorista recusou a reserva '+r.codigoReserva+'.');
  }else{
   await updateDoc(doc(db,'reservas',b.dataset.id),changes);
   message('Corrida atualizada.');offerWhatsApp('5551990082119','Porto Mobi: motorista aceitou a reserva '+r.codigoReserva+'.');offerWhatsApp(r.telefoneCliente,'Porto Mobi: sua reserva '+r.codigoReserva+' foi confirmada pelo motorista.');
  }
 }catch(err){message('Não foi possível atualizar a corrida: '+errorText(err),true)}finally{b.disabled=false}
});

$('driverPanelReservations').onclick=()=>showDriverPanel('active');
$('driverPanelHistory').onclick=()=>showDriverPanel('history');
$('driverPanelReturn').onclick=()=>showDriverPanel('panel');
$('driverPanelService').onclick=()=>{const r=driverTrips.find(r=>['confirmada','em_andamento'].includes(r.statusReserva));if(!r)return message('Nenhuma reserva confirmada para atendimento.',true);openReservationById(r.id)};
function showDriverPanel(which){
 if(!isApproved())which='panel';
 $('driverPanelActions').classList.toggle('hidden',which!=='panel');$('driverPanelReturn').classList.toggle('hidden',which==='panel');
 $('driverActiveBlock').classList.toggle('hidden',which!=='active');
 $('driverHistoryBlock').classList.toggle('hidden',which!=='history');
 $('driverPanelTitle').textContent=which==='history'?'HISTÓRICO DE ATENDIMENTOS':'PAINEL DO MOTORISTA';
 $('driverGreeting').classList.toggle('hidden',which==='history');
 $('driverPanelCodeBox').classList.toggle('hidden',which==='history');
 $('historyDriverCode').textContent='Código do Motorista: '+(profile?.codigoMotorista||'');
 $('historyDriverName').textContent='Nome do Motorista: '+(profile?.nomeMotorista||'');
}


$('openService').onclick=()=>{
 const r=selectedService();
 if(!r||!['confirmada','em_andamento'].includes(r.statusReserva))
  return message('Aceite a reserva antes de iniciar atendimento.',true);
 if(r.statusReserva==='confirmada'){if(!String(r.localEmbarque||'').trim())return message('Endereço de embarque não informado.',true);window.open(maps(r.localEmbarque),'_blank','noopener');}
};
$('reservationAvailable').onclick=async()=>{const r=selectedService();if(!isApproved()||!r||r.statusReserva!=='confirmada')return;const b=$('reservationAvailable');b.disabled=true;try{if(!r.dataChegadaMotorista){await updateDoc(doc(db,'reservas',r.id),{dataChegadaMotorista:serverTimestamp(),dataAtualizacao:serverTimestamp()});offerWhatsApp(r.telefoneCliente,'Porto Mobi: seu motorista chegou ao local de embarque. Reserva '+r.codigoReserva+'.');}renderService();show('serviceView');}catch(e){message('Não foi possível registrar a chegada: '+errorText(e),true);}finally{b.disabled=false;}};
$('serviceBack').onclick=()=>{show('homeView');showDriverPanel('panel')};
function openReservationById(id){
 const reservation=driverTrips.find(r=>r.id===id);
 if(!isApproved()||!reservation||!['confirmada','em_andamento'].includes(reservation.statusReserva)){
  showDriverPanel('active');return message('Esta reserva ainda não está pronta para atendimento.',true);
 }
 serviceId=id;if(reservation.statusReserva==='em_andamento'){renderService();show('serviceView')}else{renderReservation();show('reservationView')}
}
function renderReservation(){
 const r=driverTrips.find(row=>row.id===serviceId);
 if(!r){serviceId=null;show('homeView');return}
 $('reservationDriverGreeting').textContent='Olá, '+(profile?.nomeMotorista||'Motorista')+'!';
 $('reservationClientName').textContent='Nome do Cliente: '+(r.nomeCliente||'Não informado');
 $('reservationDetails').textContent=
  'Dados da Solicitação\n'+
  'Código: '+(r.codigoReserva||'')+'\n'+
  'Situação: '+(r.statusReserva||'')+'\n'+
  'Local do embarque: '+(r.localEmbarque||'')+'\n'+
  'Local do destino: '+(r.localDestino||'')+'\n'+
  'Data e horário: '+stamp(r.dataViagem)+'\n'+
  'Passageiros: '+(r.passageiros||1)+'\n'+
  'Observações: '+(r.observacoes||'Nenhuma');
 $('reservationDetails').style.whiteSpace='pre-line';
 $('openService').disabled=r.statusReserva!=='confirmada';$('reservationAvailable').disabled=r.statusReserva!=='confirmada';
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
 $('serviceStart').disabled=!['confirmada','em_andamento'].includes(r.statusReserva);$('serviceComplete').disabled=r.statusReserva!=='em_andamento';
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
$('serviceStart').onclick=async()=>{
 const r=selectedService();
 if(!isApproved()||!r)return;if(!String(r.localDestino||'').trim())return message('Endereço de destino não informado.',true);if(r.statusReserva==='em_andamento'){window.open(maps(r.localDestino),'_blank','noopener');return}if(r.statusReserva!=='confirmada')return;
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
 const r=selectedService();if(!isApproved()||!r||r.statusReserva!=='em_andamento')return;
 if(!confirm('Concluir atendimento da reserva '+r.codigoReserva+'?'))return;
 const b=$('serviceComplete');b.disabled=true;
 try{
  await updateDoc(doc(db,'reservas',r.id),{statusReserva:'concluida',dataAtualizacao:serverTimestamp(),dataConclusao:serverTimestamp()});
  $('completedDetails').textContent='Solicitação: '+(r.codigoReserva||'')+'\nCliente: '+(r.nomeCliente||'')+'\nData: '+todayLocal();serviceId=null;show('completedView');
  message('Atendimento concluído. Reserva registrada no histórico.');offerWhatsApp(r.telefoneCliente,'Porto Mobi: atendimento '+r.codigoReserva+' concluído. Obrigado pela preferência!');
 }catch(err){message('Não foi possível concluir atendimento: '+errorText(err),true)}
 finally{b.disabled=false}
};

onAuthStateChanged(auth,async next=>{if(registering)return;user=next;if(!user){stop();profile=null;show('loginView');return}await loadProfile()});

const returnPanel=()=>{show('homeView');showDriverPanel('panel')};
for(const id of ['completedPanel','agendaPanel','supportPanel'])$(id).onclick=returnPanel;
$('driverPanelAgenda').onclick=()=>{
 if(!isApproved())return;
 const rows=driverTrips.filter(r=>r.statusReserva==='confirmada'&&(r.dataViagem?.seconds||0)*1000>=Date.now()).sort((a,b)=>a.dataViagem.seconds-b.dataViagem.seconds);
 $('agendaList').innerHTML=rows.length?rows.map(r=>'<article class="item"><strong>'+esc(stamp(r.dataViagem))+'</strong><p>Solicitação: '+esc(r.codigoReserva)+'<br>Cliente: '+esc(r.nomeCliente)+'<br>Embarque: '+esc(r.localEmbarque)+'<br>Destino: '+esc(r.localDestino)+'</p></article>').join(''):'<p>Nenhum próximo atendimento confirmado.</p>';
 show('agendaView');
};
$('driverPanelSupport').onclick=()=>{$('supportInfo').textContent='';show('supportView')};
for(const id of ['supportContact','supportDelay','supportIssue'])$(id).onclick=()=>{$('supportInfo').textContent='Canal de suporte ainda não configurado. Contate a administração pelo canal habitual.'};
