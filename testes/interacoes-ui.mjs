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
  const type=file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream';
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
 'export async function signInWithEmailAndPassword(auth,email,password){m.user={uid:email.includes(\'motorista\')?\'motorista01\':\'cliente01\',email};for(const cb of m.authListeners)await cb(m.user);return {user:m.user}}',
 'export async function signOut(){m.user=null;for(const cb of m.authListeners)await cb(null)}',
 'export async function deleteUser(){m.user=null}',
 'export async function sendPasswordResetEmail(){return}',
 'export async function getIdTokenResult(){return {claims:{}}}'
].join('\n');
const firestoreStub=[
 'const m=window.__pm;',
 'const records=m.records;',
 'const snap=x=>({exists:()=>Boolean(x),data:()=>x});',
 'const notify=()=>{for(const cb of m.dataListeners)queueMicrotask(cb)};',
 'export const getFirestore=app=>({app});',
 'export const doc=(db,path,id)=>({path,id});',
 'export const collection=(db,path)=>({path});',
 'export const where=(field,op,value)=>({field,op,value});',
 'export const query=(base,...filters)=>({...base,filters});',
 'export const Timestamp={fromDate(date){return {seconds:Math.floor(date.getTime()/1000),toDate:()=>date}}};',
 'export const serverTimestamp=()=>Timestamp.fromDate(new Date());',
 'export async function getDoc(ref){return snap(records[ref.path]?.[ref.id])}',
 'export async function getDocs(q){let a=Object.entries(records[q.path]||{}).map(([id,value])=>({id,data:()=>value}));for(const f of q.filters||[])if(f.op===\'==\')a=a.filter(x=>x.data()[f.field]===f.value);return {docs:a}}',
 'export async function setDoc(ref,data){(records[ref.path]??={})[ref.id]=data;notify()}',
 'export async function updateDoc(ref,data){if(!records[ref.path]?.[ref.id])throw Error(\'Not found\');Object.assign(records[ref.path][ref.id],data);notify()}',
 'export function onSnapshot(q,cb,err){const trigger=async()=>{try{cb(await getDocs(q))}catch(e){err?.(e)}};m.dataListeners.push(trigger);queueMicrotask(trigger);return ()=>{m.dataListeners=m.dataListeners.filter(x=>x!==trigger)}}',
 'export async function runTransaction(db,cb){const ops=[];const t={get:getDoc,set(ref,data){ops.push(()=>{(records[ref.path]??={})[ref.id]=data})},update(ref,data){ops.push(()=>Object.assign(records[ref.path][ref.id],data))}};const x=await cb(t);for(const op of ops)op();notify();return x}'
].join('\n');

async function pageFor(file,mode='visitante'){
 const context=await browser.newContext({viewport:{width:390,height:844},locale:'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
 await context.addInitScript(({mode})=>{
  const m={role:mode==='motorista-aprovado'?'motorista':'cliente',user:mode==='motorista-aprovado'?{uid:'motorista01',email:'motorista@example.invalid'}:null,
   records:{clientes:{},motoristas:{},reservas:{},contadores:{}},authListeners:[],dataListeners:[],opened:[]};
  if(mode==='motorista-aprovado'){
   m.records.motoristas.motorista01={uid:'motorista01',nomeMotorista:'Motorista Exemplo',codigoMotorista:'PMM-001',situacao:'ativo',veiculoModelo:'Toyota Corolla'};
   m.records.reservas.reserva001={codigoReserva:'PMR-000001',statusReserva:'oferecida',motoristaUid:'motorista01',codigoMotorista:'PMM-001',
    nomeCliente:'Cliente Exemplo',telefoneCliente:'(51) 99999-1111',localEmbarque:'Avenida Exemplo, 100',localDestino:'Aeroporto',
    passageiros:1,observacoes:'Bagagem',dataViagem:{seconds:Math.floor(Date.now()/1000)+86400,toDate:()=>new Date(Date.now()+86400000)}};
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
 await page.locator('#loginView').waitFor({state:'visible'});
 return {context,page,errors};
}
const future=()=>{const d=new Date();d.setDate(d.getDate()+30);return d.toISOString().slice(0,10)};

test('Cliente: cadastro, revisao, reserva com codigo PMR e historico', {timeout:30000},async()=>{
 const {context,page,errors}=await pageFor('cliente.html');
 try{
  assert.match(await page.locator('#loginView').innerText(),/Olá Bem Vindo!/);
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
