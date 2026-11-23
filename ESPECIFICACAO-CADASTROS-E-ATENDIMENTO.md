# Porto Mobi — especificação aprovada de cadastros e atendimentos

Fonte: especificação fornecida diretamente pelo responsável, 23 de novembro de 2026. **Não substituir esta lista por um cadastro simplificado.** Esta é a referência para telas e aceitação dos testes.

## Login do Cliente
- Mensagem: **Olá Bem Vindo!**
- Login: e-mail
- Senha e controle Mostrar/Ocultar
- Botão **Ir para o Cadastro**
- Recuperação de senha por e-mail é uma funcionalidade complementar

## Cadastro do Cliente
- Código do Cliente **PMC-0000** como máscara, número atribuído automaticamente sem edição (primeiro código: PMC-0001)
- Data do Cadastro (automática)
- Nome do Cliente
- Telefone do Cliente com máscara **(99) 99999-9999**
- E-mail: login do Cliente
- Senha de no mínimo 6 caracteres, Mostrar/Ocultar
- Confirmação da senha, Mostrar/Ocultar
- Botão **Revisar meu Cadastro**, abrindo a revisão dos dados
- Na revisão, **Voltar para o Cadastro** e **Cadastrar**
- Após entrar: **Visualizar a Reserva a ser atendida**, **Histórico de Atendimentos**, **Sair do App**
- Botão de acesso à Solicitação de Reserva

## Solicitação de Reserva
- Saudação **Olá, [Nome do Cliente]**
- Código **PMR-000000** como máscara; número automático sem edição ao enviar (primeiro código: PMR-000001)
- Data da Reserva (automática)
- Local do embarque e Local do destino
- Data de viagem no calendário; horário no relógio
- Observações
- Botão **Revisar Solicitação** exibe os dados do Cliente e da Reserva
- **Voltar** para corrigir e **Solicitar** para confirmar envio
- Número de passageiros é campo complementar conforme o modelo visual enviado

## Login do Motorista
- Mensagem: **Olá Bem Vindo!**
- Login: e-mail
- Senha e controle Mostrar/Ocultar
- Botão **Ir para o Cadastro**
- Recuperação de senha por e-mail é funcionalidade complementar

## Cadastro do Motorista
- Código **PMM-000** como máscara; número definitivo atribuído pela administração ao aprovar (primeiro código: PMM-001)
- Data do Cadastro (automática)
- Nome do Motorista
- Telefone do Motorista com máscara **(99) 99999-9999**
- E-mail: login do Motorista
- Senha de no mínimo 6 caracteres, Mostrar/Ocultar
- Confirmação da senha, Mostrar/Ocultar
- **Veículo: Marca/Modelo**
- **Placa do Veículo: AAA-9A99**
- **Cor do Veículo**
- Botão **Revisar meu Cadastro**, abrindo revisão com todos os dados não sigilosos
- Na revisão, **Voltar para o Cadastro** e **Cadastrar**
- Cadastro fica pendente até aprovação administrativa; limite de 3 motoristas
- Após entrar com aprovação: **Visualizar a Reserva a ser atendida**, **Histórico de Atendimentos**, **Iniciar Atendimento**, **Sair do App**

## Tela Atendimento da Reserva (etapa anterior)
- Saudação **Olá, [Nome do Motorista]**
- Nome do Cliente
- Dados da Reserva
- Botão **Iniciar Atendimento**, que abre uma tela separada com os comandos da corrida
- Botão **Sair do App**

## Tela Iniciar Atendimento (segunda etapa)
- Nome do Cliente
- Dados da Reserva
- Botão **Motorista à caminho**: prepara aviso ao Cliente no WhatsApp e abre GPS para o embarque
- Botão **Motorista à disposição**: prepara aviso ao Cliente no WhatsApp
- Botão **Iniciar Atendimento**: registra início e abre GPS para o destino
- Botão **Concluir Atendimento**: registra conclusão e inclui no histórico
- Botão **Sair do App**
- A rota de GPS deve partir da localização atual determinada pelo Google Maps, respeitando a permissão do aparelho

## Limitações técnicas e segurança
- Links gratuitos do WhatsApp **não enviam mensagens automaticamente**: o motorista precisa confirmar o envio. Evitar prometer envio sem interação ou serviço pago. A abertura simultânea de WhatsApp e Google Maps pode ser bloqueada pelo navegador; manter botões de GPS como alternativa.
- Todos os códigos reais devem ser únicos e controlados por transação e regras do Firestore. As máscaras `PMC-0000`, `PMR-000000`, `PMM-000` não são cadastros reais.
- Datas oficiais gravadas usando `serverTimestamp()`; a data apresentada no formulário é uma referência visual do dia no aparelho.
- Não armazenar senhas em documentos Firestore. Credenciais ficam no Firebase Authentication.
- Não mesclar na `main`, publicar via Pages nem atualizar regras de produção antes de homologação.

## Cálculo de Reserva — Painel do Administrador
- Dados do Cliente e Dados da Reserva.
- **KM do percurso** e **Tempo do percurso**, informados pela administração (estimativas manuais nesta versão).
- **Tarifa Base**, **Valor por km**, **Valor por tempo (por minuto)** e **Valor extra**, sem preços pré-configurados.
- **Valor total = tarifa base + (KM × valor/km) + (minutos × valor/min) + valor extra**, arredondado a centavos.
- O Administrador envia orçamento ao Cliente. O Cliente visualiza Dados da Reserva, Valor da Reserva, Motorista Designado (quando houver) e os botões **Aceitar Orçamento** / **Recusar Orçamento**.
- Após o aceite, o Administrador escolhe o Motorista Designado e usa **Confirmar** para oferecer a corrida; **Recusar** encerra a reserva administrativamente.

## Quatro históricos obrigatórios do Administrador
1. **Orçamentos aceitos pelo Cliente**: cada resposta inclui reserva (PMR), cliente, número da proposta, valor total e data.
2. **Orçamentos recusados pelo Cliente**: registrar cada recusa, inclusive quando a mesma reserva for orçada novamente.
3. **Atendimentos concluídos**: reserva, cliente, motorista, valor e data de conclusão. Uma reserva concluída é terminal.
4. **Recusas dos Motoristas**: cada recusa inclui reserva (PMR), Cliente, Motorista, número da recusa e data, mesmo quando a corrida for oferecida novamente.

### Persistência e segurança desses históricos
- Eventos de aceite/recusa são registrados em `historicoOrcamentos` com ID formado pela reserva + número da proposta; recusas do motorista ficam em `historicoRecusasMotoristas` com ID reserva + número da recusa. Esses registros **não podem ser editados nem excluídos pelo aplicativo**.
- Registrar a resposta do Cliente e o histórico em uma operação atômica; fazer o mesmo para a recusa do Motorista. O histórico de conclusões é extraído das reservas concluídas, com `dataConclusao` marcada pelo servidor.
- Somente o Administrador lê as coleções de históricos; Cliente e Motorista só executam as transições permitidas em suas reservas.
- A primeira demonstração offline no tablet **não persiste dados após reinício**. No aplicativo real, a persistência depende de testar e implantar as regras novas do Firestore; a produção permanece inalterada.
