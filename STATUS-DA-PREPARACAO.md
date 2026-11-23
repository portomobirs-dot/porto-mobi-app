# Porto Mobi — Preparação da versão 02

**Estado: RASCUNHO. NÃO PUBLICAR / NÃO MESCLAR NA MAIN.**

Esta ramificação contém uma cópia de preparação dos arquivos HTML/JS e manifestos do pacote de Correções 02, sem alteração do projeto original.

## Pendente antes de publicação
- Adicionar os PNG originais: `logo-porto-mobi.png`, `icon-192.png`, `icon-512.png`. No momento, os manifestos e o service worker referenciam ícones PNG ainda ausentes nesta ramificação.
- Acrescentar e validar em emulador as regras de segurança do Firestore; manter as regras atuais de produção inalteradas.
- Testar autenticação, segregação das sessões de Cliente, Motorista e Administrador, criação de reservas, atribuição e conclusão de corridas.
- Verificar a compatibilidade com motorista existente `PMM-001`, contador `contadores/motoristas` já iniciado em 1 e documento de teste de reserva.
- Conferir os três ícones definitivos fornecidos pelo proprietário antes da publicação final.
- Testar instalação dos PWAs separadamente e navegação nos dispositivos.

## Segurança
- **Não executar `firebase deploy` de regras ou Functions a partir deste rascunho.**
- O GitHub Pages está configurado para `main`; esta ramificação não foi publicada.
- Não inserir senhas, credenciais administrativas, tokens ou chaves de conta de serviço no repositório.
