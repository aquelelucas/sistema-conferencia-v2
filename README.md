# Link de Conferência

Sistema de conferência de pedidos usando GitHub Pages + Google Apps Script + Google Sheets.

## Regra de negócio

Este projeto é o **Link de Conferência**. Ele é separado do **Link de Separação**.

O pedido é localizado exclusivamente pelo número da **coluna C (Pedido)** da aba **Lançamentos**. Depois de localizar a linha, o sistema lê o **Separador da coluna D** daquela mesma linha.

A conferência nunca cria data ou hora.

### Conferência correta

Ao escolher **Sim**:

- E recebe o conferente logado.
- K recebe **Não**.
- N recebe **Sim**.
- F:J e L:M ficam vazias.
- A:D não são alteradas.
- Nenhuma nova linha é criada.

### Conferência com erro

Ao escolher **Não**:

- o primeiro SKU ocupa a linha original;
- SKUs adicionais ocupam novas linhas;
- A:D das linhas adicionais recebem os valores originais do pedido;
- E:N recebem os dados da conferência;
- nenhuma data/hora é gerada pela conferência.

### Cadastro

O login usa somente a coluna **D (Conferente)** da aba Cadastro.

A coluna E (Senha) é ignorada e não existe dependência de coluna Ativo.

## Anotações de manutenção

Se aparecer novamente uma data/hora criada pela conferência, o problema está em uma versão antiga do Apps Script ou em outro projeto. O código deste repositório não gera data/hora.

Após alterar Code.gs, é necessário atualizar a implantação do Google Apps Script que está sendo usada pelo GitHub Pages.

Versão do código: **2.0.2**
