import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

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
  assert.ok(driver.includes('Enviar cadastro para aprovação'),'Motorista: confirmacao de envio nao esta clara');
  assert.ok(driver.includes('Verificar aprovação'),'Motorista: consulta de aprovacao ausente');
});
