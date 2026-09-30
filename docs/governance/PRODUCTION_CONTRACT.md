# Contrato de produção

Este documento define comportamentos que o software deve preservar. Ele é mais importante do que preferências visuais ou conveniências de implementação.

## 1. Fonte da verdade

- Telemetria industrial vem do Rapid SCADA e de canais homologados.
- Cadastro, permissões e configuração pertencem ao banco do produto.
- O frontend não fabrica estado, telemetria, limite, nominal, alarme ou capability.
- Dado ausente/desconhecido = `N/D`/neutro.

## 2. Estado e cor

- Verde só pode representar uma condição positiva explicitamente conhecida pelo contrato.
- Amarelo/alerta só pode representar alerta explicitamente conhecido.
- Vermelho só pode representar falha/offline/condição crítica explicitamente conhecida.
- Telemetria existente não é sinônimo de "saudável".
- Um valor numérico disponível não deve ficar verde apenas por existir.
- Estado desconhecido não deve assumir cor operacional forte.
- Mudanças de tema/layout não podem alterar a semântica operacional das cores.

## 3. Cards

Vertical, Compacto e Lista são superfícies independentes.

Todos devem exibir a mesma verdade industrial, mas podem ter layouts diferentes. Uma mudança no Vertical não autoriza modificar o Compacto e vice-versa.

## 4. Comandos

Um comando industrial só pode ficar habilitado quando todos os gates aplicáveis estiverem satisfeitos:

- equipamento habilitado;
- Controller Pack correto;
- pack com lifecycle compatível;
- capability da ação habilitada;
- contrato de comando presente;
- firmware homologado;
- binding real coerente;
- transporte correto;
- executor homologado;
- permissivos/intertravamentos aplicáveis;
- feedback definido;
- operador autorizado e confirmação explícita.

## 5. Aceito não é confirmado

Receber resposta Modbus de escrita/FC16 significa somente que a escrita foi aceita no protocolo.

Para START/STOP/mudança de modo:

- `accepted`: escrita/protocolo aceitou;
- `confirmed`: feedback físico/telemetria atingiu o estado esperado;
- `failed`: feedback não confirmou dentro do timeout ou houve rejeição.

A UI não pode apresentar sucesso operacional quando só existe `accepted`.

## 6. Feedback transitório

Mensagens informativas de comando na superfície do card devem desaparecer automaticamente após aproximadamente 2 segundos.

Erros, falhas de confirmação e alarmes reais não devem depender de uma mensagem efêmera; precisam permanecer disponíveis no histórico/alarme/auditoria apropriado.

## 7. Modos OFF/MAN/AUTO/TEST

Leitura do modo e escrita do modo são capacidades diferentes.

Ter `controller_mode_raw` legível não autoriza escrever modo. Para cada modelo/firmware, OFF/MAN/AUTO/TEST devem ser homologados individualmente com mecanismo, valor, permissivos e feedback.

## 8. Deploy e drift

Cada instalação deve informar o SHA exato implantado.

Antes de diagnosticar comportamento de produção, comparar:

- SHA da VM;
- SHA da `main`/release esperada;
- configuração relevante;
- Controller Pack e firmware inventariados.

Se não coincidir, registrar drift antes de corrigir código.

## 9. Definition of Done industrial

"CI verde" não basta. Mudança industrial só está concluída quando teste automatizado + evidência de ambiente aplicável + rollback + atualização do estado do projeto estiverem registrados.
