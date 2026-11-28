// Configuracao publica do Firebase Web App; a seguranca depende das regras do Firestore.
export const firebaseConfig = {
  apiKey: "AIzaSyAGCmm6FmyPHrjsWEb4jqPXH32N7y7HLDU",
  authDomain: "porto-mobi---executivo.firebaseapp.com",
  projectId: "porto-mobi---executivo",
  storageBucket: "porto-mobi---executivo.firebasestorage.app",
  messagingSenderId: "1017797508653",
  appId: "1:1017797508653:web:3181a474379d19a58302a4"
};
export const padCode=(p,n)=>p+'-'+String(n).padStart(p==='PMM'?3:p==='PMR'?6:4,'0');
// Valores monetarios em reais, arredondados a centavos somente no total.
export const moneyBRL=n=>Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export function calculateFare(p){
 const keys=['kmPercurso','tempoPercursoMin','tarifaBase','valorPorKm','valorPorTempo','valorExtra'];
 for(const key of keys){if(typeof p[key]!=='number'||!Number.isFinite(p[key])||p[key]<0)throw new Error('Valor de tarifa inválido: '+key);}
 if(!Number.isInteger(p.tempoPercursoMin))throw new Error('Informe o tempo em minutos inteiros.');
 const total=p.tarifaBase+p.kmPercurso*p.valorPorKm+p.tempoPercursoMin*p.valorPorTempo+p.valorExtra;
 return Math.round((total+Number.EPSILON)*100)/100;
}
export const todayLocal=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)};
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const phoneDigits=s=>String(s||'').replace(/\D/g,'');
export function formatPhone(input){let n=phoneDigits(input).slice(0,11);return n.length>6?`(${n.slice(0,2)}) ${n.slice(2,-4)}-${n.slice(-4)}`:n.length>2?`(${n.slice(0,2)}) ${n.slice(2)}`:n;}
export const stamp=x=>x?.toDate?.()?.toLocaleString('pt-BR')||'Não informada';
export function errorText(err){
  const c=err?.code||'';
  if(c === 'limite-clientes')return 'Limite de 9.999 clientes atingido. Entre em contato com a administração.';
  if(c.includes('permission-denied'))return 'Acesso negado pelas regras do Firestore. Não altere as regras sem testá-las.';
  if(c.includes('email-already-in-use'))return 'E-mail já cadastrado.';
  if(c.includes('weak-password'))return 'Senha inválida: use pelo menos 6 caracteres.';
  if(c.includes('network-request-failed'))return 'Verifique a conexão de internet.';
  if(c.includes('invalid-credential'))return 'E-mail ou senha incorretos.';
  if(c.includes('too-many-requests'))return 'Muitas tentativas. Tente mais tarde.';
  return 'Não foi possível concluir a operação. '+(c?`(${c})`:'');
}

export function offerWhatsApp(phone,message){
 try{
 const digits=String(phone||'').replace(/\D/g,'');
 const number=digits.length===10||digits.length===11?'55'+digits:digits;
 if(!/^55\d{10,11}$/.test(number))return;
 let panel=document.getElementById('pmWhatsAppQueue');
 if(!panel){panel=document.createElement('aside');panel.id='pmWhatsAppQueue';panel.setAttribute('aria-label','Mensagens WhatsApp pendentes');panel.style.cssText='position:fixed;bottom:12px;right:12px;left:12px;max-width:460px;margin:auto;z-index:10000;background:#080808;color:white;border:2px solid #25D366;border-radius:12px;padding:12px;max-height:40vh;overflow:auto';document.body.append(panel);}
 const row=document.createElement('div');row.style.cssText='margin:6px 0;display:flex;gap:8px;align-items:center;flex-wrap:wrap';
 const label=document.createElement('p');label.textContent=message;label.style.cssText='white-space:pre-wrap;font-size:13px;width:100%;margin:0';
 const link=document.createElement('a');link.href='https://wa.me/'+number+'?text='+encodeURIComponent(message);link.target='_blank';link.rel='noopener noreferrer';link.textContent='ABRIR WHATSAPP';link.style.cssText='background:#218638;color:white;padding:10px;border-radius:6px;font-weight:bold;text-decoration:none';
 const close=document.createElement('button');close.type='button';close.textContent='DISPENSAR';close.style.cssText='width:auto;margin:0;padding:8px';close.onclick=()=>{row.remove();if(!panel.children.length)panel.remove()};
 row.append(label,link,close);panel.append(row);
 }catch(e){console.warn('Não foi possível preparar aviso WhatsApp',e);}
}
