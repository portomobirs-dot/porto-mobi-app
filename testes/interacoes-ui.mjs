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
 'export const getAuth=app=>({app,get currentUser(){return m.user}});',
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
 'export const getDocsFromServer=getDocs;',
 'export async function setDoc(ref,data){(records[ref.path]??={})[ref.id]=data;notify()}',
 'export async function updateDoc(ref,data){if(!records[ref.path]?.[ref.id])throw Error(\'Not found\');Object.assign(records[ref.path][ref.id],data);notify()}',
 'export function writeBatch(db){const ops=[];return {update(ref,data){ops.push(()=>Object.assign(records[ref.path][ref.id],data))},set(ref,data){ops.push(()=>{(records[ref.path]??={})[ref.id]=data})},async commit(){for(const op of ops)op();notify()}}}',
 'export function onSnapshot(q,cb,err){const trigger=async()=>{try{cb(await getDocs(q))}catch(e){err?.(e)}};m.dataListeners.push(trigger);queueMicrotask(trigger);return ()=>{m.dataListeners=m.dataListeners.filter(x=>x!==trigger)}}',
 'export async function runTransaction(db,cb){const ops=[];const t={get:getDoc,set(ref,data){ops.push(()=>{(records[ref.path]??={})[ref.id]=data})},update(ref,data){ops.push(()=>Object.assign(records[ref.path][ref.id],data))}};const x=await cb(t);for(const op of ops)op();notify();return x}'
].join('\n');

async function pageFor(file,mode='visitante'){
 const context=await browser.newContext({viewport:{width:390,height:844},locale:'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
 await context.addInitScript(({mode})=>{
  const m={role:mode==='motorista-aprovado'?'motorista':mode==='administrador'?'administrador':'cliente',user:mode==='motorista-aprovado'?{uid:'motorista01',email:'motorista@example.invalid'}:mode==='administrador'?{uid:'admin01',email:'portomobirs@gmail.com'}:null,
   records:{clientes:{},motoristas:{},reservas:{},contadores:{}},authListeners:[],dataListeners:[],opened:[],loginAttempts:[],resetEmails:[]};
  if(mode==='motorista-login'){
   m.records.motoristas.motorista01={uid:'motorista01',nomeMotorista:'Motorista Teste',codigoMotorista:'PMM-001',situacao:'ativo',veiculoModelo:'Toyota Corolla'};
  }
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
   m.records.administradores={admin01:{ativo:true,papel:'administrador',codigo:'PMA-001'}};
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
  assert.match(await login.innerText(),/SEJA BEM VINDO!/);
  assert.equal(await page.locator('#accessClientAccount').innerText(),'ENTRAR');
  assert.equal(await page.locator('#showRegister').innerText(),'CADASTRAR');
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

test('Tela 02: comandos, campos obrigatorios e revisao de cadastro', {timeout:30000},async()=>{
 const {context,page,errors}=await pageFor('cliente.html');
 try{
  await page.locator('#showRegister').click();
  await page.locator('#registerView').waitFor({state:'visible'});
  assert.deepEqual(await page.locator('#registerView .register-actions button').allTextContents(),['REVISAR','CADASTRAR','PAINEL DO CLIENTE']);
  assert.equal(await page.locator('#confirmRegister').isDisabled(),true);
  assert.equal(await page.locator('#clientCodePreview').getAttribute('readonly'),'');
  assert.equal(await page.locator('#regDate').getAttribute('readonly'),'');
  assert.match(await page.locator('#regDate').inputValue(),/^\d{4}-\d{2}-\d{2}$/);
  await page.locator('#reviewRegister').click();
  assert.equal(await page.locator('#registerReview').isVisible(),false);
  await page.locator('#registerViewLogout').click();
  await page.locator('#loginView').waitFor({state:'visible'});
  await page.locator('#showRegister').click();
  await page.locator('#regName').fill('Cliente Teste');
  await page.locator('#regPhone').fill('51999991111');
  await page.locator('#regEmail').fill('invalido');
  await page.locator('#regPassword').fill('senha123');
  await page.locator('#regConfirm').fill('senha456');
  await page.locator('#reviewRegister').click();
  assert.equal(await page.locator('#registerReview').isVisible(),false);
  await page.locator('#regEmail').fill('cliente@example.invalid');
  await page.locator('#reviewRegister').click();
  assert.equal(await page.locator('#registerReview').isVisible(),false);
  assert.equal(await page.locator('#confirmRegister').isDisabled(),true);
  await page.locator('#regConfirm').fill('senha123');
  await page.locator('[data-toggle="regConfirm"]').click();
  assert.equal(await page.locator('#regConfirm').getAttribute('type'),'text');
  await page.locator('[data-toggle="regConfirm"]').click();
  assert.equal(await page.locator('#regConfirm').getAttribute('type'),'password');
  await page.locator('#reviewRegister').click();
  await page.locator('#registerReview').waitFor({state:'visible'});
  await page.locator('#editRegister').click();
  assert.equal(await page.locator('#confirmRegister').isEnabled(),true);
  await page.locator('#regName').fill('Cliente Alterado');
  assert.equal(await page.locator('#confirmRegister').isDisabled(),true);
  await page.locator('#reviewRegister').click();
  await page.locator('#registerReview').waitFor({state:'visible'});
  await page.locator('#editRegister').click();
  await page.locator('#confirmRegister').click();
  await page.locator('#homeView').waitFor({state:'visible'});
  assert.equal(await page.locator('#clientCode').inputValue(),'PMC-0001');
  assert.deepEqual(errors,[]);
 }finally{await context.close()}
});

test('Tela 03: resumo fiel, senha protegida e retorno ao cadastro', {timeout:30000},async()=>{
 const {context,page,errors}=await pageFor('cliente.html');
 try{
  await page.locator('#showRegister').click();
  const fields={regName:'Cliente Teste',regPhone:'51999991111',regEmail:'cliente@example.invalid',regPassword:'senha123',regConfirm:'senha123'};
  for(const [id,value] of Object.entries(fields))await page.locator('#'+id).fill(value);
  const date=await page.locator('#regDate').inputValue();
  const phone=await page.locator('#regPhone').inputValue();
  await page.locator('#reviewRegister').click();
  await page.locator('#registerReview').waitFor({state:'visible'});
  assert.equal(await page.locator('#registerReview h2').innerText(),'CONFIRME SEUS DADOS');
  const summary=await page.locator('#registerSummary').innerText();
  for(const value of ['PMC-0000',date,fields.regName,phone,fields.regEmail])assert.ok(summary.includes(value),value);
  assert.ok(!summary.includes(fields.regPassword));
  assert.equal(await page.locator('#reviewPassword').innerText(),'********');
  const eye=page.locator('#reviewPasswordEye');
  await eye.click();
  assert.equal(await page.locator('#reviewPassword').innerText(),fields.regPassword);
  assert.equal(await eye.getAttribute('aria-pressed'),'true');
  await eye.click();
  assert.equal(await page.locator('#reviewPassword').innerText(),'********');
  assert.equal(await eye.getAttribute('aria-pressed'),'false');
  await eye.click();
  assert.equal(await page.locator('#editRegister').innerText(),'VOLTAR P/CADASTRO');
  await page.locator('#editRegister').click();
  await page.locator('#registerView').waitFor({state:'visible'});
  assert.equal(await page.locator('#reviewPassword').textContent(),'********');
  for(const [id,value] of Object.entries(fields))assert.equal(await page.locator('#'+id).inputValue(),id==='regPhone'?phone:value);
  await page.locator('#regName').fill('Cliente Alterado');
  assert.equal(await page.locator('#confirmRegister').isDisabled(),true);
  await page.locator('#reviewRegister').click();
  await page.locator('#registerReview').waitFor({state:'visible'});
  assert.match(await page.locator('#registerSummary').innerText(),/Cliente Alterado/);
  assert.equal(await page.locator('#reviewPassword').innerText(),'********');
  assert.deepEqual(errors,[]);
 }finally{await context.close()}
});

test('Tela 04: campos, passageiros, revisao e cadastro da reserva', {timeout:30000},async()=>{
 const {context,page,errors}=await pageFor('cliente.html','cliente-login');
 try{
  await page.locator('#loginEmail').fill('cliente@example.invalid');
  await page.locator('#loginPassword').fill('senha123');
  await page.locator('#accessClientAccount').click();
  await page.locator('#homeView').waitFor({state:'visible'});
  await page.locator('#showBooking').click();
  await page.locator('#bookingView').waitFor({state:'visible'});
  assert.deepEqual(await page.locator('#bookingView .booking-actions button').allTextContents(),['REVISAR']);
  assert.equal(await page.locator('#bookingCodePreview').inputValue(),'PMR-000000');
  assert.equal(await page.locator('#bookingCodePreview').getAttribute('readonly'),'');
  assert.equal(await page.locator('#bookingCreatedDate').getAttribute('readonly'),'');
  assert.match(await page.locator('#bookingCreatedDate').inputValue(),/^\d{4}-\d{2}-\d{2}$/);
  assert.equal(await page.locator('#confirmBooking').isDisabled(),true);
  await page.locator('#reviewBooking').click();
  assert.equal(await page.locator('#bookingReview').isVisible(),false);
  await page.locator('#pickup').fill('Avenida Exemplo, 100');
  await page.locator('#destination').fill('Aeroporto');
  await page.locator('#travelDate').fill('2000-01-01');
  await page.locator('#travelTime').fill('14:30');
  await page.locator('#reviewBooking').click();
  assert.equal(await page.locator('#bookingReview').isVisible(),false);
  await page.locator('#travelDate').fill(future());
  await page.locator('#decreasePassengers').click();
  assert.equal(await page.locator('#passengers').inputValue(),'1');
  for(let i=0;i<9;i++)await page.locator('#increasePassengers').click();
  assert.equal(await page.locator('#passengers').inputValue(),'4');
  for(let i=0;i<9;i++)await page.locator('#decreasePassengers').click();
  assert.equal(await page.locator('#passengers').inputValue(),'1');
  await page.locator('#increasePassengers').click();
  await page.locator('#notes').fill('Bagagem de mao');
  await page.locator('#reviewBooking').click();
  await page.locator('#bookingReview').waitFor({state:'visible'});
  const summary=await page.locator('#bookingSummary').innerText();
  for(const value of ['Avenida Exemplo, 100','Aeroporto','14:30','Passageiros: 2','Bagagem de mao'])assert.ok(summary.includes(value),value);
  await page.locator('#editBooking').click();
  assert.equal(await page.locator('#confirmBooking').isDisabled(),true);
  await page.locator('#notes').fill('Bagagem alterada');
  assert.equal(await page.locator('#confirmBooking').isDisabled(),true);
  await page.locator('#reviewBooking').click();
  await page.locator('#bookingReview').waitFor({state:'visible'});
  await page.locator('#confirmBooking').click();
  await page.locator('#bookingTracking').waitFor({state:'visible'});
  assert.match(await page.locator('#trackingCode').innerText(),/^PMR-\d{6}$/);
  assert.notEqual(await page.locator('#trackingCode').innerText(),'PMR-000000');
  assert.deepEqual(errors,[]);
 }finally{await context.close()}
});

test('Tela 05: resumo fiel, retorno e nova revisao da reserva', {timeout:30000},async()=>{
 const {context,page,errors}=await pageFor('cliente.html','cliente-login');
 try{
  await page.locator('#loginEmail').fill('cliente@example.invalid');
  await page.locator('#loginPassword').fill('senha123');
  await page.locator('#accessClientAccount').click();
  await page.locator('#homeView').waitFor({state:'visible'});
  await page.locator('#showBooking').click();
  const fields={pickup:'Avenida Exemplo, 100',destination:'Aeroporto',travelDate:future(),travelTime:'14:30'};
  for(const [id,value] of Object.entries(fields))await page.locator('#'+id).fill(value);
  await page.locator('#increasePassengers').click();
  const passengers=await page.locator('#passengers').inputValue();
  const created=await page.locator('#bookingCreatedDate').inputValue();
  await page.locator('#reviewBooking').click();
  await page.locator('#bookingReview').waitFor({state:'visible'});
  assert.equal(await page.locator('#bookingReview h2').innerText(),'REVISÃO DA SOLICITAÇÃO');
  assert.deepEqual(await page.locator('#bookingReview .booking-actions button').allTextContents(),['ALTERAR SOLICITAÇÃO','SOLICITAR','PAINEL DO CLIENTE']);
  const summary=await page.locator('#bookingSummary').innerText();
  for(const value of ['Cliente: ','Código do Cliente: PMC-','Data da Reserva: '+created,'Código da Reserva: PMR-000000','Embarque: '+fields.pickup,'Destino: '+fields.destination,'Data: '+fields.travelDate,'Horário: '+fields.travelTime,'Passageiros: '+passengers,'Observações: Nenhuma'])assert.ok(summary.includes(value),value);
  await page.locator('#editBooking').click();
  await page.locator('#bookingView').waitFor({state:'visible'});
  for(const [id,value] of Object.entries(fields))assert.equal(await page.locator('#'+id).inputValue(),value);
  assert.equal(await page.locator('#passengers').inputValue(),passengers);
  assert.equal(await page.locator('#confirmBooking').isDisabled(),true);
  await page.locator('#notes').fill('Bagagem de mao');
  assert.equal(await page.locator('#confirmBooking').isDisabled(),true);
  await page.locator('#reviewBooking').click();
  await page.locator('#bookingReview').waitFor({state:'visible'});
  assert.equal(await page.locator('#bookingSummary').innerText(),summary.replace('Observações: Nenhuma','Observações: Bagagem de mao'));
  await page.locator('#editBooking').click();
  assert.equal(await page.locator('#notes').inputValue(),'Bagagem de mao');
   await page.locator('#reviewBooking').click();
   await page.locator('#bookingReviewHome').click();
   await page.locator('#homeView').waitFor({state:'visible'});
  assert.equal(await page.locator('#confirmBooking').isDisabled(),true);
  assert.deepEqual(errors,[]);
 }finally{await context.close()}
});

test('Painel do cliente: sete comandos, codigos e navegacao', {timeout:30000},async()=>{
 const {context,page,errors}=await pageFor('cliente.html','cliente-login');
 try{
  await page.evaluate(()=>{
   const m=window.__pm;
   Object.assign(m.records.clientes.cliente01,{telefoneCliente:'(51) 99999-1111',email:'cliente@example.invalid'});
   m.records.reservas.reserva001={clienteUid:'cliente01',codigoReserva:'PMR-000001',statusReserva:'pendente',localEmbarque:'Origem',localDestino:'Destino',passageiros:1,dataSolicitacao:{seconds:2000,toDate:()=>new Date(2026,10,23,12)}};
  });
  await page.locator('#loginEmail').fill('cliente@example.invalid');
  await page.locator('#loginPassword').fill('senha123');
  await page.locator('#accessClientAccount').click();
  await page.locator('#homeView').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.getElementById('lastBookingCode').value==='PMR-000001');
  assert.equal(await page.locator('#homeView .panel-title').innerText(),'PAINEL DO CLIENTE');
  assert.deepEqual(await page.locator('#homeView .panel-actions button').allTextContents(),['SOLICITAR RESERVA','VER SOLICITAÇÃO','ACOMPANHAR ATENDIMENTO','HISTÓRICO DE ATENDIMENTOS','MEU CADASTRO','SUPORTE AO CLIENTE','SAIR DO APP']);
  assert.equal(await page.locator('#homeView .panel-actions button').count(),7);
  assert.equal(await page.locator('#clientCode').inputValue(),'PMC-0001');
  assert.equal(await page.locator('#clientCode').getAttribute('readonly'),'');
  assert.equal(await page.locator('#lastBookingCode').getAttribute('readonly'),'');
  await page.locator('#showBooking').click();
  await page.locator('#bookingView').waitFor({state:'visible'});
  await page.evaluate(()=>history.pushState({testPanel:true},''));
  await page.goBack();
  await page.locator('#homeView').waitFor({state:'visible'});
  await page.locator('#viewActiveReservations').click();
  await page.locator('#bookingTracking').waitFor({state:'visible'});
  assert.equal(await page.locator('#trackingCode').innerText(),'PMR-000001');
  await page.locator('#backToBooking').click();
  await page.locator('#homeView').waitFor({state:'visible'});
  await page.locator('#viewReservationHistory').click();
  await page.locator('#historyView').waitFor({state:'visible'});
  assert.equal(await page.locator('#historyClientCode').inputValue(),'PMC-0001');
  await page.locator('#historyBackToRegister').click();
  await page.locator('#homeView').waitFor({state:'visible'});
  await page.locator('#viewMyProfile').click();
  await page.locator('#registerView').waitFor({state:'visible'});
  assert.equal(await page.locator('#regName').inputValue(),'Cliente Teste Login');
  assert.equal(await page.locator('#regEmail').inputValue(),'cliente@example.invalid');
  assert.equal(await page.locator('#regName').getAttribute('readonly'),'');
  assert.equal(await page.locator('#regPassword').inputValue(),'');
  assert.equal(await page.locator('#confirmRegister').isDisabled(),true);
  assert.equal(await page.locator('#registerViewLogout').innerText(),'PAINEL DO CLIENTE');
  await page.locator('#registerViewLogout').click();
  await page.locator('#homeView').waitFor({state:'visible'});
  await page.locator('#logout').click();
  await page.locator('#loginView').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>window.__pm.user),null);
  assert.deepEqual(errors,[]);
 }finally{await context.close()}
});

test('Tela 09: historico proprio, ordem, filtro, vazio e retorno ao painel', {timeout:30000},async()=>{
 const {context,page,errors}=await pageFor('cliente.html','cliente-login');
 try{
  await page.locator('#loginEmail').fill('cliente@example.invalid');
  await page.locator('#loginPassword').fill('senha123');
  await page.locator('#accessClientAccount').click();
  await page.locator('#homeView').waitFor({state:'visible'});
  await page.locator('#reservationHistory').waitFor({state:'attached'});
  await page.waitForFunction(()=>document.querySelector('#reservationHistory').textContent.includes('Nenhuma reserva no histórico.'));
  await page.locator('#viewReservationHistory').click();
  await page.locator('#historyView').waitFor({state:'visible'});
  assert.match(await page.locator('#reservationHistory').innerText(),/Nenhuma reserva no histórico/);
  await page.locator('#historyBackToRegister').click();
  await page.locator('#homeView').waitFor({state:'visible'});
  await page.locator('#logout').click();
  await page.locator('#loginView').waitFor({state:'visible'});
  await page.evaluate(()=>{
   const m=window.__pm;
   for(const [id,uid,status,seconds] of [['PMR-OLD','cliente01','concluida',1],['PMR-NEW','cliente01','cancelada',3],['PMR-ACTIVE','cliente01','confirmada',4],['PMR-OTHER','outro','concluida',5]])m.records.reservas[id]={clienteUid:uid,codigoReserva:id,statusReserva:status,localEmbarque:'Origem',localDestino:'Destino',numeroOrcamento:1,valorViagem:70,dataSolicitacao:{seconds},dataViagem:{toDate:()=>new Date()}};
  });
  await page.locator('#loginEmail').fill('cliente@example.invalid');
  await page.locator('#loginPassword').fill('senha123');
  await page.locator('#accessClientAccount').click();
  await page.waitForFunction(()=>document.querySelector('#reservationHistory').textContent.includes('PMR-NEW'));
  await page.locator('#viewReservationHistory').click();
  await page.locator('#historyView').waitFor({state:'visible'});
  assert.equal(await page.locator('#historyClientCode').inputValue(),'PMC-0001');
  assert.equal(await page.locator('#historyBookingCode').inputValue(),'PMR-ACTIVE');
  const history=await page.locator('#reservationHistory').innerText();
  assert.match(history,/PMR-NEW/);assert.match(history,/PMR-OLD/);
  assert.ok(history.indexOf('PMR-NEW')<history.indexOf('PMR-OLD'));
  assert.doesNotMatch(history,/PMR-ACTIVE|PMR-OTHER/);
  assert.match(history,/70,00/);
  assert.equal(await page.locator('.history-actions').evaluate(el=>getComputedStyle(el).borderTopWidth),'0px');
  await page.locator('#historyBackToRegister').click();
  await page.locator('#homeView').waitFor({state:'visible'});
  assert.deepEqual(errors,[]);
 }finally{await context.close()}
});

test('Atendimento: acesso condicionado, resumo e saida', {timeout:30000},async()=>{
 const {context,page,errors}=await pageFor('cliente.html','cliente-login');
 try{
  await page.evaluate(()=>{window.__pm.records.reservas.r1={clienteUid:'cliente01',codigoReserva:'PMR-000001',statusReserva:'confirmada',localEmbarque:'Origem',localDestino:'Destino',nomeMotoristaDesignado:'Motorista Teste',veiculoModelo:'Corolla',veiculoPlaca:'ABC1D23',veiculoCor:'Preto',dataViagem:{toDate:()=>new Date()},dataSolicitacao:{seconds:1}}});
  await page.locator('#loginEmail').fill('cliente@example.invalid');
  await page.locator('#loginPassword').fill('senha123');
  await page.locator('#accessClientAccount').click();
  await page.locator('#homeView').waitFor({state:'visible'});
  await page.locator('#viewServiceTracking').click();
  await page.locator('#serviceTrackingView').waitFor({state:'visible'});
  assert.equal(await page.locator('#homeView').isVisible(),false);
  for(const [key,value] of Object.entries({Client:'PMC-0001',Code:'PMR-000001',Pickup:'Origem',Destination:'Destino',Driver:'Motorista Teste',Vehicle:'Corolla',Plate:'ABC1D23',Color:'Preto'}))assert.equal(await page.locator('#serviceTracking'+key).innerText(),value);
  await page.locator('#serviceTrackingLogout').click();
  await page.locator('#loginView').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>window.__pm.user),null);
  for(const status of ['pendente','cancelada','concluida','confirmada']){
   await page.evaluate(status=>{const r=window.__pm.records.reservas.r1;r.statusReserva=status;r.dataViagem={toDate:()=>new Date(Date.now()+86400000)}},status);
   await page.locator('#accessClientAccount').click();
   await page.locator('#homeView').waitFor({state:'visible'});
   await page.waitForFunction(()=>document.getElementById('lastBookingCode').value==='PMR-000001');
   assert.equal(await page.locator('#viewServiceTracking').isDisabled(),true);
   await page.locator('#logout').click();
   await page.locator('#loginView').waitFor({state:'visible'});
  }
  assert.deepEqual(errors,[]);
 }finally{await context.close()}
});

test('Tela 06: status, data, dados condicionais e retorno ao painel', {timeout:30000},async()=>{
 const {context,page,errors}=await pageFor('cliente.html','cliente-login');
 try{
  await page.evaluate(()=>{
   window.__pm.records.reservas.reserva001={clienteUid:'cliente01',codigoReserva:'PMR-000001',statusReserva:'pendente',localEmbarque:'Origem',localDestino:'Destino',passageiros:2,dataSolicitacao:{seconds:2000,toDate:()=>new Date(2026,10,23,12)},nomeMotoristaDesignado:'Motorista Exemplo',veiculoModelo:'Toyota Corolla',veiculoPlaca:'ABC1D23',veiculoCor:'Preto'};
  });
  await page.locator('#loginEmail').fill('cliente@example.invalid');
  await page.locator('#loginPassword').fill('senha123');
  await page.locator('#accessClientAccount').click();
  await page.locator('#homeView').waitFor({state:'visible'});
  const fields={trackingDriverName:'Motorista Exemplo',trackingVehicle:'Toyota Corolla',trackingPlate:'ABC1D23',trackingColor:'Preto'};
  for(const [status,label,visible] of [['pendente','Aguardando confirmação',false],['confirmada','Confirmada',true],['recusada','Recusada',false],['cancelada','Cancelada',false]]){
   await page.evaluate(status=>window.__pm.records.reservas.reserva001.statusReserva=status,status);
   await page.locator('#viewActiveReservations').click();
   await page.locator('#bookingTracking').waitFor({state:'visible'});
   assert.equal(await page.locator('#trackingStatus').innerText(),label);
   assert.equal(await page.locator('#trackingRequestDate').innerText(),'23/11/2026');
   assert.equal(await page.locator('#trackingCode').innerText(),'PMR-000001');
   assert.equal(await page.locator('#trackingDriverDetails').isVisible(),visible);
   for(const [id,value] of Object.entries(fields))assert.equal(await page.locator('#'+id).inputValue(),visible?value:'');
   assert.equal(await page.locator('#backToBooking').innerText(),'VOLTAR AO PAINEL');
   await page.locator('#backToBooking').click();
   await page.locator('#homeView').waitFor({state:'visible'});
  }
  assert.deepEqual(errors,[]);
 }finally{await context.close()}
});

test('Cliente: cadastro, revisao, reserva com codigo PMR e historico', {timeout:30000},async()=>{
 const {context,page,errors}=await pageFor('cliente.html');
 try{
  assert.match(await page.locator('#loginView').innerText(),/SEJA BEM VINDO!/);
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
  await page.locator('#registerReview').waitFor({state:'visible'});
  await page.locator('#editRegister').click();
  await page.locator('#confirmRegister').click();
  await page.locator('#homeView').waitFor({state:'visible'});
  assert.equal(await page.locator('#clientCode').inputValue(),'PMC-0001');
  await page.locator('#pmWhatsAppQueue a').waitFor();
  assert.match(await page.locator('#pmWhatsAppQueue a').getAttribute('href'),/wa\.me\/5551990082119/);
  await page.locator('#pmWhatsAppQueue button').click();
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
  await page.locator('#bookingReview').waitFor({state:'visible'});
  await page.locator('#confirmBooking').click();
  await page.locator('#bookingTracking').waitFor({state:'visible'});
  assert.equal(await page.locator('#trackingCode').innerText(),'PMR-000001');
  for(const b of await page.locator('#pmWhatsAppQueue button').all())await b.click();
  await page.goBack();
  await page.locator('#homeView').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.getElementById('lastBookingCode').value==='PMR-000001');
  assert.equal(await page.locator('#lastBookingCode').inputValue(),'PMR-000001');
  await page.locator('#viewActiveReservations').click();
  await page.locator('#bookingTracking').waitFor({state:'visible'});
  assert.equal(await page.locator('#trackingCode').innerText(),'PMR-000001');
  await page.goBack();
  await page.locator('#homeView').waitFor({state:'visible'});
  await page.locator('#viewReservationHistory').click();
  await page.locator('#historyView').waitFor({state:'visible'});
  assert.deepEqual(errors,[]);
 }finally{await context.close()}
});

test('Login do Motorista replica Cliente e marca usa tipografia uniforme', {timeout:30000},async()=>{
 const {context,page,errors}=await pageFor('motorista.html','motorista-login');
 try{
  const login=page.locator('#loginView');
  assert.match(await login.innerText(),/SEJA BEM VINDO!/);
  assert.match(await login.innerText(),/Login do Motorista/);
  assert.equal(await page.locator('#accessDriverAccount').innerText(),'ACESSAR CADASTRO');
  assert.equal(await page.locator('#showRegister').innerText(),'FAZER CADASTRO');
  assert.equal(await page.locator('#forgotPassword').innerText(),'Esqueceu a senha?');
  const style=await page.evaluate(()=>{
   const slogan=document.querySelector('header .brand-slogan');
   const font1=getComputedStyle(slogan);
   const logo=document.querySelector('header .brand-logo');
   const head=getComputedStyle(document.querySelector('header'));
   const input=getComputedStyle(document.querySelector('#loginEmail'));
   const actions=getComputedStyle(document.querySelector('.login-actions'));
   return {slogan:slogan.textContent,logo:logo.getAttribute('src'),brandFont:font1.fontFamily,brandWeight:font1.fontWeight,header:head.backgroundColor,
    inputBg:input.backgroundColor,inputText:input.color,family:input.fontFamily,
    columns:actions.gridTemplateColumns.split(' ').length,
    noHorizontalOverflow:document.documentElement.scrollWidth<=window.innerWidth+1};
  });
  assert.equal(style.slogan,'Excelência em cada trajeto.');
  assert.match(style.logo,/logo-porto-mobi\.png$/);
  assert.match(style.brandFont,/Tahoma/);
  assert.equal(style.brandWeight,'700');
  assert.equal(style.header,'rgb(0, 0, 0)');
  assert.equal(style.inputBg,'rgb(255, 255, 255)');
  assert.equal(style.inputText,'rgb(0, 0, 0)');
  assert.match(style.family,/Tahoma/);
  assert.equal(style.columns,2);
  assert.equal(style.noHorizontalOverflow,true);
  const eye=page.locator('.login-eye-button');
  assert.equal(await page.locator('#loginPassword').getAttribute('type'),'password');
  await eye.click();
  assert.equal(await page.locator('#loginPassword').getAttribute('type'),'text');
  assert.equal(await eye.getAttribute('aria-label'),'Ocultar senha');
  await eye.click();
  assert.equal(await page.locator('#loginPassword').getAttribute('type'),'password');
  await page.locator('#forgotPassword').click();
  assert.match(await page.locator('#message').innerText(),/Informe um e-mail válido/);
  await page.locator('#loginEmail').fill('motorista@example.invalid');
  await page.locator('#forgotPassword').click();
  assert.deepEqual(await page.evaluate(()=>window.__pm.resetEmails),['motorista@example.invalid']);
  await page.locator('#loginPassword').fill('senha123');
  await page.locator('#accessDriverAccount').click();
  await page.locator('#homeView').waitFor({state:'visible'});
  assert.deepEqual(await page.evaluate(()=>window.__pm.loginAttempts),
   [{email:'motorista@example.invalid',password:'senha123'}]);
  assert.deepEqual(errors,[]);
 }finally{await context.close()}
});

test('Tela 11: tres comandos, moldura e acesso autorizado', {timeout:30000},async()=>{
 const {context,page,errors}=await pageFor('motorista.html','motorista-login');
 try{
  assert.deepEqual(await page.locator('#loginView .login-actions button').allTextContents(),['ACESSAR CADASTRO','FAZER CADASTRO','PAINEL DO MOTORISTA']);
  assert.equal(await page.locator('#loginView .login-actions').evaluate(el=>getComputedStyle(el).borderTopWidth),'2px');
  await page.locator('#driverPanelLogin').click();
  assert.equal(await page.evaluate(()=>window.__pm.loginAttempts.length),0);
  await page.locator('#showRegister').click();
  await page.locator('#registerView').waitFor({state:'visible'});
  await page.reload();
  await page.locator('#loginEmail').fill('motorista@example.invalid');
  await page.locator('#loginPassword').fill('senha123');
  await page.locator('#driverPanelLogin').click();
  await page.locator('#driverPanelActions').waitFor({state:'visible'});
  await page.locator('#driverPanelLogout').click();
  await page.locator('#loginView').waitFor({state:'visible'});
  await page.evaluate(()=>{window.__pm.records.motoristas.motorista01.situacao='pendente'});
  await page.locator('#loginEmail').fill('motorista@example.invalid');
  await page.locator('#loginPassword').fill('senha123');
  await page.locator('#driverPanelLogin').click();
  await page.locator('#pendingView').waitFor({state:'visible'});
  assert.equal(await page.locator('#homeView').isVisible(),false);
  assert.deepEqual(errors,[]);
 }finally{await context.close()}
});
test('Painel do motorista: oito comandos e navegacao', {timeout:30000},async()=>{
 const {context,page,errors}=await pageFor('motorista.html','motorista-aprovado');
 try{
  await page.locator('#driverPanelActions').waitFor({state:'visible'});
  assert.deepEqual(await page.locator('#driverPanelActions button').allTextContents(),['SOLICITAÇÕES DE ATENDIMENTO','ATENDIMENTO','HISTÓRICO DE ATENDIMENTOS','AGENDA DO MOTORISTA','MEU CADASTRO','STATUS DO CADASTRO','SUPORTE AO MOTORISTA','SAIR DO APP']);
  assert.equal(await page.locator('#driverCode').inputValue(),'PMM-001');
  await page.locator('#driverPanelService').click();
  assert.match(await page.locator('#message').innerText(),/Nenhuma reserva confirmada/);
  await page.locator('#driverPanelReservations').click();
  await page.locator('#activeReservations').waitFor({state:'visible'});
  assert.match(await page.locator('#activeReservations').innerText(),/PMR-000001/);
  await page.locator('#driverPanelReturn').click();
  await page.locator('#driverPanelHistory').click();
  await page.locator('#historyReservations').waitFor({state:'visible'});
  await page.locator('#driverPanelReturn').click();
  await page.locator('#backHomeRegister').click();
  await page.locator('#registerView').waitFor({state:'visible'});
  assert.equal(await page.locator('#regName').inputValue(),'Motorista Exemplo');
  assert.equal(await page.locator('#regName').getAttribute('readonly'),'');
  await page.goBack();
  await page.locator('#driverPanelActions').waitFor({state:'visible'});
  await page.locator('#driverPanelLogout').click();
  await page.locator('#loginView').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>window.__pm.user),null);
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
  await page.locator('#reviewView').waitFor({state:'visible'});
  await page.locator('#editRegister').click();
  await page.locator('#registerView').waitFor({state:'visible'});
  await page.locator('#confirmRegister').click();
  await page.locator('#pendingView').waitFor({state:'visible'});
  assert.match(await page.locator('#pendingDriverCode').inputValue(),/PMM-000/);
  assert.deepEqual(errors,[]);
 }finally{await context.close()}
});

test('Motorista aprovado: GPS embarque, chegada interna, GPS destino e conclusao', {timeout:30000},async()=>{
 const {context,page,errors}=await pageFor('motorista.html','motorista-aprovado');
 try{
  await page.locator('#homeView').waitFor({state:'visible'});
  assert.equal(await page.locator('#driverCode').inputValue(),'PMM-001');
  await page.locator('#driverPanelReservations').click();
  await page.locator('#activeReservations [data-action="accept"]').click();
  await page.locator('#activeReservations [data-action="open"]').waitFor({state:'visible'});
  await page.locator('#activeReservations [data-action="open"]').click();
  await page.locator('#reservationView').waitFor({state:'visible'});
  assert.match(await page.locator('#reservationDriverGreeting').innerText(),/Olá, Motorista Exemplo!/);
  assert.match(await page.locator('#reservationDetails').innerText(),/PMR-000001/);
  assert.match(await page.locator('#reservationDetails').innerText(),/Observações: Bagagem/);
  assert.equal(await page.locator('#serviceComplete').isVisible(),false);

  await page.locator('#openService').click();
  const urls=await page.evaluate(()=>window.__pm.opened);
  await page.locator('#reservationAvailable').click();
  await page.locator('#serviceView').waitFor({state:'visible'});
  assert.ok(urls.some(x=>x.includes('google.com/maps/dir/')),'GPS nao abriu');
  assert.ok(await page.evaluate(()=>Boolean(window.__pm.records.reservas.reserva001.dataChegadaMotorista)),'Chegada nao registrada no app');
  assert.ok(urls.some(x=>x.includes('destination=Avenida%20Exemplo')));
  assert.ok(urls.some(x=>x.includes('dir_action=navigate')),'Navegação guiada não solicitada');
  await page.locator('#serviceStart').click();
  await page.waitForFunction(()=>window.__pm.records.reservas.reserva001.statusReserva==='em_andamento');
  await page.waitForFunction(()=>window.__pm.opened.some(x=>x.includes('destination=Aeroporto')));
  await page.locator('#serviceComplete').click();
  await page.locator('#completedView').waitFor({state:'visible'});
  await page.locator('#completedPanel').click();
  await page.locator('#homeView').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelector('#historyReservations').textContent.includes('PMR-000001'));
  assert.ok(await page.evaluate(()=>Boolean(window.__pm.records.reservas.reserva001.dataConclusao)));
  const status=await page.evaluate(()=>window.__pm.records.reservas.reserva001.statusReserva);
  assert.equal(status,'concluida');
  assert.deepEqual(errors,[]);
 }finally{await context.close()}
});


test('Administrador: orcamento calculado, historicos, autorizacao e designacao', {timeout:30000},async()=>{
 const {context,page,errors}=await pageFor('admin.html','administrador');
 page.setDefaultTimeout(5000);
 try{
  await page.locator('#dashboard').waitFor({state:'visible'});
  await page.locator('#adminVisualPanel').getByRole('button',{name:'AUTORIZAÇÃO DOS MOTORISTAS',exact:true}).click();
  await page.locator('#driverApplicants [data-approve="motorista02"]').click();
  await page.locator('dialog').getByRole('button',{name:'CONFIRMAR',exact:true}).click();
  await page.waitForFunction(()=>window.__pm.records.motoristas.motorista02.codigoMotorista==='PMM-002');
  for(const b of await page.locator('#pmWhatsAppQueue button').all())await b.click();
  await page.locator('#adminScreen5 [data-admin-screen="2"]').click();
  await page.locator('#adminVisualPanel').getByRole('button',{name:'SOLICITAÇÕES DE RESERVAS',exact:true}).click();
  await page.locator('.quote[data-quote-id="reserva001"]').waitFor({state:'visible'});
  for(const [key,value] of Object.entries({
   kmPercurso:'12.5',tempoPercursoMin:'35',tarifaBase:'10',
   valorPorKm:'3',valorPorTempo:'0.5',valorExtra:'5'
  }))await page.locator('.quote[data-quote-id="reserva001"] [data-price="'+key+'"]').fill(value);
  assert.match(await page.locator('.quote[data-quote-id="reserva001"] [data-total]').innerText(),/70,00/);
  await page.locator('[data-action="quote"][data-id="reserva001"]').click();
  await page.waitForFunction(()=>window.__pm.records.reservas.reserva001.statusReserva==='orcamento_pendente');
  assert.equal(await page.evaluate(()=>window.__pm.records.reservas.reserva001.valorViagem),70);
  for(const b of await page.locator('#pmWhatsAppQueue button').all())await b.click();
  await page.evaluate(async()=>{
   const m=window.__pm,r=m.records.reservas.reserva001;
   r.statusReserva='orcamento_aceito';
   m.records.historicoOrcamentos={
    'reserva001-1':{reservaId:'reserva001',resposta:'aceito',nomeCliente:'Cliente Exemplo',codigoReserva:'PMR-000001',numeroOrcamento:1,valorTotal:70,dataResposta:{seconds:1000,toDate:()=>new Date('2026-11-23')}},
    'reserva002-1':{reservaId:'reserva002',resposta:'recusado',nomeCliente:'Cliente Exemplo 2',codigoReserva:'PMR-000002',numeroOrcamento:1,valorTotal:90,dataResposta:{seconds:2000,toDate:()=>new Date('2026-11-23')}}
   };
   await Promise.all(m.dataListeners.map(fn=>fn()));
  });
  await page.locator('#adminScreen6 [data-admin-screen="2"]').click();
  await page.locator('#adminVisualPanel [data-admin-screen="8"]').click();
  await page.locator('#adminScreen8 [data-designate="reserva001"]').click();
  await page.locator('#adminScreen9').waitFor({state:'visible'});
  assert.equal(await page.locator('#filter').inputValue(),'orcamento_aceito');
  await page.locator('#reservations [data-action="assign"][data-id="reserva001"]').waitFor({state:'visible'});
  assert.match(await page.locator('#acceptedQuotes').innerText(),/PMR-000001/);
  assert.match(await page.locator('#refusedQuotes').innerText(),/PMR-000002/);
  await page.locator('#reservations select[data-driver-for="reserva001"]').selectOption('motorista01');
  await page.locator('#reservations [data-action="assign"]').click();
  await page.locator('dialog').getByRole('button',{name:'CONFIRMAR',exact:true}).click();
  await page.waitForFunction(()=>window.__pm.records.reservas.reserva001.statusReserva==='oferecida');
  for(const b of await page.locator('#pmWhatsAppQueue button').all())await b.click();
  await page.locator('#filter').selectOption('oferecida');
  await page.locator('#reservations [data-action="whatsapp"][data-id="reserva001"]').waitFor({state:'visible'});
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
   await page.locator('#budgetView').waitFor({state:'visible'});
   assert.equal(await page.locator('#budgetClientCode').inputValue(),'PMC-0001');
   assert.equal(await page.locator('#budgetCode').inputValue(),'PMR-000001');
   assert.match(await page.locator('#budgetValue').inputValue(),/70,00/);
   assert.match(await page.locator('#budgetDetails').innerText(),/Aeroporto/);
   assert.deepEqual(await page.locator('#budgetDetails .actions button').allTextContents(),['ACEITAR','RECUSAR','PAINEL DO CLIENTE']);
   await page.locator('#budgetBackToPanel').click();
   await page.locator('#homeView').waitFor({state:'visible'});
   assert.equal(await page.evaluate(()=>window.__pm.records.reservas.reserva001.statusReserva),'orcamento_pendente');
   await page.locator('#viewActiveReservations').click();
   await page.locator('#budgetView').waitFor({state:'visible'});
   await page.evaluate(()=>{window.confirm=()=>false});
   await page.locator('#budgetDetails [data-budget-response="'+answer+'"]').click();
   assert.equal(await page.evaluate(()=>window.__pm.records.reservas.reserva001.statusReserva),'orcamento_pendente');
   assert.equal(await page.evaluate(()=>Boolean(window.__pm.records.historicoOrcamentos?.['reserva001-1'])),false);
   await page.evaluate(()=>{window.confirm=()=>true});
   await page.locator('#budgetDetails [data-budget-response="'+answer+'"]').click();
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
  await page.locator('#driverPanelReservations').click();
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

test('Administrador: inventario de navegacao e comandos desativados', {timeout:60000},async()=>{
 const {context,page,errors}=await pageFor('admin.html','administrador');
 page.setDefaultTimeout(5000);
 try{
  await page.locator('#dashboard').waitFor({state:'visible'});
  const pending=[];
  for(let n=3;n<=15;n++){
   await page.locator('#adminVisualPanel [data-admin-screen="'+n+'"]').click();
   const screen=page.locator('#adminScreen'+n);
   await screen.waitFor({state:'visible'});
   pending.push(...await screen.locator('button:disabled').allTextContents());
   if(n===15){
    const links=await screen.locator('button[data-admin-screen]').evaluateAll(bs=>bs.map(b=>Number(b.dataset.adminScreen)).filter(n=>n>=16&&n<=19));
    for(const dest of links){
     await screen.locator('button[data-admin-screen="'+dest+'"]').click();
     const sub=page.locator('#adminScreen'+dest);
     await sub.waitFor({state:'visible'});
     pending.push(...await sub.locator('button:disabled').allTextContents());
     await page.evaluate(()=>window.adminVisualShow(15));
    }
   }
   await screen.locator('[data-admin-screen="2"]').click();
   await page.locator('#adminVisualPanel').waitFor({state:'visible'});
  }
  await page.locator('#adminVisualExit').click();
  await page.locator('#login').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>window.__pm.user),null);
  assert.deepEqual(errors,[]);
  assert.deepEqual(pending,[],'Comandos ainda desativados: '+pending.join(', '));
 }finally{await context.close()}
});
