# Porto Mobi Executivo — estrutura e adequação

Plano de trabalho de 25/11/2026. Não representa homologação funcional.

## Clientes
1. Login
2. Cadastro
3. Painel
4. Confirmação do cadastro
5. Aguardando autorização / status do cadastro (a implementar)
6. Solicitação de reserva
7. Revisão da solicitação
8. Status da solicitação (inclui confirmada e recusada)
9. Orçamento
10. Acompanhamento do atendimento
11. Atendimento concluído (a implementar)
12. Histórico
13. Suporte (a implementar)

Painel: Solicitar reserva; Ver solicitação; Acompanhar atendimento; Histórico de atendimentos; Meu cadastro; Status do cadastro; Suporte ao cliente; Sair do app.

## Motoristas
1. Login
2. Cadastro
3. Painel
4. Confirmação do cadastro
5. Aguardando autorização
6. Solicitações
7. Atendimento da solicitação (layout aprovado; teste funcional pendente)
8. Iniciar trajeto de destino
9. Atendimento concluído
10. Histórico
11. Agenda
12. Suporte

## Administrador
Estrutura detalhada a validar: login, painel, autorização de clientes e motoristas, gestão de reservas e orçamentos, designação de motorista, acompanhamento, histórico e suporte.

## Regras comuns
- Comunicação operacional exclusivamente dentro do app; substituir chamadas de WhatsApp existentes. GPS permanece separado.
- Cadastro de clientes e motoristas sujeito à autorização do administrador; código definitivo na aprovação. Limites: 40 clientes, 3 motoristas, 1 administrador.
- Firebase Spark; sem serviços pagos, cartão ou Blaze.
- Preservar layouts aprovados, molduras externas e controles; sem mudanças visuais não autorizadas.
- Implementar e testar permissões, comunicação e transições em homologação antes de qualquer publicação. Não alterar Firebase de produção.

## Sequência
Adequar clientes, concluir revisão visual dos motoristas, definir administrador, integrar e testar os três módulos. As alterações funcionais e capturas novas exigem verificação; este documento é o plano, não prova de implementação.
