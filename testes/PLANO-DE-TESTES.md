# Porto Mobi — plano de validação antes da publicação

**Ambiente:** ramificação `preparacao-correcoes-02`; GitHub Pages continua em `main`.
**Situação:** testes ainda NÃO realizados no Firebase em produção. **Não publique `firestore.rules` sem emulador/testes.**

## Verificação estática concluída no pacote local
- Consistência de IDs dos formulários e scripts: passou.
- Sintaxe dos arquivos JavaScript: passou.
- Integridade do pacote: passou.
- Conferência do cadastro antigo PMM-001: compatível em princípio com `aprovado: true` e `codigoMotorista`.

## Testes obrigatórios com contas fictícias em emulador
1. Conta sem autenticação não consulta reservas nem motoristas.
2. Cliente A cria perfil e reserva; cliente B não consegue ler reserva de A.
3. Cliente comum não modifica valor, status, motorista ou autorização administrativa.
4. Cliente 40 consegue criar perfil PMC-0040; o 41º recebe acesso negado sem alterar os 40 anteriores.
5. Motorista pendente não consegue receber/aceitar corrida e não pode se autoaprovar.
6. Administrador legítimo consegue aprovar motorista 2 e 3, com PMM-002 e PMM-003.
7. Aprovação de quarto motorista falha sem alterar nenhum perfil.
8. Administrador oferece reserva pendente a motorista aprovado; motorista não atribuído não consegue abri-la.
9. Motorista aceita, navega, inicia e conclui; não pode reabrir concluída.
10. Recusa de corrida faz retorno a pendente; administrador pode reatribuir.
11. Cliente, motorista e administrador entram em suas páginas usando contas separadas, sem conflito de sessão.
12. Service worker não armazena respostas do Firestore/Authentication; arquivos de ícones são encontrados.

## Bloqueios explícitos
- PNG originais `logo-porto-mobi.png`, `icon-192.png` e `icon-512.png` pendentes de envio à ramificação.
- Três ícones exclusivos das funções dependem da arte aprovada pelo proprietário.
- `firestore.rules` está nesta ramificação somente para análise; regras atuais do Firebase seguem bloqueando acesso.
- Não foram testados dados reais ou execução de Cloud Functions.

## Antes de mesclar na `main`
- Testes do emulador e validação da compilação de regras.
- Comprovar que apenas os dois perfis autorizados têm acesso administrativo e de motorista, com contas diferentes.
- Conferir links, instalabilidade dos três PWAs e os nomes das funções.
- Preservar o repositório privado original e conferir se não existem segredos.
