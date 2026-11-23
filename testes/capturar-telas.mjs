// Capturas reais de HTML/CSS em um navegador isolado, com conteudo ficticio.
// NUNCA faz login ou grava informacoes no Firebase da empresa.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const HOST='http://127.0.0.1:4173';
const OUT='testes/capturas-mobile';
fs.mkdirSync(OUT,{recursive:true});
// Servidor local embutido: nao depende de Python e nao acessa a rede publica.
const ROOT=process.cwd();
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.webmanifest':'application/manifest+json','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
const server=createServer((req,res)=>{
  let pathname;
  try{pathname=decodeURIComponent(new URL(req.url,HOST).pathname)}catch{res.writeHead(400).end();return}
  const file=path.resolve(ROOT,'.'+pathname);
  if(file!==ROOT&&!file.startsWith(ROOT+path.sep)){res.writeHead(403).end();return}
  fs.readFile(file,(err,body)=>{
    if(err){res.writeHead(404).end('Nao encontrado');return}
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(body);
  });
});
server.listen(4173,'127.0.0.1');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function ready(){
 for(let i=0;i<45;i++){
  try{const r=await fetch(HOST+'/index.html');if(r.ok)return;}catch{}
  await sleep(250);
 }
 throw new Error('Servidor de preview nao iniciou.');
}
let browser;
try{
 await ready();
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({
  viewport:{width:390,height:844},deviceScaleFactor:1,
  locale:'pt-BR',timezoneId:'America/Sao_Paulo',
  serviceWorkers:'block',colorScheme:'dark'
 });
 // Bloqueia qualquer chamada externa: inclusive SDK e endpoints Firebase.
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.origin===HOST)return route.continue();
  return route.abort();
 });
 async function pageFor(file){
  const page=await context.newPage();
  await page.goto(HOST+'/'+file,{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(150);
  return page;
 }
 async function expose(page,show,hide){
  await page.evaluate(({show,hide})=>{
   for(const id of hide){document.getElementById(id)?.classList.add('hidden');}
   document.getElementById(show)?.classList.remove('hidden');
  },{show,hide});
 }
 async function capture(page,name){
  await page.screenshot({path:path.join(OUT,name+'.png'),fullPage:true,animations:'disabled'});
  console.log('CAPTURA: '+name+'.png');
 }

 const cliente=await pageFor('cliente.html');
 await capture(cliente,'01-cliente-login');
 await expose(cliente,'registerView',['loginView','registerReview','homeView','bookingView','bookingReview']);
 await capture(cliente,'02-cliente-cadastro');
 await expose(cliente,'bookingView',['loginView','registerView','registerReview','homeView','bookingReview']);
 await cliente.evaluate(()=>{
  for(const [id,value] of Object.entries({pickup:'Avenida Exemplo, 100',destination:'Aeroporto — embarque',travelDate:'2026-12-10',travelTime:'14:30',notes:'Bagagem de mao'})){
   document.getElementById(id).value=value;
  }
 });
 await capture(cliente,'03-cliente-reserva');
 await expose(cliente,'homeView',['loginView','registerView','registerReview','bookingView','bookingReview']);
 await cliente.evaluate(()=>{
  document.querySelector('#profileInfo').textContent='Cliente Exemplo • PMC-0001';
  document.querySelector('#activeReservations').innerHTML='<div class="item"><strong>PMR-0001</strong> — pendente<p class="small">Avenida Exemplo, 100 → Aeroporto<br>10/12/2026 14:30<br>Valor: A definir</p></div>';
  document.querySelector('#reservationHistory').innerHTML='<p>Nenhuma reserva concluida.</p>';
 });
 await capture(cliente,'04-cliente-acompanhamento');
 await cliente.close();

 const motorista=await pageFor('motorista.html');
 await capture(motorista,'05-motorista-login');
 await expose(motorista,'registerView',['loginView','reviewView','pendingView','homeView']);
 await capture(motorista,'06-motorista-cadastro');
 await expose(motorista,'homeView',['loginView','registerView','reviewView','pendingView']);
 await motorista.evaluate(()=>{
  document.querySelector('#profileInfo').textContent='Motorista Exemplo • PMM-001 • Veiculo demonstrativo';
  document.querySelector('#activeReservations').innerHTML='<article class="item"><strong>PMR-0001 — oferecida</strong><p>Cliente: Cliente Exemplo<br>Embarque: Avenida Exemplo, 100<br>Destino: Aeroporto<br>Viagem: 10/12/2026, 14:30</p><div class="actions"><button>Aceitar</button><button class="danger">Recusar</button></div></article>';
  document.querySelector('#historyReservations').innerHTML='<p>Nenhuma corrida concluida.</p>';
 });
 await capture(motorista,'07-motorista-corridas');
 await motorista.close();

 const admin=await pageFor('admin.html');
 await capture(admin,'08-administrador-login');
 await expose(admin,'dashboard',['login']);
 await admin.evaluate(()=>{
  document.querySelector('#who').textContent='admin-teste@example.invalid';
  for(const [id,text] of Object.entries({total:'1',pending:'1',confirmed:'0'})){
   document.getElementById(id).textContent=text;
  }
  document.querySelector('#reservations').innerHTML='<article class="item"><div class="top"><strong>PMR-0001</strong><span>pendente</span></div><p><b>Cliente:</b> Cliente Exemplo (PMC-0001)<br><b>Origem:</b> Avenida Exemplo, 100<br><b>Destino:</b> Aeroporto<br><b>Viagem:</b> 10/12/2026 14:30</p><div class="actions"><select><option>Escolha motorista autorizado</option><option>Motorista Exemplo • PMM-001</option></select><button>Oferecer corrida</button></div></article>';
  document.querySelector('#driverApplicants').innerHTML='<p>Sem solicitacoes pendentes.</p>';
 });
 await capture(admin,'09-administrador-painel');
 await admin.close();
 await context.close();
}finally{
 await browser?.close();
 server.close();
}
