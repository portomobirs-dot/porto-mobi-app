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
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webmanifest':'application/manifest+json','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
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
 await cliente.evaluate(()=>{document.querySelector('#regDate').value='2026-11-23'});
 await capture(cliente,'02-cliente-cadastro');
 await expose(cliente,'registerReview',['loginView','registerView','homeView','bookingView','bookingReview']);
 await cliente.evaluate(()=>{
  document.querySelector('#registerSummary').textContent='Código do Cliente: PMC-0000\nData de cadastro: 2026-11-23\nNome: Cliente Exemplo\nTelefone: (51) 99999-1111\nE-mail: cliente@example.invalid';
  document.querySelector('#registerSummary').style.whiteSpace='pre-line';
 });
 await cliente.evaluate(()=>{document.querySelector('#reviewPassword').textContent='********';});
 await capture(cliente,'10-cliente-confirmacao-cadastro');
 await expose(cliente,'bookingView',['loginView','registerView','registerReview','homeView','bookingReview']);
 await cliente.evaluate(()=>{
  document.querySelector('#bookingGreeting').textContent='Olá, Cliente Exemplo!';
  document.querySelector('#bookingCreatedDate').value='2026-11-23';
  for(const [id,value] of Object.entries({pickup:'Avenida Exemplo, 100',destination:'Aeroporto — embarque',travelDate:'2026-12-10',travelTime:'14:30',notes:'Bagagem de mao'})){
   document.getElementById(id).value=value;
  }
 });
 await capture(cliente,'03-cliente-reserva');
 await expose(cliente,'bookingReview',['loginView','registerView','registerReview','homeView','bookingView']);
 await cliente.evaluate(()=>{
  document.querySelector('#bookingSummary').textContent='Cliente: Cliente Exemplo\nCódigo do Cliente: PMC-0001\nData da Reserva: 2026-11-23 (automática)\nCódigo da Reserva: PMR-000000 (automático)\nEmbarque: Avenida Exemplo, 100\nDestino: Aeroporto\nData: 2026-12-10\nHorário: 14:30\nPassageiros: 1\nObservações: Bagagem de mão';
 });
 await capture(cliente,'13-cliente-confirmacao-reserva');
 await expose(cliente,'bookingTracking',['loginView','registerView','registerReview','bookingView','bookingReview','homeView']);
 await cliente.evaluate(()=>{
  document.querySelector('#trackingClient').textContent='Cliente Exemplo';
  document.querySelector('#trackingClientCode').value='PMC-0001';
  document.querySelector('#trackingCode').value='PMR-000001';
  document.querySelector('#trackingStatus').value='Aguardando confirmação';
  document.querySelector('#trackingDetails').textContent='Avenida Exemplo, 100 → Aeroporto\n10/12/2026 14:30\nPassageiros: 1\nValor: A definir';
 });
 await capture(cliente,'04-cliente-acompanhamento');
 await cliente.close();

 const motorista=await pageFor('motorista.html');
 await capture(motorista,'05-motorista-login');
 await expose(motorista,'registerView',['loginView','reviewView','pendingView','homeView']);
 await motorista.evaluate(()=>{document.querySelector('#regDate').value='2026-11-23'});
 await capture(motorista,'06-motorista-cadastro');
 await expose(motorista,'reviewView',['loginView','registerView','pendingView','homeView']);
 await motorista.evaluate(()=>{
  document.querySelector('#registerSummary').textContent='Código: PMM-000 (após aprovação)\nData de cadastro: 2026-11-23\nNome: Motorista Exemplo\nTelefone: (51) 99999-2222\nE-mail: motorista@example.invalid\nVeículo: Toyota Corolla\nPlaca: ABC-1D23\nCor: Preto';
 });
 await capture(motorista,'11-motorista-confirmacao-cadastro');
 await expose(motorista,'pendingView',['loginView','registerView','reviewView','homeView']);
 await motorista.evaluate(()=>{
  document.querySelector('#pendingInfo').textContent='Motorista Exemplo • Status: pendente';
 });
 await capture(motorista,'12-motorista-aguardando-aprovacao');
 await expose(motorista,'homeView',['loginView','registerView','reviewView','pendingView','serviceView']);
 await motorista.evaluate(()=>{
  document.querySelector('#homeDriverName').value='Motorista Exemplo';
  document.querySelector('#driverCode').value='PMM-001';
  document.querySelector('#driverActiveBlock').classList.remove('hidden');
  document.querySelector('#activeReservations').innerHTML='<article class="item"><strong>PMR-000001 — oferecida</strong><p>Cliente: Cliente Exemplo<br>Embarque: Avenida Exemplo, 100<br>Destino: Aeroporto<br>Viagem: 10/12/2026, 14:30</p><div class="actions"><button data-action="accept">ACEITAR</button><button class="danger" data-action="reject">RECUSAR</button></div></article>';
  document.querySelector('#historyReservations').innerHTML='<p>Nenhuma corrida concluida.</p>';
 });
 await capture(motorista,'07-motorista-corridas');
 await expose(motorista,'reservationView',['loginView','registerView','reviewView','pendingView','homeView','serviceView']);
 await motorista.evaluate(()=>{
  document.querySelector('#reservationDriverGreeting').textContent='Olá, Motorista Exemplo!';
  document.querySelector('#reservationClientName').textContent='Nome do Cliente: Cliente Exemplo';
  document.querySelector('#reservationDetails').textContent='Dados da Reserva\nCódigo: PMR-000001\nSituação: confirmada\nLocal do embarque: Avenida Exemplo, 100\nLocal do destino: Aeroporto\nData e horário: 10/12/2026, 14:30\nTelefone: (51) 99999-1111\nPassageiros: 1\nObservações: Nenhuma';
  document.querySelector('#reservationDetails').style.whiteSpace='pre-line';
 });
 await capture(motorista,'16-motorista-atendimento-da-reserva');
 await expose(motorista,'serviceView',['loginView','registerView','reviewView','pendingView','homeView','reservationView']);
 await motorista.evaluate(()=>{
  document.querySelector('#serviceClientName').textContent='Nome do Cliente: Cliente Exemplo';
  document.querySelector('#serviceReservationData').textContent='Reserva: PMR-000001\nSituação: confirmada\nEmbarque: Avenida Exemplo, 100\nDestino: Aeroporto\nData e horário: 10/12/2026, 14:30\nTelefone: (51) 99999-1111\nPassageiros: 1';
  document.querySelector('#serviceReservationData').style.whiteSpace='pre-line';
  document.querySelector('#servicePickupGps').href='https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=Avenida%20Exemplo';
  for(const id of ['serviceComplete','serviceDestinationGps'])document.getElementById(id).classList.add('hidden');
 });
 // Etapa independente retirada: ações incorporadas à tela reservationView.
 await motorista.evaluate(()=>{
  for(const id of ['serviceOnWay','servicePickupGps','serviceAvailable','serviceStart'])document.getElementById(id).classList.add('hidden');
  document.querySelector('#serviceComplete').classList.remove('hidden');
  document.querySelector('#serviceDestinationGps').classList.remove('hidden');
  document.querySelector('#serviceReservationData').textContent='Reserva: PMR-000001\nSituação: em andamento\nEmbarque: Avenida Exemplo, 100\nDestino: Aeroporto\nData e horário: 10/12/2026, 14:30\nPassageiros: 1';
 });
 // Conclusão incorporada à tela reservationView; sem etapa visual independente.
 await motorista.close();

 const admin=await pageFor('admin.html');
 await capture(admin,'08-administrador-login');
 await expose(admin,'dashboard',['login']);
 await admin.evaluate(()=>{
  document.querySelector('#who').textContent='admin-teste@example.invalid';
  for(const [id,text] of Object.entries({total:'5',pending:'1',confirmed:'1',completed:'1',clientRefused:'1',driverRefused:'1'}))
   document.getElementById(id).textContent=text;
  document.querySelector('#reservations').innerHTML=
   '<article class="item"><h3>Reserva solicitada</h3><div class="top"><strong>PMR-000001</strong><span>pendente</span></div>'+
   '<p><b>Dados do Cliente:</b> Cliente Exemplo (PMC-0001)<br><b>Telefone:</b> (51) 99999-1111<br>'+
   '<b>Dados da Reserva:</b> Embarque Avenida Exemplo, 100 → Destino Aeroporto<br>'+
   '<b>Data:</b> 10/12/2026 às 14:30<br><b>Passageiros:</b> 2<br><b>Motorista Designado:</b> A definir</p>'+
   '<div class="quote"><h3>Cálculos da reserva</h3><div class="quote-grid">'+
   '<label>KM do percurso<input readonly value="18,4"></label>'+
   '<label>Tempo do percurso (minutos)<input readonly value="28"></label>'+
   '<label>Tarifa Base (R$)<input readonly value="25,00"></label>'+
   '<label>Valor por km (R$/km)<input readonly value="3,50"></label>'+
   '<label>Valor por tempo (R$/min)<input readonly value="0,50"></label>'+
   '<label>Valor extra (R$)<input readonly value="5,00"></label>'+
   '</div><span class="quote-total">Valor total: R$ 108,40</span>'+
   '<p class="quote-note">Prévia com valores fictícios. Tarifas definidas pelo Administrador.</p>'+
   '<div class="actions"><button data-action="quote">ENVIAR PROPOSTA AO CLIENTE</button><button class="danger" data-action="refuse">RECUSAR RESERVA</button></div></div></article>';
  document.querySelector('#driverApplicants').innerHTML='<p>Sem solicitações pendentes.</p>';
  document.querySelector('#acceptedQuotes').innerHTML='<div class="item"><strong>PMR-000002</strong><p>Cliente: Cliente Exemplo A<br>Valor: R$ 85,00<br>Resposta: aceita</p></div>';
  document.querySelector('#refusedQuotes').innerHTML='<div class="item"><strong>PMR-000003</strong><p>Cliente: Cliente Exemplo B<br>Valor: R$ 65,00<br>Resposta: recusada</p></div>';
  document.querySelector('#completedServices').innerHTML='<div class="item"><strong>PMR-000004</strong><p>Cliente: Cliente Exemplo C<br>Motorista: PMM-001<br>Valor: R$ 92,00<br>Atendimento concluído</p></div>';
  document.querySelector('#driverRefusals').innerHTML='<div class="item"><strong>PMR-000005</strong><p>Motorista: PMM-002<br>Cliente: Cliente Exemplo D<br>Recusa registrada</p></div>';
 });
 await capture(admin,'09-administrador-painel');
 await admin.evaluate(()=>{
  document.querySelector('#reservations').innerHTML=
   '<article class="item"><h3>Reserva solicitada</h3><strong>PMR-000001 — orçamento aceito</strong>'+
   '<p>Cliente: Cliente Exemplo (PMC-0001)<br>Embarque: Avenida Exemplo, 100<br>'+
   'Destino: Aeroporto<br>Valor da Reserva: R$ 108,40</p>'+
   '<div class="actions"><select><option>Motorista Exemplo — PMM-001</option></select>'+
   '<button data-action="assign">CONFIRMAR</button></div></article>';
 });
 await capture(admin,'17-administrador-motorista-designado');
 await admin.close();
 const clienteOrcamento=await pageFor('cliente.html');
 await expose(clienteOrcamento,'budgetView',['loginView','registerView','registerReview','bookingView','bookingReview','homeView','bookingTracking']);
 await clienteOrcamento.evaluate(()=>{
  document.querySelector('#budgetWelcome').textContent='Olá, Cliente Exemplo!';
  document.querySelector('#budgetProfile').textContent='Cliente Exemplo • PMC-0001';
  document.querySelector('#budgetClientCode').value='PMC-0001';
  document.querySelector('#budgetCode').value='PMR-000001';
  document.querySelector('#budgetDetails').innerHTML=
   '<div class="item"><strong>PMR-000001 — Orçamento aguardando resposta</strong>'+
   '<p>Embarque: Avenida Exemplo, 100 → Aeroporto<br>10/12/2026 14:30'+
   '<br><b>Motorista Designado:</b> A definir</p>'+
   '<label for="budgetValue" class="budget-value-title">Valor da Reserva</label><input id="budgetValue" readonly value="R$ 108,40">'+
   '<div class="actions"><button data-budget-response="aceito">Aceitar</button><button class="secondary" data-budget-response="recusado">Recusar</button></div></div>';
 });
 await capture(clienteOrcamento,'18-cliente-visualizacao-orcamento');
 await clienteOrcamento.close();
 const clienteHistorico=await pageFor('cliente.html');
 await expose(clienteHistorico,'historyView',['loginView','registerView','registerReview','bookingView','bookingReview','bookingTracking','budgetView','homeView']);
 await clienteHistorico.evaluate(()=>{
  document.querySelector('#historyWelcome').textContent='Olá, Cliente Exemplo!';
  document.querySelector('#historyClientCode').value='PMC-0001';
  document.querySelector('#historyBookingCode').value='PMR-000001';
  document.querySelector('#reservationHistory').innerHTML='<div class="item"><strong>PMR-000001 — Atendimento concluído</strong><p class="small">Embarque: Avenida Exemplo, 100<br>Destino: Aeroporto<br>10/11/2026 14:30<br>Passageiros: 1<br><b>Valor da Reserva:</b> R$ 108,40<br><b>Motorista Designado:</b> Motorista Exemplo</p></div>';
 });
 await capture(clienteHistorico,'19-cliente-historico-atendimentos');
 await clienteHistorico.close();
 await context.close();
}finally{
 await browser?.close();
 server.close();
}
