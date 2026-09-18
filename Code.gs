/**
 * LINK DE CONFERÊNCIA
 * API responsável pela conferência dos pedidos.
 *
 * REGRA PRINCIPAL:
 * - Pedido é localizado exclusivamente pela coluna C da aba Lançamentos.
 * - O separador é lido da coluna D da mesma linha encontrada.
 * - A:D pertencem ao lançamento original e NÃO são alteradas pela conferência.
 * - A conferência preenche E:N.
 * - Esta API NÃO cria data/hora de conferência.
 *
 * O Link de Separação é outro projeto e não deve ter suas regras
 * de data/hora copiadas para este sistema.
 */

const SPREADSHEET_ID = '16l4PoccxeI_masCzuQh1vHfJV5z3A-yvz80A2yaubRk';
const ABA_LANCAMENTOS = 'Lançamentos';
const ABA_CADASTRO = 'Cadastro';

const CACHE_PREFIX = 'CONFERENCIA_V2_';
const CACHE_CONFERENTES = CACHE_PREFIX + 'CONFERENTES';
const SESSION_SECONDS = 6 * 60 * 60;
const CONFERENTES_CACHE_SECONDS = 300;
const VERSAO_API = '2.0.2';

function doGet() {
  return jsonResponse({
    ok: true,
    sistema: 'API Link de Conferência V2',
    versao: VERSAO_API
  });
}

function doPost(e) {
  try {
    const body = parseBody_(e);
    const acao = String(body.acao || '').trim();

    switch (acao) {
      case 'listarConferentes':
        return jsonResponse(listarConferentes_());
      case 'login':
        return jsonResponse(login_(body));
      case 'consultarPedido':
        return jsonResponse(consultarPedido_(body));
      case 'registrarSemErro':
        return jsonResponse(registrarSemErro_(body));
      case 'registrarComErro':
        return jsonResponse(registrarComErro_(body));
      case 'validarSessao':
        return jsonResponse(validarSessao_(body));
      case 'logout':
        return jsonResponse(logout_(body));
      default:
        return jsonResponse({ ok: false, erro: 'Ação não reconhecida.' });
    }
  } catch (erro) {
    console.error(erro);
    return jsonResponse({
      ok: false,
      erro: erro && erro.message ? erro.message : 'Erro interno da API.'
    });
  }
}

/**
 * Lista somente os nomes da coluna D da aba Cadastro.
 * A coluna E (Senha) e qualquer coluna Ativo são ignoradas.
 * O resultado fica em cache por 5 minutos para reduzir leituras.
 */
function listarConferentes_() {
  const cache = CacheService.getScriptCache();
  const cacheado = cache.get(CACHE_CONFERENTES);

  if (cacheado) {
    try {
      return JSON.parse(cacheado);
    } catch (erro) {
      // Cache inválido: segue para uma leitura nova.
    }
  }

  const aba = getSheet_(ABA_CADASTRO);
  const ultimaLinha = aba.getLastRow();

  if (ultimaLinha < 2) {
    const vazio = { ok: true, conferentes: [] };
    cache.put(CACHE_CONFERENTES, JSON.stringify(vazio), CONFERENTES_CACHE_SECONDS);
    return vazio;
  }

  const valores = aba.getRange(2, 4, ultimaLinha - 1, 1).getDisplayValues();

  const conferentes = valores
    .map(linha => String(linha[0]).trim())
    .filter(Boolean);

  const unicos = [...new Set(conferentes)].sort((a, b) =>
    a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
  );

  const resultado = { ok: true, conferentes: unicos };

  cache.put(
    CACHE_CONFERENTES,
    JSON.stringify(resultado),
    CONFERENTES_CACHE_SECONDS
  );

  return resultado;
}

function login_(body) {
  const conferente = normalizarTexto_(body.conferente);

  if (!conferente) {
    return { ok: false, erro: 'Selecione um conferente.' };
  }

  const conferentes = listarConferentes_().conferentes;
  const nomeOficial = conferentes.find(nome =>
    nome.toLowerCase() === conferente.toLowerCase()
  );

  if (!nomeOficial) {
    return { ok: false, erro: 'Conferente não encontrado no cadastro.' };
  }

  const token = Utilities.getUuid();

  CacheService.getScriptCache().put(
    CACHE_PREFIX + token,
    nomeOficial,
    SESSION_SECONDS
  );

  return {
    ok: true,
    sessao: token,
    conferente: nomeOficial,
    expiraEmSegundos: SESSION_SECONDS
  };
}

function validarSessao_(body) {
  const sessao = obterSessao_(body);

  if (!sessao) {
    return {
      ok: false,
      sessaoValida: false,
      erro: 'Sessão expirada. Faça login novamente.'
    };
  }

  return { ok: true, sessaoValida: true, conferente: sessao };
}

function logout_(body) {
  const token = normalizarTexto_(body.sessao);
  if (token) CacheService.getScriptCache().remove(CACHE_PREFIX + token);
  return { ok: true };
}

/**
 * LOCALIZAÇÃO DO PEDIDO
 *
 * A busca usa SOMENTE a coluna C (Pedido).
 * Ao encontrar, o separador vem da coluna D da MESMA linha.
 *
 * Data e turno não participam da identificação do pedido.
 */
function consultarPedido_(body) {
  const conferente = obterSessao_(body);

  if (!conferente) {
    return {
      ok: false,
      sessaoExpirada: true,
      erro: 'Sessão expirada. Faça login novamente.'
    };
  }

  const pedido = normalizarTexto_(body.pedido);

  if (!pedido) {
    return { ok: false, erro: 'Informe ou escaneie o pedido.' };
  }

  const resultado = consultarPedidoInterno_(pedido);

  if (!resultado.encontrado) {
    return {
      ok: true,
      encontrado: false,
      pedido,
      erro: 'Pedido não encontrado.'
    };
  }

  return {
    ok: true,
    encontrado: true,
    pedido: resultado.pedido,
    separador: resultado.separador
  };
}

/**
 * REGISTRO SEM ERRO
 *
 * Atualiza a MESMA linha onde o pedido foi encontrado.
 * A:D ficam exatamente como estavam.
 * E:N recebem os dados da conferência.
 *
 * Não cria data/hora e não cria nova linha.
 */
function registrarSemErro_(body) {
  const sessao = obterSessao_(body);

  if (!sessao) {
    return {
      ok: false,
      sessaoExpirada: true,
      erro: 'Sessão expirada. Faça login novamente.'
    };
  }

  const pedido = normalizarTexto_(body.pedido);

  if (!pedido) {
    return { ok: false, erro: 'Pedido não informado.' };
  }

  const resultadoConsulta = consultarPedidoInterno_(pedido);

  if (!resultadoConsulta.encontrado) {
    return { ok: false, erro: 'Pedido não encontrado.' };
  }

  const aba = getSheet_(ABA_LANCAMENTOS);

  // A:D não são tocadas.
  aba.getRange(resultadoConsulta.linha, 5, 1, 10).setValues([[
    sessao, // E Conferente
    '',     // F SKU/Produto
    '',     // G Qtd. Solicitada
    '',     // H Qtd. Separada
    '',     // I Tipo de Erro
    '',     // J Gravidade
    'Não',  // K Erro Detectado?
    '',     // L Ação Tomada
    '',     // M Observação
    'Sim'   // N A separação está correta?
  ]]);

  return {
    ok: true,
    mensagem: 'Conferência registrada na linha original do pedido.',
    pedido: resultadoConsulta.pedido,
    separador: resultadoConsulta.separador,
    conferente: sessao
  };
}

/**
 * REGISTRO COM ERRO
 *
 * O primeiro SKU usa a linha original do pedido.
 * SKUs adicionais usam novas linhas e copiam A:D do pedido original.
 *
 * A data/turno copiados são os valores que já existiam na planilha.
 * Nenhuma data/hora é gerada pela conferência.
 */
function registrarComErro_(body) {
  const sessao = obterSessao_(body);

  if (!sessao) {
    return {
      ok: false,
      sessaoExpirada: true,
      erro: 'Sessão expirada. Faça login novamente.'
    };
  }

  const pedido = normalizarTexto_(body.pedido);
  const itens = Array.isArray(body.itens) ? body.itens : [];

  if (!pedido) return { ok: false, erro: 'Pedido não informado.' };
  if (itens.length === 0) {
    return { ok: false, erro: 'Adicione pelo menos um SKU com erro.' };
  }

  const resultadoConsulta = consultarPedidoInterno_(pedido);

  if (!resultadoConsulta.encontrado) {
    return { ok: false, erro: 'Pedido não encontrado.' };
  }

  const tipoErro = normalizarTexto_(body.tipoErro);
  const gravidade = normalizarTexto_(body.gravidade);
  const acaoTomada = normalizarTexto_(body.acaoTomada);
  const observacao = normalizarTexto_(body.observacao);

  if (!tipoErro) return { ok: false, erro: 'Informe o tipo de erro.' };
  if (!gravidade) return { ok: false, erro: 'Informe a gravidade.' };
  if (!acaoTomada) return { ok: false, erro: 'Informe a ação tomada.' };

  const itensNormalizados = itens.map(item => {
    const sku = normalizarTexto_(item.sku);
    const qtdSolicitada = normalizarNumero_(item.qtdSolicitada);
    const qtdSeparada = normalizarNumero_(item.qtdSeparada);

    if (!sku) {
      throw new Error('Existe um item sem SKU/Produto informado.');
    }

    if (qtdSolicitada === '' || qtdSeparada === '') {
      throw new Error(
        'Preencha as quantidades solicitada e separada de todos os itens.'
      );
    }

    return { sku, qtdSolicitada, qtdSeparada };
  });

  const aba = getSheet_(ABA_LANCAMENTOS);
  const primeiro = itensNormalizados[0];

  // Primeiro SKU: linha original. A:D permanecem intactas.
  aba.getRange(resultadoConsulta.linha, 5, 1, 10).setValues([[
    sessao,                 // E Conferente
    primeiro.sku,           // F SKU/Produto
    primeiro.qtdSolicitada, // G
    primeiro.qtdSeparada,   // H
    tipoErro,               // I
    gravidade,              // J
    'Sim',                  // K Erro Detectado?
    acaoTomada,             // L
    observacao,             // M
    'Não'                   // N A separação está correta?
  ]]);

  // SKUs adicionais: novas linhas, sem inventar data/hora.
  if (itensNormalizados.length > 1) {
    const linhasAdicionais = itensNormalizados.slice(1).map(item => [
      resultadoConsulta.dataValor, // A original
      resultadoConsulta.turno,     // B original
      resultadoConsulta.pedido,    // C original
      resultadoConsulta.separador, // D original
      sessao,                      // E
      item.sku,                    // F
      item.qtdSolicitada,          // G
      item.qtdSeparada,            // H
      tipoErro,                    // I
      gravidade,                   // J
      'Sim',                       // K
      acaoTomada,                  // L
      observacao,                  // M
      'Não'                        // N
    ]);

    const linhaInicial = aba.getLastRow() + 1;

    aba.getRange(
      linhaInicial,
      1,
      linhasAdicionais.length,
      14
    ).setValues(linhasAdicionais);
  }

  return {
    ok: true,
    mensagem: 'Conferência com erro registrada.',
    itensRegistrados: itensNormalizados.length,
    pedido: resultadoConsulta.pedido,
    separador: resultadoConsulta.separador,
    conferente: sessao
  };
}

/**
 * Procura o pedido na coluna C e devolve a linha exata.
 * O separador vem da coluna D da mesma linha.
 */
function consultarPedidoInterno_(pedido) {
  const aba = getSheet_(ABA_LANCAMENTOS);
  const ultimaLinha = aba.getLastRow();

  if (ultimaLinha < 2) {
    return { encontrado: false };
  }

  // Só A:D são necessários para identificar o pedido,
  // pegar o separador e preservar os dados originais.
  const dados = aba.getRange(
    2,
    1,
    ultimaLinha - 1,
    4
  ).getDisplayValues();

  const pedidoBusca = normalizarTexto_(pedido).toLowerCase();

  for (let i = 0; i < dados.length; i++) {
    const pedidoPlanilha =
      normalizarTexto_(dados[i][2]).toLowerCase();

    if (pedidoPlanilha === pedidoBusca) {
      const linha = i + 2;

      return {
        encontrado: true,
        linha,
        dataValor: aba.getRange(linha, 1).getValue(),
        turno: dados[i][1],
        pedido: dados[i][2],
        separador: dados[i][3]
      };
    }
  }

  return { encontrado: false };
}

function obterSessao_(body) {
  const token = normalizarTexto_(body.sessao);

  if (!token) return null;

  return CacheService
    .getScriptCache()
    .get(CACHE_PREFIX + token);
}

function getSheet_(nome) {
  const planilha = SpreadsheetApp.openById(SPREADSHEET_ID);
  const aba = planilha.getSheetByName(nome);

  if (!aba) {
    throw new Error('Aba não encontrada: ' + nome);
  }

  return aba;
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return {};
  }

  const texto = e.postData.contents.trim();

  if (!texto) return {};

  try {
    return JSON.parse(texto);
  } catch (erro) {
    throw new Error(
      'A requisição enviada não contém um JSON válido.'
    );
  }
}

function normalizarTexto_(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor).trim();
}

function normalizarNumero_(valor) {
  if (
    valor === null ||
    valor === undefined ||
    String(valor).trim() === ''
  ) {
    return '';
  }

  const texto = String(valor).trim().replace(',', '.');
  const numero = Number(texto);

  if (!Number.isFinite(numero) || numero < 0) {
    throw new Error('Quantidade inválida: ' + valor);
  }

  return numero;
}

function jsonResponse(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}
