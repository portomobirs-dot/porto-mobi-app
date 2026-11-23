import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {padCode} from '../js/common.js';

const roles=[
  {name:'Cliente',page:'cliente.html',script:'js/cliente.js',manifest:'manifest-cliente.webmanifest',start:'./cliente.html'},
  {name:'Motorista',page:'motorista.html',script:'js/motorista.js',manifest:'manifest-motorista.webmanifest',start:'./motorista.html'},
  {name:'Administrador',page:'admin.html',script:'js/admin.js',manifest:'manifest-admin.webmanifest',start:'./admin.html'}
];
const read=f=>fs.readFileSync(f,'utf8');

function pngSize(file){
  const buf=fs.readFileSync(file);
  assert.ok(buf.length>=24,file+' nao e um PNG completo');
  assert.equal(buf.subarray(0,8).toString('hex'),'89504e470d0a1a0a',file+' nao e PNG');
  assert.equal(buf.subarray(12,16).toString('ascii'),'IHDR',file+' IHDR ausente');
  return {width:buf.readUInt32BE(16),height:buf.readUInt32BE(20)};
}

test('Paginas Cliente, Motorista e Administrador possuem campos, manifestos e scripts validos',()=>{
  for(const role of roles){
    const html=read(role.page),script=read(role.script);
    assert.match(html,/<html\b[^>]*lang=["']pt-BR["']/i,role.name);
    assert.ok(html.includes(role.manifest),role.name+': manifest faltando');
    assert.ok(html.includes('./'+role.script),role.name+': script faltando');
    assert.ok(html.includes("serviceWorker.register('./sw.js')"),role.name+': SW faltando');
    const ids=[...html.matchAll(/\bid=["']([^"'\s]+)["']/g)].map(x=>x[1]);
    assert.equal(new Set(ids).size,ids.length,role.name+': IDs duplicados');
    const controls=[...script.matchAll(/\$\(['"]([^'"]+)['"]\)/g)].map(x=>x[1]);
    const missing=[...new Set(controls)].filter(id=>!ids.includes(id));
    assert.deepEqual(missing,[],role.name+': campos usados no script nao encontrados');
    for(const [,labelId] of html.matchAll(/<label[^>]*\bfor=["']([^"']+)["'][^>]*>/gi)){
      assert.ok(ids.includes(labelId),role.name+': label for sem input '+labelId);
    }
  }
});

test('Manifestos descrevem entradas de instalacao separadas',()=>{
  const ids=new Set();
  for(const role of roles){
    const manifest=JSON.parse(read(role.manifest));
    assert.equal(manifest.start_url,role.start);
    assert.equal(manifest.id,role.start);
    assert.equal(manifest.display,'standalone');
    assert.ok(!ids.has(manifest.id),'manifest ID duplicado');
    ids.add(manifest.id);
    const icons=manifest.icons||[];
    for(const size of [192,512]){
      const i=icons.find(x=>x.sizes===size+'x'+size);
      assert.ok(i,role.name+': icone '+size+' ausente');
      assert.equal(i.type,'image/png');
      assert.equal(path.basename(i.src),'icon-'+size+'.png');
    }
  }
});

test('PNG originais tem dimensoes esperadas e a logo nao esta vazia',()=>{
  assert.deepEqual(pngSize('icon-192.png'),{width:192,height:192});
  assert.deepEqual(pngSize('icon-512.png'),{width:512,height:512});
  assert.ok(fs.statSync('logo-porto-mobi.png').size>100);
});

test('Service worker limita cache ao proprio shell e exclui Firebase remoto',()=>{
  const js=read('sw.js');
  assert.ok(js.includes("req.method!=='GET'"),'nao limita metodo');
  assert.ok(js.includes("new URL(req.url).origin!==self.location.origin"),'nao limita origem');
  assert.ok(!js.includes('firestore.googleapis.com'),'Firestore nao deve entrar no cache');
  for(const role of roles){assert.ok(js.includes("'./"+role.page+"'"));}
});


test('Cadastros de Cliente e Motorista exibem os comandos ate confirmar',()=>{
  const checks=[
    {page:'cliente.html',script:'js/cliente.js',review:'registerReview',buttons:['showRegister','reviewRegister','backLogin','confirmRegister','editRegister']},
    {page:'motorista.html',script:'js/motorista.js',review:'reviewView',buttons:['showRegister','reviewRegister','backLogin','confirmRegister','editRegister','checkApproval','logoutPending']}
  ];
  for(const item of checks){
    const html=read(item.page),js=read(item.script);
    for(const id of item.buttons){
      assert.match(html,new RegExp('<button[^>]+id=["\\x27]'+id+'["\\x27]'),item.page+': botao '+id+' ausente');
      assert.ok(js.includes("$('"+id+"').onclick"),item.page+': comando '+id+' sem tratamento');
    }
    assert.ok(html.includes('id="'+item.review+'"'),item.page+': painel de revisao ausente');
    for(const id of ['regPassword','regConfirm']){
      assert.ok(html.includes('data-toggle="'+id+'"'),item.page+': mostrar senha '+id+' ausente');
    }
    assert.ok(html.includes('Etapa 1 de 2')&&html.includes('Etapa 2 de 2'),item.page+': etapas nao explicadas');
  }
  const driver=read('motorista.html');
  assert.ok(driver.includes('id="confirmRegister">Cadastrar</button>'),'Motorista: botao Cadastrar ausente na revisao');
  assert.ok(driver.includes('Verificar aprovação'),'Motorista: consulta de aprovacao ausente');
});


test('Codigos e datas automaticas seguem os formatos PMC-0000, PMR-000000 e PMM-000',()=>{
  assert.equal(padCode('PMC',1),'PMC-0001');
  assert.equal(padCode('PMC',40),'PMC-0040');
  assert.equal(padCode('PMR',1),'PMR-000001');
  assert.equal(padCode('PMR',10000),'PMR-010000');
  assert.equal(padCode('PMM',1),'PMM-001');
  assert.equal(padCode('PMM',3),'PMM-003');
  const client=read('cliente.html'),driver=read('motorista.html'),clientJS=read('js/cliente.js'),driverJS=read('js/motorista.js');
  assert.ok(client.includes('value="PMC-0000"'));
  assert.ok(client.includes('value="PMR-000000"'));
  assert.ok(driver.includes('value="PMM-000"'));
  for(const [name,html,js] of [['Cliente',client,clientJS],['Motorista',driver,driverJS]]){
    assert.ok(html.includes('id="regDate" readonly type="date"'),name+' nao mostra data automatica');
    assert.ok(js.includes("$('regDate').value=todayLocal()"),name+' nao atualiza data');
    assert.ok(html.includes('id="forgotPassword"'),name+' sem recuperacao de senha');
    assert.ok(js.includes("$('forgotPassword').onclick"),name+' recuperar senha sem comando');
  }
  for(const id of ['copyClientCode','copyBookingCode','increasePassengers','decreasePassengers']){
    assert.ok(client.includes('id="'+id+'"'),id+' ausente');
    assert.ok(clientJS.includes("$('"+id+"').onclick"),id+' sem acao');
  }
  assert.ok(driverJS.includes("$('copyDriverCode').onclick"),'motorista nao pode copiar codigo');
  const rules=read('firestore.rules');
  assert.ok(rules.includes("prefix == 'PMR' ?"),'regras nao aceitam seis digitos PMR');
  assert.ok(rules.includes("numeroReserva <= 999999"),'limite numerico PMR incorreto');
});


test('Fluxos aprovados de Cliente e Motorista possuem comandos visiveis e acionaveis',()=>{
 const c=read('cliente.html'),cjs=read('js/cliente.js'),m=read('motorista.html'),mjs=read('js/motorista.js');
 const clientButtons=['forgotPassword','showRegister','reviewRegister','editRegister','confirmRegister',
  'showBooking','viewActiveReservations','viewReservationHistory','logout','reviewBooking','backHome',
  'editBooking','confirmBooking'];
 const driverButtons=['forgotPassword','showRegister','reviewRegister','editRegister','confirmRegister',
  'viewAssignedReservations','viewDriverHistory','openService','serviceOnWay','serviceAvailable','serviceStart',
  'serviceComplete','serviceBack','logout','logoutPending'];
 for(const id of clientButtons){
  assert.ok(c.includes('id="'+id+'"'),'Cliente: botao '+id+' ausente');
  assert.ok(cjs.includes("$('"+id+"').onclick"),'Cliente: botao '+id+' sem acao');
 }
 for(const id of driverButtons){
  assert.ok(m.includes('id="'+id+'"'),'Motorista: botao '+id+' ausente');
  assert.ok(mjs.includes("$('"+id+"').onclick"),'Motorista: botao '+id+' sem acao');
 }
 assert.ok(c.includes('Olá, Bem-Vindo!')&&m.includes('Olá, Bem-Vindo!'),'Saudacao de login ausente');
 assert.ok(c.includes('id="clientWelcome"')&&c.includes('id="bookingGreeting"'));
 assert.ok(c.includes('id="bookingCreatedDate" type="date" readonly'),'Data automatica da reserva ausente');
 assert.ok(cjs.includes("currentProfile?.nomeCliente"),'Revisao de reserva nao inclui cliente');
 assert.ok(m.includes('id="serviceClientName"')&&m.includes('id="serviceReservationData"'));
 assert.ok(m.includes('id="servicePickupGps"')&&m.includes('id="serviceDestinationGps"'));
 assert.ok(mjs.includes("https://wa.me/"),'WhatsApp do Cliente nao esta integrado');
 assert.ok(mjs.includes('function maps('),'Link GPS nao esta implementado');
 assert.ok(mjs.includes("'em_andamento'")&&mjs.includes("'concluida'"),'Etapas de atendimento ausentes');
});
