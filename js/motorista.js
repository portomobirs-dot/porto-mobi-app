import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,onAuthStateChanged,createUserWithEmailAndPassword,deleteUser,signInWithEmailAndPassword,signOut} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,doc,getDoc,setDoc,collection,query,where,onSnapshot,updateDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {firebaseConfig,esc,formatPhone,phoneDigits,stamp,errorText} from './common.js';
const app=initializeApp(firebaseConfig,'porto-mobi-motoristas'),auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
const views=['loginView','registerView','reviewView','pendingView','homeView'];
const message=(s,bad=false)=>{$('message').textContent=s;$('message').className=bad?'error':'success'};
const show=id=>{views.forEach(v=>$(v).classList.toggle('hidden',v!==id));message('')};
const val=id=>$(id).value.trim();
let user=null,profile=null,registering=false,unsub=null;
function stop(){if(unsub){unsub();unsub=null}}
for(const btn of document.querySelectorAll('[data-toggle]'))btn.addEventListener('click',()=>{const el=$(btn.dataset.toggle);el.type=el.type==='password'?'text':'password';btn.textContent=el.type==='password'?'Mostrar':'Ocultar'});
$('regPhone').oninput=e=>{e.target.value=formatPhone(e.target.value)};
$('regPlate').oninput=e=>{let s=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);e.target.value=s.length>3?s.slice(0,3)+'-'+s.slice(3):s};
$('showRegister').onclick=()=>show('registerView');$('backLogin').onclick=()=>show('loginView');$('editRegister').onclick=()=>show('registerView');
$('loginForm').onsubmit=async e=>{e.preventDefault();try{message('Entrando...');await signInWithEmailAndPassword(auth,val('loginEmail'),$('loginPassword').value)}catch(err){message(errorText(err),true)}};
$('reviewRegister').onclick=()=>{
 if(!$('registerForm').reportValidity())return;
 if($('regPassword').value!==$('regConfirm').value)return message('As senhas não coincidem.',true);
 if(![10,11].includes(phoneDigits(val('regPhone')).length))return message('Telefone inválido.',true);
 if(!/^[A-Z]{3}-[0-9][A-Z0-9][0-9]{2}$/.test(val('regPlate')))return message('Placa inválida. Formato ABC-1D23 ou ABC-1234.',true);
 $('registerSummary').textContent=`Nome: ${val('regName')}\nTelefone: ${val('regPhone')}\nE-mail: ${val('regEmail')}\nVeículo: ${val('regVehicle')}\nPlaca: ${val('regPlate')}\nCor: ${val('regColor')}`;
 show('reviewView');
};
$('confirmRegister').onclick=async()=>{
 const b=$('confirmRegister');b.disabled=true;registering=true;let cred=null;
 try{
  cred=await createUserWithEmailAndPassword(auth,val('regEmail'),$('regPassword').value);user=cred.user;
  await setDoc(doc(db,'motoristas',user.uid),{uid:user.uid,nomeMotorista:val('regName'),telefoneMotorista:val('regPhone'),email:user.email,veiculoModelo:val('regVehicle'),veiculoPlaca:val('regPlate'),veiculoCor:val('regColor'),situacao:'pendente',numeroMotorista:0,codigoMotorista:'',dataCadastro:serverTimestamp()});
  await loadProfile();message('Cadastro enviado. Aguarde autorização do administrador.');
 }catch(err){if(cred){try{await deleteUser(cred.user);user=null}catch(_){}}show('registerView');message(errorText(err),true)}finally{registering=false;b.disabled=false}
};
const logout=async()=>{stop();await signOut(auth);show('loginView')};
$('logout').onclick=logout;$('logoutPending').onclick=logout;$('checkApproval').onclick=loadProfile;
async function loadProfile(){
 if(!user)return;stop();
 try{
  const snap=await getDoc(doc(db,'motoristas',user.uid));
  if(!snap.exists()){show('loginView');return message('Cadastro de motorista inexistente. Contate a administração.',true)}
  profile=snap.data();
  if(profile.situacao!=='ativo'&&profile.aprovado!==true){show('pendingView');$('pendingInfo').textContent=profile.nomeMotorista+' • Status: '+profile.situacao;return}
  show('homeView');$('profileInfo').textContent=`${profile.nomeMotorista} • ${profile.codigoMotorista} • ${profile.veiculoModelo||profile.modeloVeiculo||''}`;
  const q=query(collection(db,'reservas'),where('motoristaUid','==',user.uid));
  unsub=onSnapshot(q,snap=>renderTrips(snap.docs.map(d=>({id:d.id,...d.data()}))),err=>message('Erro ao consultar reservas: '+errorText(err),true));
 }catch(err){message(errorText(err),true)}
}
const done=new Set(['concluida','recusada','cancelada']);
function renderTrips(rows){
 rows.sort((a,b)=>(b.dataSolicitacao?.seconds||0)-(a.dataSolicitacao?.seconds||0));
 const active=rows.filter(r=>!done.has(r.statusReserva)),hist=rows.filter(r=>done.has(r.statusReserva));
 const html=(r,history=false)=>{
  const action=history?'':r.statusReserva==='oferecida'?`<div class="actions"><button data-action="accept" data-id="${esc(r.id)}">Aceitar</button><button class="danger" data-action="reject" data-id="${esc(r.id)}">Recusar</button></div>`:
   r.statusReserva==='confirmada'?`<div class="actions"><a class="nav secondary" target="_blank" rel="noopener noreferrer" href="${maps(r.localEmbarque)}">Navegar ao embarque (GPS)</a><button data-action="start" data-id="${esc(r.id)}">Iniciar atendimento</button></div>`:
   r.statusReserva==='em_andamento'?`<div class="actions"><a class="nav secondary" target="_blank" rel="noopener noreferrer" href="${maps(r.localDestino)}">Navegar ao destino (GPS)</a><button data-action="complete" data-id="${esc(r.id)}">Concluir corrida</button></div>`:'';
  return `<article class="item"><strong>${esc(r.codigoReserva)} — ${esc(r.statusReserva)}</strong><p>Cliente: ${esc(r.nomeCliente)}<br>Telefone: ${esc(r.telefoneCliente)}<br>Embarque: ${esc(r.localEmbarque)}<br>Destino: ${esc(r.localDestino)}<br>Viagem: ${esc(stamp(r.dataViagem))}</p>${action}</article>`;
 };
 $('activeReservations').innerHTML=active.length?active.map(r=>html(r)).join(''):'<p>Nenhuma corrida atribuída.</p>';
 $('historyReservations').innerHTML=hist.length?hist.map(r=>html(r,true)).join(''):'<p>Histórico vazio.</p>';
}
function maps(place){return 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination='+encodeURIComponent(place||'')}
$('activeReservations').addEventListener('click',async e=>{
 const b=e.target.closest('button[data-action]');if(!b||!user)return;
 const status={accept:'confirmada',reject:'pendente',start:'em_andamento',complete:'concluida'}[b.dataset.action];if(!status)return;
 if(!confirm('Confirmar ação: '+b.textContent+'?'))return;
 const changes={statusReserva:status,dataAtualizacao:serverTimestamp()};
 if(b.dataset.action==='reject'){changes.motoristaUid='';changes.codigoMotorista=''}
 b.disabled=true;try{await updateDoc(doc(db,'reservas',b.dataset.id),changes);message('Corrida atualizada.')}catch(err){message(errorText(err),true)}finally{b.disabled=false}
});
onAuthStateChanged(auth,async next=>{if(registering)return;user=next;if(!user){stop();profile=null;show('loginView');return}await loadProfile()});
