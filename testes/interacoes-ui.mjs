// Testes de botoes reais no Chromium, com Firebase FICTICIO em memoria.
// NUNCA conecta, le, grava ou altera o Firebase de producao.
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const HOST='http://127.0.0.1:4185',ROOT=process.cwd();
const server=createServer((req,res)=>{
 let pathname;
 try{pathname=decodeURIComponent(new URL(req.url,HOST).pathname)}catch{res.writeHead(400).end();return}
 const file=path.resolve(ROOT,'.'+pathname);
 if(file!==ROOT&&!file.startsWith(ROOT+path.sep)){res.writeHead(403).end();return}
 fs.readFile(file,(err,buffer)=>{
  if(err){res.writeHead(404).end('Not found');return}
  const type=file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.png')?'image/png':'application/octet-stream';
  res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'}).end(buffer);
 });
});
await new Promise(resolve=>server.listen(4185,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
after(async()=>{await browser.close();await new Promise(resolve=>server.close(resolve))});

const appStub='export const initializeApp=(config,name)=>({name});';
const authStub=[
 'const m=window.__pm;',
 'export const getAuth=app=>({app});',
 'export function onAuthStateChanged(auth,cb){m.authListeners.push(cb);queueMicrotask(()=>cb(m.user));return ()=>{}}',
 'export async function createUserWithEmailAndPassword(auth,email,password){m.user={uid:m.role===\'motorista\'?\'motoristaNovo\':\'clienteNovo\',email};return {user:m.user}}',
 'export async function signInWithEmailAndPassword(auth,email,password){m.loginAttempts.push({email,password});m.user={uid:email.includes(\'motorista\')?\'motorista01\':\'cliente01\',email};for(const cb of m.authListeners)await cb(m.user);return {user:m.user}}',
 'export async function signOut(){m.user=null;for(const cb of m.authListeners)await cb(null)}',
 'export async function deleteUser(){m.user=null}',
 'export async function sendPasswordResetEmail(auth,email){m.resetEmails.push(email);return}',
 'export async function getIdTokenResult(){return {claims:{}}}'
].join('\n');
const firestoreStub=[
 'const m=window.__pm;',
 'const records=m.records;',
 'const snap=x=>({exists:()=>Boolean(x),data:()=>x});',
 'const notify=()=>{for(const cb of m.dataListeners)queueMicrotask(cb)};',
 'export const getFirestore=app=>({app});',
 'export const doc=(db,path,id)=>db?.path&&path===undefined?{path:db.path,id:\'reservaFicticia01\'}:{path,id};',
 'export const collection=(db,path)=>({path});',
 'export const where=(field,op,value)=>({field,op,value});',
 'export const query=(base,...filters)=>({...base,filters});',
 'export const Timestamp={fromDate(date){return {seconds:Math.floor(date.getTime()/1000),toDate:()=>date}}};',
 'export const serverTimestamp=()=>Timestamp.fromDate(new Date());',
 'export async function getDoc(ref){return snap(records[ref.path]?.[ref.id])}',
 'export async function getDocs(q){let a=Object.entries(records[q.path]||{}).map(([id,value])=>({id,data:()=>value}));for(const f of q.filters||[])if(f.op===\'==\')a=a.filter(x=>x.data()[f.field]===f.value);return {docs:a}}',
 'export async function setDoc(ref,data){(records[ref.path]??={})[ref.id]=data;notify()}',
 'export async function updateDoc(ref,data){if(!records[ref.path]?.[ref.id])throw Error(\'Not found\');Object.assign(records[ref.path][ref.id],data);notify()}',
 'export function writeBatch(db){const ops=[];return {update(ref,data){ops.push(()=>Object.assign(records[ref.path][ref.id],data))},set(ref,data){ops.push(()=>{(records[ref.path]??={})[ref.id]=data})},async commit(){for(const op of ops)op();notify()}}}',
 'export function onSnapshot(q,cb,err){const trigger=async()=>{try{cb(await getDocs(q))}catch(e){err?.(e)}};m.dataListeners.push(trigger);queueMicrotask(trigger);return ()=>{m.dataListeners=m.dataListeners.filter(x=>x!==trigger)}}',
 'export async function runTransaction(db,cb){const ops=[];const t={get:getDoc,set(ref,data){ops.push(()=>{(records[ref.path]??={})[ref.id]=data})},update(ref,data){ops.push(()=>Object.assign(records[ref.path][ref.id],data))}};const x=await cb(t);for(const op of ops)op();notify();return x}'
].join('\n');

async function pageFor(file,mode='visitante'){
 const context=await browser.newContext({viewport:{width:390,height:844},locale:'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
 await context.addInitScript(({mode})=>{
  const m={role:mode==='motorista-aprovado'?'motorista':mode==='administrador'?'administrador':'cliente',user:mode==='motorista-aprovado'?{uid:'motorista01',email:'motorista@example.invalid'}:mode==='administrador'?{uid:'admin01',email:'admin@example.invalid'}:null,
   records:{clientes:{},motoristas:{},reservas:{},contadores:{}},authListeners:[],dataListeners:[],opened:[],loginAttempts:[],resetEmails:[]};
  if(mode==='motorista-aprovado'){
   m.records.motoristas.motorista01={uid:'motorista01',nomeMotorista:'Motorista Exemplo',codigoMotorista:'PMM-001',situacao:'ativo',veiculoModelo:'Toyota Corolla'};
   m.records.reservas.reserva001={codigoReserva:'PMR-000001',statusReserva:'oferecida',motoristaUid:'motorista01',codigoMotorista:'PMM-001',
    nomeCliente:'Cliente Exemplo',telefoneCliente:'(51) 99999-1111',localEmbarque:'Avenida Exemplo, 100',localDestino:'Aeroporto',
    passageiros:1,observacoes:'Bagagem',dataViagem:{seconds:Math.floor(Date.now()/1000)+86400,toDate:()=>new Date(Date.now()+86400000)}};
  }
  if(mode==='cliente-login')m.records.clientes.cliente01={uid:'cliente01',codigoCliente:'PMC-0001',nomeCliente:'Cliente Teste Login'};
  if(mode==='cliente-orcamento'){
   m.user={uid:'cliente01',email:'cliente@example.invalid'};
   m.records.clientes.cliente01={uid:'cliente01',codigoCliente:'PMC-0001',nomeCliente:'Cliente Exemplo'};
   m.records.reservas.reserva001={
    clienteUid:'cliente01',codigoCliente:'PMC-0001',codigoReserva:'PMR-000001',
    nomeCliente:'Cliente Exemplo',telefoneCliente:'(51) 99999-1111',numeroOrcamento:1,
    valorViagem:70,statusReserva:'orcamento_pendente',motoristaUid:'',codigoMotorista:'',
    localEmbarque:'Avenida Exemplo, 100',localDestino:'Aeroporto',passageiros:1,
    dataSolicitacao:{seconds:2000},dataViagem:{toDate:()=>new Date(Date.now()+86400000)}
   };
  }
  if(mode==='administrador'){
   m.records.administradores={admin01:{ativo:true,funcao:'administrador'}};
   m.records.contadores.motoristas={ultimo:1,ultimoUid:'motorista01'};
   m.records.motoristas.motorista01={nomeMotorista:'Motorista Exemplo',codigoMotorista:'PMM-001',aprovado:true,
    telefoneMotorista:'(51) 99999-2222',veiculoModelo:'Toyota Corolla'};
   m.records.motoristas.motorista02={nomeMotorista:'Motorista Pendente',codigoMotorista:'',situacao:'pendente',
    telefoneMotorista:'(51) 99999-3333',veiculoModelo:'Fiat Cronos',veiculoPlaca:'ABC-1D23',veiculoCor:'Preto'};
   m.records.reservas.reserva001={codigoReserva:'PMR-000001',statusReserva:'pendente',
    clienteUid:'cliente01',codigoCliente:'PMC-0001',nomeCliente:'Cliente Exemplo',
    telefoneCliente:'(51) 99999-1111',motoristaUid:'',codigoMotorista:'',
    localEmbarque:'Avenida Exemplo, 100',localDestino:'Aeroporto',
    passageiros:1,observacoes:'Bagagem',dataViagem:{toDate:()=>new Date(Date.now()+86400000)}};
  }
  window.__pm=m;window.confirm=()=>true;
  window.open=url=>{m.opened.push(String(url));return {opener:null,closed:false,location:{replace(next){m.opened.push(String(next))}},close(){this.closed=true}}};
 },{mode});
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.origin===HOST)return route.continue();
  if(url.origin==='https://www.gstatic.com'&&url.pathname.startsWith('/firebasejs/11.10.0/')){
   const filename=url.pathname.split('/').pop();
   const js=filename==='firebase-app.js'?appStub:filename==='firebase-auth.js'?authStub:filename==='firebase-firestore.js'?firestoreStub:null;
   if(js)return route.fulfill({status:200,contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},body:js});
  }
  return route.abort('blockedbyclient');
 });
 const page=await context.newPage(),errors=[];
 page.on('pageerror',err=>errors.push(err.message));
 await page.goto(HOST+'/'+file,{waitUntil:'domcontentloaded'});
 if(mode==='administrador')await page.waitForFunction(()=>typeof document.getElementById('loginForm')?.onsubmit==='function');
 else await page.waitForFunction(()=>typeof document.getElementById('showRegister')?.onclick==='function');
 if(!['motorista-aprovado','administrador','cliente-orcamento'].includes(mode))await page.locator('#loginView').waitFor({state:'visible'});
 return {context,page,errors};
}
const future=()=>{const d=new Date();d.setDate(d.getDate()+30);return d.toISOString().slice(0,10)};

test('Login do Cliente aprovado: olho, cadastro verde, acesso amarelo e link de recuperação', {timeout:30000},async()=>{
 const {context,page,errors}=await pageFor('cliente.html','cliente-login');
 try{
  const login=page.locator('#loginView');
  assert.match(await login.innerText(),/Seja Bem Vindo!/);
  assert.equal(await page.locator('#accessClientAccount').innerText(),'Acessar Cadastro');
  assert.equal(await page.locator('#showRegister').innerText(),'Fazer Cadastro');
  assert.equal(await page.locator('#accessClientAccount').getAttribute('type'),'submit');
  assert.equal(await page.locator('#showRegister').getAttribute('type'),'button');
  assert.equal(await page.locator('#forgotPassword').innerText(),'Esqueceu a senha?');
  assert.equal(await page.locator('#loginView button').count(),3);
  const colors=await page.evaluate(()=>{
    const get=id=>getComputedStyle(document.getElementById(id));
    return {bg:get('loginEmail').backgroundColor,color:get('loginEmail').color,
      font:get('loginEmail').fontFamily,size:get('loginEmail').fontSize,
      green:get('showRegister').backgroundImage,yellow:get('accessClientAccount').backgroundImage,
      actions:getComputedStyle(document.querySelector('.login-actions')).gridTemplateColumns,
      header:getComputedStyle(document.querySelector('header')).backgroundColor};
  });
  assert.equal(colors.bg,'rgb(255, 255, 255)');
  assert.equal(colors.color,'rgb(0, 0, 0)');
  assert.match(colors.font,/Tahoma/);
  assert.match(colors.green,/linear-gradient/);
  assert.match(colors.yellow,/linear-gradient/);
  assert.equal(colors.header,'rgb(0, 0, 0)');
  assert.equal(colors.actions.split(' ').length,2);

  await page.locator('#forgotPassword').click();
  assert.match(await page.locator('#message').innerText(),/Informe um e-mail válido/);
  await page.locator('#loginEmail').fill('cliente@example.invalid');
  await page.locator('#forgotPassword').click();
  assert.deepEqual(await page.evaluate(()=>window.__pm.resetEmails),['cliente@example.invalid']);
  assert.match(await page.locator('#message').innerText(),/instruções para redefinir a senha/);
  await page.locator('#loginPassword').fill('senha123');
  const eye=page.locator('.login-eye-button');
  await eye.click();
  assert.equal(await page.locator('#loginPassword').getAttribute('type'),'text');
  assert.equal(await eye.getAttribute('aria-label'),'Ocultar senha');
  await eye.click();
  assert.equal(await page.locator('#loginPassword').getAttribute('type'),'password');
  await page.locator('#accessClientAccount').click();
  await page.locator('#homeView').waitFor({state:'visible'});
  assert.deepEqual(await page.evaluate(()=>window.__pm.loginAttempts),
   [{email:'cliente@example.invalid',password:'senha123'}]);
  assert.deepEqual(errors,[]);
 }finally{await context.close()}
});

test('Cliente: cadastro, revisao, reserva com codigo PMR e historico', {timeout:30000},async()=>{
 const {context,page,errors}=await pageFor('cliente.html');
 try{
  assert.match(await page.locator('#loginView').innerText(),/Seja Bem Vindo!/);
  await page.locator('#showRegister').click();
  await page.locator('#registerView').waitFor({state:'visible'});
  assert.equal(await page.locator('#clientCodePreview').inputValue(),'PMC-0000');
  await page.locator('#regName').fill('Cliente Teste');
  await page.locator('#regPhone').fill('51999991111');
  await page.locator('#regEmail').fill('cliente@example.invalid');
  await page.locator('#regPassword').fill('senha123');
  await page.locator('#regConfirm').fill('senha123');
  await page.locator('[data-toggle="regPassword"]').click();
  assert.equal(await page.locator('#regPassword').getAttribute('type'),'text');
  await page.locator('#reviewRegister').click();
  await page.locator('#registerReview').waitFor({state:'visible'});
  assert.match(await page.locator('#registerSummary').innerText(),/Cliente Teste/);
  await page.locator('#editRegister').click();
  await page.locator('#registerView').waitFor({state:'visible'});
  await page.locator('#reviewRegister').click();
  await page.locator('#confirmRegister').click();
  await page.locator('#homeView').waitFor({state:'visible'});
  assert.equal(await page.locator('#clientCode').inputValue(),'PMC-0001');
  await page.locator('#showBooking').click();
  await page.locator('#bookingView').waitFor({state:'visible'});
  assert.equal(await page.locator('#bookingCodePreview').inputValue(),'PMR-000000');
  assert.match(await page.locator('#bookingCreatedDate').inputValue(),/^\d{4}-\d{2}-\d{2}$/);
  await page.locator('#pickup').fill('Avenida Exemplo, 100');
  await page.locator('#destination').fill('Aeroporto');
  await page.locator('#travelDate').fill(future());
  await page.locator('#travelTime').fill('14:30');
  await page.locator('#increasePassengers').click();
  await page.locator('#reviewBooking').click();
  await page.locator('#bookingReview').waitFor({state:'visible'});
  assert.match(await page.locator('#bookingSummary').innerText(),/Cliente: Cliente Teste/);
  await page.locator('#editBooking').click();
  await page.locator('#bookingView').waitFor({state:'visible'});
  await page.locator('#reviewBooking').click();
  await page.locator('#confirmBooking').click();
  await page.locator('#homeView').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.getElementById('lastBookingCode').value==='PMR-000001');
  assert.equal(await page.locator('#lastBookingCode').inputValue(),'PMR-000001');
  await page.locator('#viewActiveReservations').click();
  assert.match(await page.locator('#activeBlock').innerText(),/PMR-000001/);
  await page.locator('#viewReservationHistory').click();
  await page.locator('#historyBlock').waitFor({state:'visible'});
  assert.deepEqual(errors,[]);
 }finally{await context.close()}
});

test('Motorista: cadastro, revisao e autorizacao pendente', {timeout:30000},async()=>{
 const {context,page,errors}=await pageFor('motorista.html');
 try{
  await page.locator('#showRegister').click();
  await page.locator('#registerView').waitFor({state:'visible'});
  assert.equal(await page.locator('#driverCodePreview').inputValue(),'PMM-000');
  await page.locator('#regName').fill('Motorista Teste');
  await page.locator('#regPhone').fill('51999992222');
  await page.locator('#regEmail').fill('motorista@example.invalid');
  await page.locator('#regPassword').fill('senha123');
  await page.locator('#regConfirm').fill('senha123');
  await page.locator('#regVehicle').fill('Toyota Corolla');
  await page.locator('#regPlate').fill('ABC1D23');
  await page.locator('#regColor').fill('Preto');
  assert.equal(await page.locator('#regPlate').inputValue(),'ABC-1D23');
  await page.locator('#reviewRegister').click();
  await page.locator('#reviewView').waitFor({state:'visible'});
  assert.match(await page.locator('#registerSummary').innerText(),/ABC-1D23/);
  await page.locator('#editRegister').click();
  await page.locator('#registerView').waitFor({state:'visible'});
  await page.locator('#reviewRegister').click();
  await page.locator('#confirmRegister').click();
  await page.locator('#pendingView').waitFor({state:'visible'});
  assert.match(await page.locator('#pendingDriverCode').inputValue(),/PMM-000/);
  assert.deepEqual(errors,[]);
 }finally{await context.close()}
});

test('Motorista aprovado: reserva, WhatsApp, GPS, inicio e conclusao', {timeout:30000},async()=>{
 const {context,page,errors}=await pageFor('motorista.html','motorista-aprovado');
 try{
  await page.locator('#homeView').waitFor({state:'visible'});
  assert.equal(await page.locator('#driverCode').inputValue(),'PMM-001');
  await page.locator('#viewAssignedReservations').click();
  await page.locator('#activeReservations [data-action="accept"]').click();
  await page.locator('#activeReservations [data-action="open"]').waitFor({state:'visible'});
  await page.locator('#activeReservations [data-action="open"]').click();
  await page.locator('#reservationView').waitFor({state:'visible'});
  assert.match(await page.locator('#reservationDriverGreeting').innerText(),/Olá, Motorista Exemplo!/);
  assert.match(await page.locator('#reservationDetails').innerText(),/PMR-000001/);
  await page.locator('#openService').click();
  await page.locator('#serviceView').waitFor({state:'visible'});
  await page.locator('#serviceOnWay').click();
  await page.locator('#serviceAvailable').click();
  const urls=await page.evaluate(()=>window.__pm.opened);
  assert.ok(urls.some(x=>x.includes('google.com/maps/dir/')),'GPS nao abriu');
  assert.ok(urls.some(x=>x.includes('wa.me/')&&x.includes('caminho')),'Aviso a caminho nao preparado');
  assert.ok(urls.some(x=>x.includes('wa.me/')&&x.includes('disposi')),'Aviso a disposicao nao preparado');
  await page.locator('#serviceStart').click();
  await page.locator('#serviceComplete').waitFor({state:'visible'});
  await page.locator('#serviceComplete').click();
  await page.locator('#homeView').waitFor({state:'visible'});
  await page.locator('#viewDriverHistory').click();
  assert.match(await page.locator('#driverHistoryBlock').innerText(),/PMR-000001/);
  const status=await page.evaluate(()=>window.__pm.records.reservas.reserva001.statusReserva);
  assert.equal(status,'concluida');
  assert.deepEqual(errors,[]);
 }finally{await context.close()}
});


test('Administrador: orcamento calculado, historicos, autorizacao e designacao', {timeout:30000},async()=>{
 const {context,page,errors}=await pageFor('admin.html','administrador');
 try{
  await page.locator('#dashboard').waitFor({state:'visible'});
  await page.locator('#driverApplicants [data-approve="motorista02"]').click();
  await page.waitForFunction(()=>window.__pm.records.motoristas.motorista02.codigoMotorista==='PMM-002');
  await page.locator('.quote[data-quote-id="reserva001"]').waitFor({state:'visible'});
  for(const [key,value] of Object.entries({
   kmPercurso:'12.5',tempoPercursoMin:'35',tarifaBase:'10',
   valorPorKm:'3',valorPorTempo:'0.5',valorExtra:'5'
  }))await page.locator('.quote[data-quote-id="reserva001"] [data-price="'+key+'"]').fill(value);
  assert.match(await page.locator('.quote[data-quote-id="reserva001"] [data-total]').innerText(),/70,00/);
  await page.locator('[data-action="quote"][data-id="reserva001"]').click();
  await page.waitForFunction(()=>window.__pm.records.reservas.reserva001.statusReserva==='orcamento_pendente');
  assert.equal(await page.evaluate(()=>window.__pm.records.reservas.reserva001.valorViagem),70);
  await page.evaluate(async()=>{
   const m=window.__pm,r=m.records.reservas.reserva001;
   r.statusReserva='orcamento_aceito';
   m.records.historicoOrcamentos={
    'reserva001-1':{reservaId:'reserva001',resposta:'aceito',nomeCliente:'Cliente Exemplo',codigoReserva:'PMR-000001',numeroOrcamento:1,valorTotal:70,dataResposta:{seconds:1000,toDate:()=>new Date('2026-11-23')}},
    'reserva002-1':{reservaId:'reserva002',resposta:'recusado',nomeCliente:'Cliente Exemplo 2',codigoReserva:'PMR-000002',numeroOrcamento:1,valorTotal:90,dataResposta:{seconds:2000,toDate:()=>new Date('2026-11-23')}}
   };
   await Promise.all(m.dataListeners.map(fn=>fn()));
  });
  await page.locator('#reservations [data-action="assign"]').waitFor({state:'visible'});
  assert.match(await page.locator('#acceptedQuotes').innerText(),/PMR-000001/);
  assert.match(await page.locator('#refusedQuotes').innerText(),/PMR-000002/);
  await page.locator('#reservations select[data-driver-for="reserva001"]').selectOption('motorista01');
  await page.locator('#reservations [data-action="assign"]').click();
  await page.locator('#reservations [data-action="whatsapp"]').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>window.__pm.records.reservas.reserva001.statusReserva),'oferecida');
  assert.equal(await page.evaluate(()=>window.__pm.records.reservas.reserva001.nomeMotoristaDesignado),'Motorista Exemplo');
  await page.locator('#reservations [data-action="whatsapp"]').click();
  const opened=await page.evaluate(()=>window.__pm.opened);
  assert.ok(opened.some(x=>x.includes('wa.me/')&&x.includes('PMR-000001')));
  await page.evaluate(async()=>{
   const m=window.__pm,r=m.records.reservas.reserva001;
   r.statusReserva='concluida';r.dataConclusao={seconds:3000,toDate:()=>new Date('2026-11-23')};
   m.records.historicoRecusasMotoristas={
    'reserva003-1':{codigoReserva:'PMR-000003',nomeMotorista:'Motorista Teste',nomeCliente:'Cliente 3',dataRecusa:{seconds:3000,toDate:()=>new Date('2026-11-23')}}
   };
   await Promise.all(m.dataListeners.map(fn=>fn()));
  });
  await page.waitForFunction(()=>document.querySelector('#completedServices').textContent.includes('PMR-000001'));
  assert.match(await page.locator('#driverRefusals').innerText(),/PMR-000003/);
  assert.deepEqual(errors,[]);
 }finally{await context.close()}
});


for(const [answer,status] of [['aceito','orcamento_aceito'],['recusado','orcamento_recusado']]){
 test('Cliente '+answer+' orcamento e historico permanece registrado', {timeout:30000},async()=>{
  const {context,page,errors}=await pageFor('cliente.html','cliente-orcamento');
  try{
   await page.locator('#homeView').waitFor({state:'visible'});
   await page.locator('#viewActiveReservations').click();
   await page.locator('[data-budget-response="'+answer+'"]').click();
   await page.waitForFunction(expected=>window.__pm.records.reservas.reserva001.statusReserva===expected,status);
   const event=await page.evaluate(()=>window.__pm.records.historicoOrcamentos?.['reserva001-1']);
   assert.equal(event.resposta,answer);
   assert.equal(event.valorTotal,70);
   assert.equal(event.codigoReserva,'PMR-000001');
   assert.deepEqual(errors,[]);
  }finally{await context.close()}
 });
}

test('Motorista recusa oferta e evento historico registra a recusa', {timeout:30000},async()=>{
 const {context,page,errors}=await pageFor('motorista.html','motorista-aprovado');
 try{
  await page.locator('#homeView').waitFor({state:'visible'});
  await page.locator('#viewAssignedReservations').click();
  await page.locator('[data-action="reject"]').click();
  await page.waitForFunction(()=>window.__pm.records.historicoRecusasMotoristas?.['reserva001-1']);
  const data=await page.evaluate(()=>({
   status:window.__pm.records.reservas.reserva001.statusReserva,
   entry:window.__pm.records.historicoRecusasMotoristas['reserva001-1']
  }));
  assert.equal(data.status,'pendente');
  assert.equal(data.entry.codigoMotorista,'PMM-001');
  assert.equal(data.entry.numeroRecusa,1);
  assert.deepEqual(errors,[]);
 }finally{await context.close()}
});
