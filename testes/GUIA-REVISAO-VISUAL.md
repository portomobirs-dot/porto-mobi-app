# Como revisar visualmente as telas no celular

As treze imagens são capturas das páginas HTML reais, feitas em um navegador Chromium isolado, na resolução de um celular Android. Elas **não contêm dados reais**. O navegador bloqueia todas as chamadas externas e não acessa o Firebase da empresa.

## Abrir as capturas
1. Acesse a aba [Actions](https://github.com/portomobirs-dot/porto-mobi-app/actions/workflows/capturas-visuais.yml).
2. Abra o último processo **Capturas visuais - Porto Mobi** com a marca verde.
3. Procure **Artifacts**, selecione **porto-mobi-capturas-mobile** e baixe o ZIP no celular (em alguns aparelhos, é necessário abrir o GitHub pelo Chrome em modo site para computador).
4. Extraia o ZIP e abra as imagens PNG; veja os títulos e a legibilidade dos campos.

## Arquivos gerados
- `01-cliente-login.png`
- `02-cliente-cadastro.png`
- `03-cliente-reserva.png`
- `04-cliente-acompanhamento.png`
- `05-motorista-login.png`
- `06-motorista-cadastro.png`
- `07-motorista-corridas.png`
- `08-administrador-login.png`
- `09-administrador-painel.png`
- `10-cliente-confirmacao-cadastro.png`: ações de confirmar e corrigir
- `11-motorista-confirmacao-cadastro.png`: ações de enviar para aprovação e corrigir
- `12-motorista-aguardando-aprovacao.png`: ações de consultar autorização e sair
- `13-cliente-confirmacao-reserva.png`: ações de enviar e corrigir solicitação

## Limitação importante
Essas imagens verificam a **aparência**, não o clique, o login, o GPS, o WhatsApp ou a persistência. O verdadeiro teste de instalação PWA e de login com as regras ativadas requer um ambiente seguro de homologação, separado do banco real, antes de liberar o uso público.

A ramificação `main` e o Firebase em produção não são alterados por esse processo.

## Correção do ambiente de testes (23/11/2026)
- A primeira execução falhou em **Instalar navegador de testes**, antes de gerar PNGs.
- O fluxo agora usa a imagem oficial `mcr.microsoft.com/playwright:v1.57.0-noble`, com Chromium e dependências prontas, evitando `npx playwright install --with-deps`.
- O servidor de pré-visualização agora usa o módulo `node:http` embutido, sem Python.
- **Não afirmar sucesso até a execução mais recente ficar verde e o artefato ser criado.**
