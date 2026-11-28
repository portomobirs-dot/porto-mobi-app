import fs from 'node:fs';
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {collection,doc,getDoc,getDocs,query,where,setDoc,updateDoc,writeBatch,runTransaction,serverTimestamp,Timestamp} from 'firebase/firestore';

// DADOS FICTICIOS + PROJETO DEMO. NENHUM ACESSO AO FIREBASE DE PRODUCAO.
const env=await initializeTestEnvironment({
  projectId:'demo-porto-mobi-testes',
  firestore:{rules:fs.readFileSync(new URL('../firestore.rules',import.meta.url),'utf8')}
});
after(async()=>env.cleanup());
const as=(uid,email=uid==='fZ20p0WqT7QecSd2Oh2WWJatGFg1'?'portomobirs@gmail.com':uid+'@example.invalid')=>env.authenticatedContext(uid,{email}).firestore();
const seed=async(fn)=>env.withSecurityRulesDisabled(ctx=>fn(ctx.firestore()));
const trip=(uid='clienteA',status='pendente',driver='')=>({
  clienteUid:uid,codigoCliente:'PMC-0001',codigoReserva:'PMR-000001',nomeCliente:'Cliente Ficticio',
  telefoneCliente:'(51) 99999-1111',localEmbarque:'Rua Teste 100',localDestino:'Rua Teste 200',
  dataViagem:Timestamp.fromDate(new Date(Date.now()+86400000)),dataSolicitacao:Timestamp.now(),
  statusReserva:status,motoristaUid:driver,codigoMotorista:driver?'PMM-001':'',
  passageiros:1,observacoes:'',valorViagem:0
});
async function reset({clients=false,driver=false,trips=false,status='pendente',assigned=false}={}){
  await env.clearFirestore();
  await seed(async db=>{
    await setDoc(doc(db,'administradores','fZ20p0WqT7QecSd2Oh2WWJatGFg1'),{ativo:true,papel:'administrador',codigo:'PMA-001'});
    if(clients){
      for(const uid of ['clienteA','clienteB'])
        await setDoc(doc(db,'clientes',uid),{uid,nomeCliente:'Cliente Ficticio',codigoCliente:'PMC-0001',numeroCliente:1,
          telefoneCliente:'(51) 99999-1111',email:uid+'@example.invalid',dataCadastro:Timestamp.now()});
    }
    if(driver){
      await setDoc(doc(db,'motoristas','motoristaA'),{nomeMotorista:'Motorista Ficticio',codigoMotorista:'PMM-001',aprovado:true,veiculoModelo:'Sedan Executivo',veiculoPlaca:'ABC-1D23',veiculoCor:'Preto'});
      await setDoc(doc(db,'motoristas','motoristaB'),{nomeMotorista:'Motorista Pendente',codigoMotorista:'',situacao:'pendente',numeroMotorista:0});
    }
    if(trips){
      await setDoc(doc(db,'reservas','reservaA'),trip('clienteA',status,assigned?'motoristaA':''));
      await setDoc(doc(db,'reservas','reservaB'),trip('clienteB'));
    }
  });
}

test('Acesso anonimo e criacao indevida de administrador sao negados',async()=>{
  await reset({trips:true});
  const anon=env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(anon,'reservas','reservaA')));
  await assertFails(setDoc(doc(as('clienteA'),'administradores','clienteA'),{ativo:true}));
});

test('Cliente ve somente a propria reserva e nao lista reservas de terceiros',async()=>{
  await reset({clients:true,trips:true});
  const db=as('clienteA');
  await assertSucceeds(getDoc(doc(db,'reservas','reservaA')));
  await assertSucceeds(getDocs(query(collection(db,'reservas'),where('clienteUid','==','clienteA'))));
  await assertFails(getDoc(doc(db,'reservas','reservaB')));
  await assertFails(getDocs(collection(db,'reservas')));
  await assertFails(updateDoc(doc(db,'reservas','reservaA'),{statusReserva:'concluida'}));
});

test('Administrador oferece e motorista antigo aprovado aceita e conclui',async()=>{
  await reset({driver:true,trips:true});
  const admin=as('fZ20p0WqT7QecSd2Oh2WWJatGFg1'),driver=as('motoristaA'),other=as('motoristaB');
  await assertSucceeds(getDocs(collection(admin,'reservas')));
  await assertSucceeds(updateDoc(doc(admin,'reservas','reservaA'),{
    statusReserva:'oferecida',motoristaUid:'motoristaA',codigoMotorista:'PMM-001',dataAtualizacao:serverTimestamp()
  }));
  await assertSucceeds(getDoc(doc(driver,'reservas','reservaA')));
  await assertFails(getDoc(doc(other,'reservas','reservaA')));
  for(const status of ['confirmada','em_andamento','concluida']){
    await assertSucceeds(updateDoc(doc(driver,'reservas','reservaA'),{statusReserva:status,dataAtualizacao:serverTimestamp(),...(status==='confirmada'?{nomeMotoristaDesignado:'Motorista Ficticio',veiculoModelo:'Sedan Executivo',veiculoPlaca:'ABC-1D23',veiculoCor:'Preto'}:{}),...(status==='concluida'?{dataConclusao:serverTimestamp()}:{})}));
  }
  await assertFails(updateDoc(doc(admin,'reservas','reservaA'),{statusReserva:'pendente',dataAtualizacao:serverTimestamp()}));
  await assertFails(updateDoc(doc(driver,'reservas','reservaA'),{statusReserva:'pendente',dataAtualizacao:serverTimestamp()}));
});

test('Reserva com paradas: cliente autorizado cria e terceiros nao alteram',async()=>{
  await reset({clients:true});
  const cliente=as('clienteA'),outro=as('clienteB');
  const ref=doc(cliente,'reservas','reservaParadas01');
  await assertSucceeds(runTransaction(cliente,async t=>{
    const counter=doc(cliente,'contadores','reservas');
    t.set(counter,{ultimo:1,ultimoReservaId:ref.id,ultimoClienteUid:'clienteA'});
    t.set(ref,{
      numeroReserva:1,codigoReserva:'PMR-000001',clienteUid:'clienteA',codigoCliente:'PMC-0001',
      nomeCliente:'Cliente Ficticio',telefoneCliente:'(51) 99999-1111',codigoMotorista:'',motoristaUid:'',
      localEmbarque:'Rua Exemplo, 100, Porto Alegre',paradas:['Rua Parada, 200, Porto Alegre','Rua Parada, 300, Porto Alegre'],
      localDestino:'Pontal Shopping, Porto Alegre',dataViagem:Timestamp.fromDate(new Date(Date.now()+86400000)),
      dataSolicitacao:serverTimestamp(),passageiros:2,observacoes:'',statusReserva:'pendente',valorViagem:0
    });
  }));
  const saved=await assertSucceeds(getDoc(ref));
  assert.equal(saved.data().paradas.length,2);
  await assertFails(updateDoc(doc(outro,'reservas',ref.id),{paradas:['Rua Falsa, 1']}));
  await assertFails(updateDoc(ref,{paradas:['Rua Falsa, 1']}));
});

test('Motorista pendente com flag legada aprovado nao acessa reservas',async()=>{
  await reset({driver:true,trips:true,status:'oferecida',assigned:true});
  await seed(db=>setDoc(doc(db,'motoristas','motoristaB'),{
    nomeMotorista:'Motorista Pendente',codigoMotorista:'PMM-002',
    situacao:'pendente',aprovado:true,numeroMotorista:2
  }));
  await seed(db=>updateDoc(doc(db,'reservas','reservaA'),{motoristaUid:'motoristaB',codigoMotorista:'PMM-002'}));
  const pendente=as('motoristaB');
  await assertFails(getDoc(doc(pendente,'reservas','reservaA')));
  await assertFails(updateDoc(doc(pendente,'reservas','reservaA'),{
    statusReserva:'confirmada',dataAtualizacao:serverTimestamp()
  }));
});

test('Cliente nao pode criar reserva em nome de outra pessoa nem sem contador',async()=>{
  await reset({clients:true});
  const cliente=as('clienteA');
  const ref=doc(cliente,'reservas','reservaFraude01');
  const dados={
    numeroReserva:1,codigoReserva:'PMR-000001',clienteUid:'clienteB',
    codigoCliente:'PMC-0001',nomeCliente:'Cliente Ficticio',telefoneCliente:'(51) 99999-1111',
    codigoMotorista:'',motoristaUid:'',localEmbarque:'Rua Origem 100',
    localDestino:'Rua Destino 200',dataViagem:Timestamp.fromDate(new Date(Date.now()+86400000)),
    dataSolicitacao:serverTimestamp(),passageiros:1,observacoes:'',statusReserva:'pendente',valorViagem:0
  };
  await assertFails(setDoc(ref,dados));
  await assertFails(runTransaction(cliente,async t=>{
    t.set(doc(cliente,'contadores','reservas'),{ultimo:1,ultimoReservaId:ref.id,ultimoClienteUid:'clienteA'});
    t.set(ref,dados);
  }));
});

test('Motorista pendente nao se autoaprova',async()=>{
  await reset({driver:true});
  await assertFails(updateDoc(doc(as('motoristaB'),'motoristas','motoristaB'),{
    situacao:'ativo',numeroMotorista:2,codigoMotorista:'PMM-002',dataAprovacao:serverTimestamp()
  }));
});

test('Administrador aprova PMM-002 depois do contador legado PMM-001',async()=>{
  await reset({driver:true});
  await seed(db=>setDoc(doc(db,'contadores','motoristas'),{ultimo:1,ultimoUid:'motoristaA'}));
  const db=as('fZ20p0WqT7QecSd2Oh2WWJatGFg1');
  await assertSucceeds(runTransaction(db,async t=>{
    const ref=doc(db,'motoristas','motoristaB'),counter=doc(db,'contadores','motoristas');
    const profile=await t.get(ref),count=await t.get(counter);
    assert.equal(profile.data().situacao,'pendente');assert.equal(count.data().ultimo,1);
    t.set(counter,{ultimo:2,ultimoUid:'motoristaB'});
    t.update(ref,{situacao:'ativo',numeroMotorista:2,codigoMotorista:'PMM-002',dataAprovacao:serverTimestamp()});
  }));
});

test('Cliente 1 e cliente 40 podem cadastrar; cliente 41 nao pode',async()=>{
  await reset();
  const db=as('clienteNovo','clienteNovo@example.invalid');
  await assertSucceeds(runTransaction(db,async t=>{
    const counter=doc(db,'contadores','clientes'),profile=doc(db,'clientes','clienteNovo');
    const p=await t.get(profile),c=await t.get(counter);
    assert.equal(p.exists(),false);assert.equal(c.exists(),false);
    t.set(counter,{ultimo:1,ultimoUid:'clienteNovo'});
    t.set(profile,{uid:'clienteNovo',numeroCliente:1,codigoCliente:'PMC-0001',nomeCliente:'Cliente Novo',
      telefoneCliente:'(51) 99999-1234',email:'clienteNovo@example.invalid',dataCadastro:serverTimestamp()});
  }));

  await reset();
  await seed(db2=>setDoc(doc(db2,'contadores','clientes'),{ultimo:39,ultimoUid:'cliente39'}));
  const forty=as('cliente40','cliente40@example.invalid');
  await assertSucceeds(runTransaction(forty,async t=>{
    const counter=doc(forty,'contadores','clientes'),profile=doc(forty,'clientes','cliente40');
    const c=await t.get(counter),p=await t.get(profile);
    assert.equal(c.data().ultimo,39);assert.equal(p.exists(),false);
    t.set(counter,{ultimo:40,ultimoUid:'cliente40'});
    t.set(profile,{uid:'cliente40',numeroCliente:40,codigoCliente:'PMC-0040',nomeCliente:'Cliente Quarenta',
      telefoneCliente:'(51) 99999-4321',email:'cliente40@example.invalid',dataCadastro:serverTimestamp()});
  }));
  const saved=await getDoc(doc(forty,'clientes','cliente40'));
  assert.equal(saved.data().codigoCliente,'PMC-0040');

  const db41=as('cliente41','cliente41@example.invalid');
  await assertFails(runTransaction(db41,async t=>{
    const counter=doc(db41,'contadores','clientes'),profile=doc(db41,'clientes','cliente41');
    const c=await t.get(counter),p=await t.get(profile);
    assert.equal(c.data().ultimo,40);assert.equal(p.exists(),false);
    t.set(counter,{ultimo:41,ultimoUid:'cliente41'});
    t.set(profile,{uid:'cliente41',numeroCliente:41,codigoCliente:'PMC-0041',nomeCliente:'Cliente Quarenta e Um',
      telefoneCliente:'(51) 99999-4333',email:'cliente41@example.invalid',dataCadastro:serverTimestamp()});
  }));
});


test('Fluxo integrado: cliente cria PMR, administrador oferece, motorista aceita, inicia e conclui',async()=>{
  await reset({clients:true,driver:true});
  const cliente=as('clienteA'),admin=as('fZ20p0WqT7QecSd2Oh2WWJatGFg1'),motorista=as('motoristaA'),terceiro=as('clienteB');
  const reservaRef=doc(collection(cliente,'reservas'),'reservaC001');
  await assertSucceeds(runTransaction(cliente,async t=>{
    const count=doc(cliente,'contadores','reservas');
    const antigo=await t.get(count);
    assert.equal(antigo.exists(),false);
    t.set(count,{ultimo:1,ultimoReservaId:reservaRef.id,ultimoClienteUid:'clienteA'});
    t.set(reservaRef,{
      numeroReserva:1,codigoReserva:'PMR-000001',clienteUid:'clienteA',codigoCliente:'PMC-0001',
      nomeCliente:'Cliente Ficticio',telefoneCliente:'(51) 99999-1111',
      codigoMotorista:'',motoristaUid:'',localEmbarque:'Rua Embarque 100',
      localDestino:'Rua Destino 200',dataViagem:Timestamp.fromDate(new Date(Date.now()+86400000)),
      dataSolicitacao:serverTimestamp(),passageiros:1,observacoes:'',statusReserva:'pendente',valorViagem:0
    });
  }));
  const reservaCriada=await assertSucceeds(getDoc(reservaRef));
  assert.equal(reservaCriada.data().codigoReserva,'PMR-000001');
  assert.equal(reservaCriada.data().statusReserva,'pendente');
  await assertFails(getDoc(doc(terceiro,'reservas',reservaRef.id)));
  await assertFails(updateDoc(doc(cliente,'reservas',reservaRef.id),{statusReserva:'confirmada'}));
  await assertFails(getDoc(doc(motorista,'reservas',reservaRef.id)));
  await assertFails(updateDoc(doc(admin,'reservas',reservaRef.id),{
    statusReserva:'oferecida',motoristaUid:'motoristaB',codigoMotorista:'PMM-002',
    dataAtualizacao:serverTimestamp()
  }));

  await assertSucceeds(updateDoc(doc(admin,'reservas',reservaRef.id),{
    statusReserva:'oferecida',motoristaUid:'motoristaA',codigoMotorista:'PMM-001',
    dataAtualizacao:serverTimestamp()
  }));
  await assertSucceeds(getDoc(doc(motorista,'reservas',reservaRef.id)));
  for (const proximoStatus of ['confirmada','em_andamento','concluida']) {
    await assertSucceeds(updateDoc(doc(motorista,'reservas',reservaRef.id),{
      statusReserva:proximoStatus,dataAtualizacao:serverTimestamp(),...(proximoStatus==='confirmada'?{nomeMotoristaDesignado:'Motorista Ficticio',veiculoModelo:'Sedan Executivo',veiculoPlaca:'ABC-1D23',veiculoCor:'Preto'}:{}),...(proximoStatus==='concluida'?{dataConclusao:serverTimestamp()}:{})
    }));
  }
  const historico=await assertSucceeds(getDocs(query(collection(cliente,'reservas'),where('clienteUid','==','clienteA'))));
  assert.equal(historico.docs.length,1);
  assert.equal(historico.docs[0].data().statusReserva,'concluida');
  await assertFails(updateDoc(doc(motorista,'reservas',reservaRef.id),{statusReserva:'pendente',dataAtualizacao:serverTimestamp()}));
  await assertFails(updateDoc(doc(admin,'reservas',reservaRef.id),{statusReserva:'pendente',dataAtualizacao:serverTimestamp()}));
});

test('Motorista pode recusar oferta; administrador reatribui somente motorista autorizado',async()=>{
  await reset({driver:true,trips:true,status:'oferecida',assigned:true});
  const admin=as('fZ20p0WqT7QecSd2Oh2WWJatGFg1'),motorista=as('motoristaA'),pending=as('motoristaB');
  await assertFails(updateDoc(doc(pending,'reservas','reservaA'),{statusReserva:'confirmada',dataAtualizacao:serverTimestamp()}));
  const batch=writeBatch(motorista);
  batch.update(doc(motorista,'reservas','reservaA'),{
    statusReserva:'pendente',motoristaUid:'',codigoMotorista:'',nomeMotoristaDesignado:'',
    numeroRecusa:1,dataAtualizacao:serverTimestamp()
  });
  batch.set(doc(motorista,'historicoRecusasMotoristas','reservaA-1'),{
    reservaId:'reservaA',codigoReserva:'PMR-000001',clienteUid:'clienteA',
    nomeCliente:'Cliente Ficticio',motoristaUid:'motoristaA',codigoMotorista:'PMM-001',
    nomeMotorista:'Motorista Ficticio',numeroRecusa:1,dataRecusa:serverTimestamp()
  });
  await assertSucceeds(batch.commit());
  const recusas=await assertSucceeds(getDocs(collection(admin,'historicoRecusasMotoristas')));
  assert.equal(recusas.docs.length,1);
  await assertFails(getDocs(collection(motorista,'historicoRecusasMotoristas')));
  const r=await assertSucceeds(getDoc(doc(admin,'reservas','reservaA')));
  assert.equal(r.data().statusReserva,'pendente');
  assert.equal(r.data().motoristaUid,'');
  await assertFails(updateDoc(doc(admin,'reservas','reservaA'),{
    statusReserva:'oferecida',motoristaUid:'motoristaB',codigoMotorista:'PMM-002',
    dataAtualizacao:serverTimestamp()
  }));
  await assertSucceeds(updateDoc(doc(admin,'reservas','reservaA'),{
    statusReserva:'oferecida',motoristaUid:'motoristaA',codigoMotorista:'PMM-001',
    dataAtualizacao:serverTimestamp()
  }));
});


test('Codigo de reserva usa seis digitos em transacao com numero 10000',async()=>{
  await reset({clients:true});
  await seed(db=>setDoc(doc(db,'contadores','reservas'),{
    ultimo:9999,ultimoReservaId:'reservaAnterior',ultimoClienteUid:'clienteA'
  }));
  const db=as('clienteA'),ref=doc(collection(db,'reservas'),'reservaDezMil');
  await assertSucceeds(runTransaction(db,async t=>{
    const count=doc(db,'contadores','reservas'),prev=await t.get(count);
    assert.equal(prev.data().ultimo,9999);
    t.set(count,{ultimo:10000,ultimoReservaId:ref.id,ultimoClienteUid:'clienteA'});
    t.set(ref,{
      numeroReserva:10000,codigoReserva:'PMR-010000',clienteUid:'clienteA',
      codigoCliente:'PMC-0001',nomeCliente:'Cliente Ficticio',telefoneCliente:'(51) 99999-1111',
      codigoMotorista:'',motoristaUid:'',localEmbarque:'Rua Embarque 100',
      localDestino:'Rua Destino 200',dataViagem:Timestamp.fromDate(new Date(Date.now()+86400000)),
      dataSolicitacao:serverTimestamp(),passageiros:2,observacoes:'',statusReserva:'pendente',valorViagem:0
    });
  }));
  const created=await assertSucceeds(getDoc(ref));
  assert.equal(created.data().codigoReserva,'PMR-010000');
  assert.equal(created.data().passageiros,2);
});


test('Historicos permanentes: Cliente recusa e aceita orcamento, Motorista recusa e atendimento conclui',async()=>{
 await reset({clients:true,driver:true,trips:true});
 const admin=as('fZ20p0WqT7QecSd2Oh2WWJatGFg1'),cliente=as('clienteA'),motorista=as('motoristaA');
 const reservation=doc(admin,'reservas','reservaA');
 const quote={
  kmPercurso:4,tempoPercursoMin:10,tarifaBase:5,valorPorKm:2,
  valorPorTempo:1,valorExtra:2,valorViagem:25
 };
 // O cliente nao pode inventar preco ou mudar o orcamento do administrador.
 await assertFails(updateDoc(doc(cliente,'reservas','reservaA'),{valorViagem:1}));
 await assertFails(updateDoc(doc(cliente,'reservas','reservaA'),{statusReserva:'orcamento_aceito',dataAtualizacao:serverTimestamp()}));
 await assertFails(updateDoc(reservation,{...quote,numeroOrcamento:1,valorViagem:2500,statusReserva:'orcamento_pendente',dataAtualizacao:serverTimestamp()}));
 await assertSucceeds(updateDoc(reservation,{...quote,numeroOrcamento:1,statusReserva:'orcamento_pendente',dataAtualizacao:serverTimestamp()}));
 const respond=async(resposta,number,total)=>{
  const b=writeBatch(cliente);
  b.update(doc(cliente,'reservas','reservaA'),{statusReserva:'orcamento_'+resposta,dataAtualizacao:serverTimestamp()});
  b.set(doc(cliente,'historicoOrcamentos','reservaA-'+number),{
   reservaId:'reservaA',codigoReserva:'PMR-000001',codigoCliente:'PMC-0001',
   nomeCliente:'Cliente Ficticio',clienteUid:'clienteA',
   numeroOrcamento:number,resposta,valorTotal:total,dataResposta:serverTimestamp()
  });
  return b.commit();
 };
 await assertFails(updateDoc(doc(cliente,'reservas','reservaA'),{statusReserva:'orcamento_aceito',dataAtualizacao:serverTimestamp()}));
 await assertSucceeds(respond('recusado',1,25));
 const rejected=await assertSucceeds(getDoc(doc(admin,'historicoOrcamentos','reservaA-1')));
 assert.equal(rejected.data().resposta,'recusado');
 // A recusa nao some quando a administracao envia nova proposta.
 await assertSucceeds(updateDoc(reservation,{
  ...quote,valorExtra:0,valorViagem:23,numeroOrcamento:2,
  statusReserva:'orcamento_pendente',dataAtualizacao:serverTimestamp()
 }));
 await assertSucceeds(respond('aceito',2,23));
 const history=await assertSucceeds(getDocs(collection(admin,'historicoOrcamentos')));
 assert.equal(history.docs.length,2);
 await assertFails(getDocs(collection(cliente,'historicoOrcamentos')));
 await assertFails(updateDoc(doc(cliente,'historicoOrcamentos','reservaA-1'),{resposta:'aceito'}));
 // A reserva aceita pode ser oferecida a motorista autorizado.
 await assertSucceeds(updateDoc(reservation,{
  statusReserva:'oferecida',motoristaUid:'motoristaA',codigoMotorista:'PMM-001',
  nomeMotoristaDesignado:'Motorista Ficticio',dataAtualizacao:serverTimestamp()
 }));
 const refuse=writeBatch(motorista);
 refuse.update(doc(motorista,'reservas','reservaA'),{
  statusReserva:'orcamento_aceito',motoristaUid:'',codigoMotorista:'',
  nomeMotoristaDesignado:'',numeroRecusa:1,dataAtualizacao:serverTimestamp()
 });
 refuse.set(doc(motorista,'historicoRecusasMotoristas','reservaA-1'),{
  reservaId:'reservaA',codigoReserva:'PMR-000001',clienteUid:'clienteA',nomeCliente:'Cliente Ficticio',
  motoristaUid:'motoristaA',codigoMotorista:'PMM-001',nomeMotorista:'Motorista Ficticio',
  numeroRecusa:1,dataRecusa:serverTimestamp()
 });
 await assertSucceeds(refuse.commit());
 const refusals=await assertSucceeds(getDocs(collection(admin,'historicoRecusasMotoristas')));
 assert.equal(refusals.docs.length,1);
 await assertFails(getDocs(collection(cliente,'historicoRecusasMotoristas')));
 // Mesmo motorista pode ser reofertado por administracao e concluir; a recusa anterior fica no historico.
 await assertSucceeds(updateDoc(reservation,{
  statusReserva:'oferecida',motoristaUid:'motoristaA',codigoMotorista:'PMM-001',
  nomeMotoristaDesignado:'Motorista Ficticio',dataAtualizacao:serverTimestamp()
 }));
 for(const status of ['confirmada','em_andamento','concluida']){
  await assertSucceeds(updateDoc(doc(motorista,'reservas','reservaA'),{
   statusReserva:status,dataAtualizacao:serverTimestamp(),
   ...(status==='confirmada'?{nomeMotoristaDesignado:'Motorista Ficticio',veiculoModelo:'Sedan Executivo',veiculoPlaca:'ABC-1D23',veiculoCor:'Preto'}:{}),...(status==='concluida'?{dataConclusao:serverTimestamp()}:{})
  }));
 }
 const completed=await assertSucceeds(getDoc(reservation));
 assert.equal(completed.data().statusReserva,'concluida');
 assert.ok(completed.data().dataConclusao);
 assert.equal((await getDocs(collection(admin,'historicoOrcamentos'))).docs.length,2);
 assert.equal((await getDocs(collection(admin,'historicoRecusasMotoristas'))).docs.length,1);
});
