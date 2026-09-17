const SPREADSHEET_ID = '16l4PoccxeI_masCzuQh1vHfJV5z3A-yvz80A2yaubRk';
const ABA_LANCAMENTOS = 'Lançamentos';
const ABA_CADASTRO = 'Cadastro';
const CACHE_PREFIX = 'CONFERENCIA_V2_';
const SESSION_SECONDS = 6 * 60 * 60;
const VERSAO_API = '2.0.1';

function doGet() {
  return jsonResponse({
    ok: true,
    sistema: 'API Sistema Conferência V2',
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

function listarConferentes_() {
  const aba = getSheet_(ABA_CADASTRO);
  const ultimaLinha = aba.getLastRow();

  if (ultimaLinha < 2) return { ok: true, conferentes: [] };

  const valores = aba.getRange(2, 4, ultimaLinha - 1, 1).getDisplayValues();
  const conferentes = valores
    .map(linha => String(linha[0]).trim())
    .filter(Boolean);

  const unicos = [...new Set(conferentes)].sort((a, b) =>
    a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
  );

  return { ok: true, conferentes: unicos };
}

function login_(body) {
  const conferente = normalizarTexto_(body.conferente);
  if (!conferente) return { ok: false, erro: 'Selecione um conferente.' };

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

function consultarPedido_(body) {
  const conferente = obterSessao_(body);
  if (!conferente) {
    return { ok: false, sessaoExpirada: true, erro: 'Sessão expirada. Faça login novamente.' };
  }

  const pedido = normalizarTexto_(body.pedido);
  if (!pedido) return { ok: false, erro: 'Informe ou escaneie o pedido.' };

  const resultado = consultarPedidoInterno_(pedido);
  if (!resultado.encontrado) {
    return { ok: true, encontrado: false, pedido, erro: 'Pedido não encontrado.' };
  }

  return {
    ok: true,
    encontrado: true,
    pedido: resultado.pedido,
    data: resultado.data,
    turno: resultado.turno,
    separador: resultado.separador
  };
}

function registrarSemErro_(body) {
  const sessao = obterSessao_(body);
  if (!sessao) {
    return { ok: false, sessaoExpirada: true, erro: 'Sessão expirada. Faça login novamente.' };
  }

  const pedido = normalizarTexto_(body.pedido);
  if (!pedido) return { ok: false, erro: 'Pedido não informado.' };

  const resultadoConsulta = consultarPedidoInterno_(pedido);
  if (!resultadoConsulta.encontrado) return { ok: false, erro: 'Pedido não encontrado.' };

  const aba = getSheet_(ABA_LANCAMENTOS);

  // IMPORTANTE: não altera A:D e não cria nova linha.
  // A data e o turno pertencem ao lançamento original.
  // A coluna A continua somente com a data já existente na planilha.
  aba.getRange(resultadoConsulta.linha, 5, 1, 10).setValues([[
    sessao,
    '',
    '',
    '',
    '',
    '',
    'Não',
    '',
    '',
    'Sim'
  ]]);

  return {
    ok: true,
    mensagem: 'Conferência registrada na linha original do pedido.',
    pedido: resultadoConsulta.pedido,
    conferente: sessao
  };
}

function registrarComErro_(body) {
  const sessao = obterSessao_(body);
  if (!sessao) {
    return { ok: false, sessaoExpirada: true, erro: 'Sessão expirada. Faça login novamente.' };
  }

  const pedido = normalizarTexto_(body.pedido);
  const itens = Array.isArray(body.itens) ? body.itens : [];

  if (!pedido) return { ok: false, erro: 'Pedido não informado.' };
  if (itens.length === 0) return { ok: false, erro: 'Adicione pelo menos um SKU com erro.' };

  const resultadoConsulta = consultarPedidoInterno_(pedido);
  if (!resultadoConsulta.encontrado) return { ok: false, erro: 'Pedido não encontrado.' };

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

    if (!sku) throw new Error('Existe um item sem SKU/Produto informado.');
    if (qtdSolicitada === '' || qtdSeparada === '') {
      throw new Error('Preencha as quantidades solicitada e separada de todos os itens.');
    }

    return { sku, qtdSolicitada, qtdSeparada };
  });

  const aba = getSheet_(ABA_LANCAMENTOS);
  const primeiro = itensNormalizados[0];

  // Primeiro SKU ocupa a linha original, preservando A:D.
  aba.getRange(resultadoConsulta.linha, 5, 1, 10).setValues([[
    sessao,
    primeiro.sku,
    primeiro.qtdSolicitada,
    primeiro.qtdSeparada,
    tipoErro,
    gravidade,
    'Sim',
    acaoTomada,
    observacao,
    'Não'
  ]]);

  // SKUs adicionais precisam de linhas próprias.
  if (itensNormalizados.length > 1) {
    const linhasAdicionais = itensNormalizados.slice(1).map(item => [
      resultadoConsulta.dataValor,
      resultadoConsulta.turno,
      resultadoConsulta.pedido,
      resultadoConsulta.separador,
      sessao,
      item.sku,
      item.qtdSolicitada,
      item.qtdSeparada,
      tipoErro,
      gravidade,
      'Sim',
      acaoTomada,
      observacao,
      'Não'
    ]);

    const linhaInicial = aba.getLastRow() + 1;
    aba.getRange(linhaInicial, 1, linhasAdicionais.length, 14).setValues(linhasAdicionais);
  }

  return {
    ok: true,
    mensagem: 'Conferência com erro registrada na linha original do pedido.',
    itensRegistrados: itensNormalizados.length,
    pedido: resultadoConsulta.pedido,
    conferente: sessao
  };
}

function consultarPedidoInterno_(pedido) {
  const aba = getSheet_(ABA_LANCAMENTOS);
  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return { encontrado: false };

  const dados = aba.getRange(2, 1, ultimaLinha - 1, 4).getDisplayValues();
  const pedidoBusca = normalizarTexto_(pedido).toLowerCase();

  for (let i = 0; i < dados.length; i++) {
    if (normalizarTexto_(dados[i][2]).toLowerCase() === pedidoBusca) {
      const linha = i + 2;
      return {
        encontrado: true,
        linha,
        data: dados[i][0],
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
  return CacheService.getScriptCache().get(CACHE_PREFIX + token);
}

function getSheet_(nome) {
  const planilha = SpreadsheetApp.openById(SPREADSHEET_ID);
  const aba = planilha.getSheetByName(nome);
  if (!aba) throw new Error('Aba não encontrada: ' + nome);
  return aba;
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};

  const texto = e.postData.contents.trim();
  if (!texto) return {};

  try {
    return JSON.parse(texto);
  } catch (erro) {
    throw new Error('A requisição enviada não contém um JSON válido.');
  }
}

function normalizarTexto_(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor).trim();
}

function normalizarNumero_(valor) {
  if (valor === null || valor === undefined || String(valor).trim() === '') return '';

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
