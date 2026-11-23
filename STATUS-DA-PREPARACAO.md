# Porto Mobi — Preparação da versão 02

**Estado: RASCUNHO. NÃO PUBLICAR / NÃO MESCLAR NA MAIN.**

Esta ramificação contém uma cópia de preparação dos arquivos HTML/JS e manifestos do pacote de Correções 02, sem alteração do projeto original.

## Pendente antes de publicação
- Adicionar os PNG originais: `logo-porto-mobi.png`, `icon-192.png`, `icon-512.png`. No momento, os manifestos e o service worker referenciam ícones PNG ainda ausentes nesta ramificação.
- Arquivo `firestore.rules` adicionado a ESTA ramificação apenas para revisão. **Compilação e testes no emulador ainda pendentes**; manter regras do Firebase de produção inalteradas.
- Testar autenticação, segregação das sessões de Cliente, Motorista e Administrador, criação de reservas, atribuição e conclusão de corridas.
- Verificar a compatibilidade com motorista existente `PMM-001`, contador `contadores/motoristas` já iniciado em 1 e documento de teste de reserva.
- Conferir os três ícones definitivos fornecidos pelo proprietário antes da publicação final.
- Testar instalação dos PWAs separadamente e navegação nos dispositivos.

## Segurança
- **Não executar `firebase deploy` de regras ou Functions a partir deste rascunho.**
- O GitHub Pages está configurado para `main`; esta ramificação não foi publicada.
- Não inserir senhas, credenciais administrativas, tokens ou chaves de conta de serviço no repositório.

## Evidências de revisão (23/11/2026)
- As imagens de 512px e o logotipo são byte a byte idênticos aos arquivos do projeto original local; o PNG de 192px é uma redução derivada do ícone original.
- `firestore.rules` contém suporte ao cadastro antigo de motorista `aprovado: true` e à numeração `PMM-001`.
- O plano de casos obrigatórios está em `testes/PLANO-DE-TESTES.md`.
- Em `main` permanece somente o README; **não foi efetuada publicação do sistema corrigido**.

## Testes automatizados adicionados
- `firebase.json` aponta somente para o arquivo de regras da ramificação de testes.
- `package.json` tem comando `npm run test:security` usando o projeto **fictício** `demo-porto-mobi-testes`.
- `testes/seguranca-firestore.test.mjs` simula cliente, administrador, motorista aprovado legado e motorista pendente.
- `.github/workflows/testar-seguranca.yml` usa o GitHub Actions (Linux público) para executar Firebase Emulator no commit dessa ramificação.
- **Importante:** criar os testes não comprova sucesso: verificar no GitHub Actions se compilaram e passaram antes de alterar Firestore ou mesclar na main.

## Capacidade de clientes — ampliada em 23/11/2026
- Aplicativo do cliente: até **40 perfis** numerados de `PMC-0001` a `PMC-0040`.
- Regras propostas do Firestore: limite de contador e número do perfil atualizado para 40.
- Testes do emulador: cadastra o 40º perfil e rejeita o 41º; resultado de execução ainda precisa ser conferido.
- Motoristas continuam limitados a três aprovados (`PMM-001` a `PMM-003`), e há uma conta administrativa.
- O limite é sobre **perfis Firestore**, não sobre contas no Authentication. O número sequencial não é reutilizado após exclusões.
