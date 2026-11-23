# Porto Mobi — revisão visual (dados fictícios)

As dezesseis imagens abaixo são capturas **das páginas HTML do sistema** em um navegador com tamanho de celular. O teste bloqueia conexões externas e **não usa dados reais nem faz login no Firebase**. Não são telas do aplicativo em produção.

Se alguma imagem não aparecer, consulte o [workflow de capturas](https://github.com/portomobirs-dot/porto-mobi-app/actions/workflows/capturas-visuais.yml) para conferir se a última execução terminou corretamente.

## Cliente

### Login
![Cliente - Login](./capturas-mobile/01-cliente-login.png)

### Cadastro — preencher e revisar
![Cliente - Cadastro](./capturas-mobile/02-cliente-cadastro.png)

### Confirmação de cadastro — concluir ou corrigir
![Cliente - Confirmação de cadastro](./capturas-mobile/10-cliente-confirmacao-cadastro.png)

### Solicitar reserva
![Cliente - Reserva](./capturas-mobile/03-cliente-reserva.png)

### Confirmar solicitação — enviar ou corrigir
![Cliente - Confirmação de reserva](./capturas-mobile/13-cliente-confirmacao-reserva.png)

### Acompanhamento de reservas
![Cliente - Acompanhamento](./capturas-mobile/04-cliente-acompanhamento.png)

## Motorista

### Login
![Motorista - Login](./capturas-mobile/05-motorista-login.png)

### Cadastro — preencher e revisar
![Motorista - Cadastro](./capturas-mobile/06-motorista-cadastro.png)

### Revisão — enviar cadastro para aprovação ou corrigir
![Motorista - Confirmação de cadastro](./capturas-mobile/11-motorista-confirmacao-cadastro.png)

### Autorização pendente — verificar aprovação ou sair
![Motorista - Aguardando aprovação](./capturas-mobile/12-motorista-aguardando-aprovacao.png)

### Corridas
![Motorista - Corridas](./capturas-mobile/07-motorista-corridas.png)

### Atendimento da Reserva: saudação ao Motorista, dados do Cliente e botão Iniciar Atendimento
![Motorista - Atendimento da Reserva](./capturas-mobile/16-motorista-atendimento-da-reserva.png)

### Tela Iniciar Atendimento: avisos pelo WhatsApp e GPS ao embarque
![Motorista - Início de atendimento](./capturas-mobile/14-motorista-inicio-atendimento.png)

### Atendimento em andamento: GPS ao destino e conclusão
![Motorista - Conclusão de atendimento](./capturas-mobile/15-motorista-conclusao-atendimento.png)

## Administração

### Login
![Administrador - Login](./capturas-mobile/08-administrador-login.png)

### Painel administrativo
![Administrador - Painel](./capturas-mobile/09-administrador-painel.png)

---

**Estado:** apenas revisão de aparência e comandos exibidos; cliques, autenticação, localização, WhatsApp e instalação PWA devem ser validados separadamente. Não mesclar esta ramificação com a principal antes da homologação.
