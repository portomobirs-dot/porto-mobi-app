# Porto Mobi Executivo — estrutura e adequação

Plano de trabalho de 25/11/2026. Não representa homologação funcional.

## Clientes
1. Login
2. Cadastro
3. Painel
4. Confirmação do cadastro
5. Solicitação de reserva
6. Revisão da solicitação
7. Status da solicitação (inclui confirmada e recusada)
8. Orçamento
9. Acompanhamento do atendimento
10. Atendimento concluído (a implementar)
11. Histórico
12. Suporte (a implementar)

Painel: Solicitar reserva; Ver solicitação; Acompanhar atendimento; Histórico de atendimentos; Meu cadastro; Suporte ao cliente; Sair do app.

## Motoristas
1. Login
2. Cadastro
3. Painel
4. Confirmação do cadastro
5. Aguardando autorização
5. Solicitações
6. Atendimento da solicitação (layout aprovado; teste funcional pendente)
7. Iniciar trajeto de destino
8. Atendimento concluído
9. Histórico
10. Agenda
11. Suporte

## Administrador
Estrutura detalhada a validar: login, painel, gestão de clientes e autorização de motoristas, gestão de reservas e orçamentos, designação de motorista, acompanhamento, histórico e suporte.

## Regras comuns
- Comunicação operacional exclusivamente dentro do app; substituir chamadas de WhatsApp existentes. GPS permanece separado.
- Clientes: auto-cadastro com acesso imediato e código definitivo automático, sem aprovação manual; distribuição do acesso de instalação pelo administrador. Motoristas: cadastro sujeito à autorização do administrador, código definitivo na aprovação. Limites: 40 clientes, 3 motoristas, 1 administrador. Convite individual como proteção adicional é proposta a validar, não requisito aprovado.
- Firebase Spark; sem serviços pagos, cartão ou Blaze.
- Preservar layouts aprovados, molduras externas e controles; sem mudanças visuais não autorizadas.
- Implementar e testar permissões, comunicação e transições em homologação antes de qualquer publicação. Não alterar Firebase de produção.

## Sequência
Adequar clientes, concluir revisão visual dos motoristas, definir administrador, integrar e testar os três módulos. As alterações funcionais e capturas novas exigem verificação; este documento é o plano, não prova de implementação.
