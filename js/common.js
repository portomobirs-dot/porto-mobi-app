// Configuracao publica do Firebase Web App; a seguranca depende das regras do Firestore.
export const firebaseConfig = {
  apiKey: 'AIzaSyCddZqsk-25Fj_kkKzSU2kmfOYlSz3GmBk',
  authDomain: 'porto-mobi-executivo-2026.firebaseapp.com',
  projectId: 'porto-mobi-executivo-2026',
  storageBucket: 'porto-mobi-executivo-2026.firebasestorage.app',
  messagingSenderId: '500470573196',
  appId: '1:500470573196:web:e3fc2c00e3e8b7f7a933a9'
};
export const padCode=(p,n)=>p+'-'+String(n).padStart(p==='PMM'?3:4,'0');
export const todayLocal=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)};
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const phoneDigits=s=>String(s||'').replace(/\D/g,'');
export function formatPhone(input){let n=phoneDigits(input).slice(0,11);return n.length>6?`(${n.slice(0,2)}) ${n.slice(2,-4)}-${n.slice(-4)}`:n.length>2?`(${n.slice(0,2)}) ${n.slice(2)}`:n;}
export const stamp=x=>x?.toDate?.()?.toLocaleString('pt-BR')||'Não informada';
export function errorText(err){
  const c=err?.code||'';
  if(c.includes('permission-denied'))return 'Acesso negado pelas regras do Firestore. Não altere as regras sem testá-las.';
  if(c.includes('email-already-in-use'))return 'E-mail já cadastrado.';
  if(c.includes('weak-password'))return 'Senha inválida: use pelo menos 6 caracteres.';
  if(c.includes('network-request-failed'))return 'Verifique a conexão de internet.';
  if(c.includes('invalid-credential'))return 'E-mail ou senha incorretos.';
  if(c.includes('too-many-requests'))return 'Muitas tentativas. Tente mais tarde.';
  return 'Não foi possível concluir a operação. '+(c?`(${c})`:'');
}
