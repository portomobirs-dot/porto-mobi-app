# Porto Mobi – Correções técnicas 01

**Projeto original preservado.** Este pacote foi preparado a partir dos arquivos do ZIP `porto-mobi-executixo-main.zip` e das três páginas compartilhadas na conversa. Não foi publicado automaticamente. **Não publique as novas regras ou o site em produção sem testar.**

## Conteúdo

- `index.html`: encaminha a página inicial para a área do cliente.
- `cliente.html` + `js/cliente.js`: cadastro, login, código PMC, reservas sequenciais PMR, histórico.
- `admin.html` + `js/admin.js`: login de administração, reservas, autorização de até três motoristas, atribuição de corridas e link manual para WhatsApp.
- `motorista.html` + `js/motorista.js`: cadastro sujeito a aprovação, login, aceitar/recusar corrida, abrir o Google Maps para embarque/destino e concluir corrida.
- `js/common.js`: configuração web do projeto `porto-mobi-executivo-2026` e auxiliares compartilhados.
- `firestore.rules`: proposta de controle de acesso, códigos/contadores, limite de 40 perfis de clientes e de 3 motoristas aprovados.
- `manifest-*.webmanifest` e `sw.js`: início da instalação separada dos três PWAs; arquivos estáticos compartilhados em cache, sem armazenamento de dados de reservas pelo service worker.
- `logo-porto-mobi.png`, `icon-512.png`, `icon.svg`: **imagens originais, preservadas**; `icon-192.png` foi apenas reduzido do PNG original. Os três manifestos ainda usam esse ícone original compartilhado; **ícones específicos por perfil dependem dos arquivos aprovados pelo proprietário**.

## Principais correções

1. A criação de perfil do cliente é feita em transação com o contador; uma conta recém-criada é apagada se a criação do perfil falhar, quando o Firebase permite.
2. As reservas continuam com códigos sequenciais `PMR-0001`, mas o contador grava também o ID da última reserva criada; as regras verificam a ligação entre o contador e a reserva na mesma transação.
3. O administrador pode ser identificado por custom claim `admin` existente **ou** documento `administradores/{UID}` criado diretamente no Console Firebase. O navegador não pode criar esse documento.
4. A autorização de motoristas é exclusiva do administrador; novos motoristas ficam pendentes até aprovação e recebem código `PMM-001` na aprovação.
5. Cada página usa um nome diferente de Firebase App, para separar a persistência das sessões de Cliente, Motorista e Administrador dentro do mesmo navegador.
6. O driver recebe uma corrida `oferecida`, aceita (`confirmada`) ou recusa (volta a `pendente`); após aceitar pode navegar ao embarque, iniciar (`em_andamento`), navegar ao destino e concluir (`concluida`).
7. O status `recusada` é tratado como histórico no cliente; informações são escapadas antes de renderização HTML.

## O que exige configuração e testes antes de publicar

**1. Conferir projeto:** Firebase `porto-mobi-executivo-2026`; Authentication por e-mail/senha ativado; domínio `portomobirs-dot.github.io` autorizado. O `firebaseConfig` Web não é credencial de administrador, mas as regras são indispensáveis.

**2. Administrador inicial (uma única vez):** No Firebase Authentication, obtenha o UID da conta de administrador que você controla. Em Firestore Database > Dados, crie a coleção `administradores`, documento cujo ID seja exatamente esse UID e o campo `ativo` booleano `true`. Faça isso **no Console Firebase com acesso de proprietário**, nunca num formulário público e nunca inserindo senhas no código. Se a claim `admin: true` já existir, o documento é opcional. A conta do motorista deve ter e-mail diferente da conta de administrador.

**3. BACKUP:** antes de trocar regras, copie a regra atual para um local seguro e faça backup dos dados do Firestore, se houver dados reais. Não apague o projeto Firebase adicional sem auditoria.

**4. TESTE AS REGRAS NO EMULADOR/PLAYGROUND ANTES DE PUBLICAR:** arquivo `firestore.rules` é uma proposta técnica não validada contra o banco real. Teste: cliente não lê reservas de outro; cliente não altera status/valores/papéis; motorista não se autoaprova; motorista não vê corridas de outro; conta comum não é administrador; admin consegue aprovar e atribuir; criação do 40º perfil de cliente é permitida, mas do 41º é negada; aprovação do 4º motorista é negada. Execute também o fluxo completo com contas de teste. O simulador de regras isolado pode não reproduzir uma transação com `getAfter`; prefira o emulador para testes transacionais.

**5. Compatibilidade dos contadores:** o código original tinha contadores `{ultimo: N}`. Os novos fluxos passam a salvar mais campos, por exemplo `{ultimo: N, ultimoUid: UID}` ou `{ultimo: N, ultimoReservaId: ID, ultimoClienteUid: UID}`. **Não zere esses contadores** se já houver cadastros ou reservas. A estrutura existente pode continuar e ser atualizada na próxima operação, mas deve ser verificada.

**6. Publicação estática:** depois dos testes, suba o conteúdo desta pasta (os arquivos, não o ZIP) na raiz do repositório público `portomobirs-dot/porto-mobi-app`, preservando a subpasta `js`. O repositório privado original fica intacto. GitHub Pages já foi configurado para `main / (root)`, conforme capturas.

URLs planejadas para a hospedagem pública:
- Cliente: `https://portomobirs-dot.github.io/porto-mobi-app/cliente.html`
- Motorista: `https://portomobirs-dot.github.io/porto-mobi-app/motorista.html`
- Administrador: `https://portomobirs-dot.github.io/porto-mobi-app/admin.html`
- Entrada: `https://portomobirs-dot.github.io/porto-mobi-app/` (redireciona ao Cliente).

**7. Ícones e instalação:** cada manifesto possui ID e página inicial diferentes; os três usam o mesmo ícone original temporariamente. Substitua pelos três ícones aprovados quando forem fornecidos, antes de considerar o acabamento visual final.

## Limitações importantes

- **O limite de 40 clientes é um limite de documentos de perfil no Firestore**, não um bloqueio da criação de novas contas no serviço Firebase Authentication; da mesma forma, três é o limite de motoristas aprovados, não necessariamente o total de contas Auth registradas. Impedir rigorosamente todo cadastro Auth acima de 44 requer controle de identidade do lado servidor ou processo administrativo adicional.
- Não há notificação automática gratuita de WhatsApp: o administrador **clica** para abrir uma mensagem pronta. Não há push em segundo plano quando o app do motorista estiver fechado.
- Google Maps é aberto pelo link com o destino, usando a posição atual quando o Google Maps a disponibiliza. Não há rastreamento GPS em tempo real no Firestore, cálculo de preço ou comprovante de viagem.
- O formulário e regras não foram testados contra o Firebase de produção, e o emulador de segurança não estava disponível neste ambiente de preparação.
- Não há garantias de serviço gratuito ilimitado; Firebase Spark e GitHub Pages têm limites e políticas próprios.
- A troca de regras pode bloquear versões antigas do cliente que não enviem os campos adicionais; não aplique as regras antes da atualização e dos testes.

## Segurança

Nunca coloque senhas pessoais, chaves de conta de serviço (`serviceAccount*.json`) ou segredos do GitHub em repositórios públicos. As regras usam `admin` por claim ou documento criado pelo proprietário; não confiam em um campo `role` fornecido pelo usuário. Regras amplas do tipo `allow read, write: if true` não devem ser utilizadas.


## Compatibilidade com o motorista original PMM-001 (23/11/2026)

Foi constatado no Firestore um documento antigo de motorista com `aprovado: true` e `codigoMotorista: "PMM-001"`. **Não recrie, exclua ou renumere esse cadastro.**

- `js/motorista.js` e `js/admin.js` agora reconhecem tanto `situacao: "ativo"` quanto o antigo `aprovado: true`.
- Os nomes antigos `telefone`, `modeloVeiculo`, `placaVeiculo` e `corVeiculo` são aceitos na apresentação; os novos cadastros continuam usando os nomes novos.
- A numeração PMM permanece em três dígitos. Os próximos motoristas serão `PMM-002` e `PMM-003`. O total máximo continua sendo 3.
- **Migração obrigatória antes de autorizar outro motorista:** no Console Firebase, crie a coleção `contadores`, documento `motoristas`, campo `ultimo` numérico `1` e campo `ultimoUid` string com o UID do motorista antigo (copiado do próprio documento). É uma operação administrativa no Console, não é feita pelo navegador do cliente. Não publique ou teste novas aprovações antes dessa inicialização.
- O documento `reservas/TESTE-ESTRUTURA` é um exemplo vazio: não é uma reserva operacional. Não exclua documentos sem backup.
- Estas regras são **propostas não testadas no emulador** e não devem ser publicadas sem os testes de segurança descritos acima. As regras atuais `allow read, write: if false` permanecem protegendo o projeto até a validação.