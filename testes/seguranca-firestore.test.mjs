import fs from 'node:fs';
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {collection,doc,getDoc,getDocs,query,where,setDoc,updateDoc,runTransaction,serverTimestamp,Timestamp} from 'firebase/firestore';

// DADOS FICTICIOS + PROJETO DEMO. NENHUM ACESSO AO FIREBASE DE PRODUCAO.
const env=await initializeTestEnvironment({
  projectId:'demo-porto-mobi-testes',
  firestore:{rules:fs.readFileSync(new URL('../firestore.rules',import.meta.url),'utf8')}
});
after(async()=>env.cleanup());
const as=(uid,email=uid+'@example.invalid')=>env.authenticatedContext(uid,{email}).firestore();
const seed=async(fn)=>env.withSecurityRulesDisabled(ctx=>fn(ctx.firestore()));
const trip=(uid='clienteA',status='pendente',driver='')=>({
  clienteUid:uid,codigoCliente:'PMC-0001',codigoReserva:'PMR-0001',nomeCliente:'Cliente Ficticio',
  telefoneCliente:'(51) 99999-1111',localEmbarque:'Rua Teste 100',localDestino:'Rua Teste 200',
  dataViagem:Timestamp.fromDate(new Date(Date.now()+86400000)),dataSolicitacao:Timestamp.now(),
  statusReserva:status,motoristaUid:driver,codigoMotorista:driver?'PMM-001':'',
  observacoes:'',valorViagem:0
});
async function reset({clients=false,driver=false,trips=false,status='pendente',assigned=false}={}){
  await env.clearFirestore();
  await seed(async db=>{
    await setDoc(doc(db,'administradores','admin01'),{ativo:true,funcao:'administrador'});
    if(clients){
      for(const uid of ['clienteA','clienteB'])
        await setDoc(doc(db,'clientes',uid),{uid,nomeCliente:'Cliente Ficticio',codigoCliente:'PMC-0001',numeroCliente:1,
          telefoneCliente:'(51) 99999-1111',email:uid+'@example.invalid',dataCadastro:Timestamp.now()});
    }
    if(driver){
      await setDoc(doc(db,'motoristas','motoristaA'),{nomeMotorista:'Motorista Ficticio',codigoMotorista:'PMM-001',aprovado:true});
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
  const admin=as('admin01'),driver=as('motoristaA'),other=as('motoristaB');
  await assertSucceeds(getDocs(collection(admin,'reservas')));
  await assertSucceeds(updateDoc(doc(admin,'reservas','reservaA'),{
    statusReserva:'oferecida',motoristaUid:'motoristaA',codigoMotorista:'PMM-001',dataAtualizacao:serverTimestamp()
  }));
  await assertSucceeds(getDoc(doc(driver,'reservas','reservaA')));
  await assertFails(getDoc(doc(other,'reservas','reservaA')));
  for(const status of ['confirmada','em_andamento','concluida']){
    await assertSucceeds(updateDoc(doc(driver,'reservas','reservaA'),{statusReserva:status,dataAtualizacao:serverTimestamp()}));
  }
  await assertFails(updateDoc(doc(admin,'reservas','reservaA'),{statusReserva:'pendente',dataAtualizacao:serverTimestamp()}));
  await assertFails(updateDoc(doc(driver,'reservas','reservaA'),{statusReserva:'pendente',dataAtualizacao:serverTimestamp()}));
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
  const db=as('admin01');
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
