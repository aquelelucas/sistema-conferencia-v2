# Link de Conferência V2

Sistema de conferência de pedidos usando GitHub Pages + Google Apps Script + Google Sheets.

## Regra de negócio

Este projeto é o **Link de Conferência**. Ele é separado do **Link de Separação**.

O pedido é localizado exclusivamente pelo número da **coluna C (Pedido)** da aba **Lançamentos**. Depois de localizar a linha, o sistema lê o **Separador da coluna D** daquela mesma linha.

A conferência não cria data ou hora e não cria uma nova linha.

### Identificação do conferente

O login lê os nomes da aba **Cadastro**.

A API procura primeiro uma coluna cujo cabeçalho contenha **Conferente**. No layout atual, a coluna oficial é a **D**. Como compatibilidade, se D estiver vazia, a API tenta a coluna A.

A lista é lida diretamente da planilha, sem cache de nomes, para evitar que novos conferentes fiquem ocultos por uma atualização antiga.

### Conferência correta

Ao escolher **Sim**:

- E recebe o conferente logado.
- K recebe **NÃO**.
- N recebe **SIM**.
- F:J e L:M ficam vazias.
- A:D não são alteradas.
- Nenhuma nova linha é criada.

### Conferência com erro

Ao escolher **Não**:

- E recebe o conferente logado.
- F recebe o SKU/produto informado.
- G recebe a quantidade solicitada.
- H recebe a quantidade separada.
- I recebe o tipo de erro.
- J recebe a gravidade.
- K recebe **SIM**.
- L recebe a ação tomada.
- M recebe a observação.
- N recebe **NÃO**.
- A:D não são alteradas.
- Nenhuma nova linha é criada.

### Proteção da gravação

A API usa uma trava do Apps Script durante a gravação e verifica novamente se o pedido já foi conferido antes de escrever. Isso evita duplicidade por duplo clique ou concorrência entre aparelhos.

### Leitura do pedido

O campo de pedido aceita digitação e também funciona com leitor de código de barras que preencha o campo e envie Enter.

Pedidos numéricos são comparados de forma tolerante a zeros à esquerda. Pedidos alfanuméricos são preservados.

### Importante

Após alterar **Code.gs**, é necessário atualizar a implantação do Google Apps Script usada pelo GitHub Pages. Alterar apenas o arquivo no GitHub não publica o backend automaticamente.

O **Link de Separação** é outro projeto e suas regras de data/turno não devem ser copiadas para este sistema.

Versão do código: **2.1.0**