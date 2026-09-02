# Arquitetura de conexões de campo

## Identidade de comunicação

Cada gerador mantém campos independentes:

- **nome**: identificação exibida ao operador;
- **tag**: identidade estável do ativo;
- **transporte**: forma como os dados chegam;
- **host/IP**: destino roteável para conexões iniciadas pelo servidor;
- **porta TCP**: porta pública de entrada ou porta do destino;
- **Unit ID Modbus**: endereço lógico da controladora (1–247);
- **identificador de telemetria**: vínculo interno, não configurado no modem.

Porta TCP e Unit ID não são equivalentes. Vários Units podem compartilhar uma
porta quando o modem/gateway carrega um barramento RS-485; portas distintas
podem também apontar para controladoras com o mesmo Unit ID.

## Transportes aceitos

| Cenário | Transporte | Host | Porta | Unit ID |
|---|---|---|---|---|
| modem/DTU conecta ao servidor | `reverse_tcp` | vazio | porta pública exclusiva ou compartilhada validada | endereço da controladora |
| controladora acessível pela VPN | `modbus_tcp_direct` | IP da controladora | normalmente 502 | Unit ID configurado |
| conversor Ethernet–RS485 pela VPN | `rtu_over_tcp` | IP do gateway | porta do gateway | endereço no barramento |
| USB/serial local | `modbus_rtu_serial` | dispositivo serial | não se aplica | endereço no barramento |

Protocolos como MQTT, SNMP, IEC 60870-5-104, OPC UA e APIs de nuvem não devem
ser tratados como Modbus. Cada um exige adaptador, autenticação, limites e
homologação próprios antes de entrar em produção.

## PPTP/VPN e descoberta

O IP entregue ao modem pela VPN (por exemplo `10.50.10.1`) não revela
automaticamente o IP LAN da controladora. Para alcançar uma rede como
`10.40.10.0/24`, o servidor precisa possuir rota até essa rede pelo túnel e o
modem deve encaminhar o tráfego entre VPN e LAN.

A descoberta implementada:

1. aceita somente IPv4 privado;
2. limita a consulta a no máximo 254 hosts;
3. testa uma única porta por execução, com concorrência e timeout limitados;
4. somente abre e fecha TCP;
5. não envia função Modbus, não lê registradores e nunca escreve comandos;
6. exige administrador, confirmação explícita e gera auditoria.

Uma porta 502 aberta é um **candidato**, não comprova fabricante ou modelo.
Depois de selecionar o IP, a identificação de COMAP/DSE depende do Controller
Pack homologado e de uma leitura segura específica daquele modelo.

## Reconfiguração

Para cadastro ainda não provisionado, os campos podem ser corrigidos
diretamente. Para equipamento provisionado, o fluxo é transacional:

1. preserva a configuração anterior;
2. deprovisiona mantendo histórico;
3. altera transporte, host, porta e Unit ID;
4. reprovisiona;
5. se falhar, restaura e reprovisiona a configuração anterior;
6. se a restauração também falhar, mantém o erro explícito para intervenção,
   sem fingir que o gerador está operacional.

Nome e unidade são dados cadastrais e não exigem reinício da comunicação.
