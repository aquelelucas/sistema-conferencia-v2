const SPREADSHEET_ID = '16l4PoccxeI_masCzuQh1vHfJV5z3A-yvz80A2yaubRk';
const ABA_LANCAMENTOS = 'Lançamentos';
const ABA_CADASTRO = 'Cadastro';
const CACHE_PREFIX = 'CONFERENCIA_V2_';
const SESSION_SECONDS = 6 * 60 * 60;

function doGet() {
  return jsonResponse({
    ok: true,
    sistema: 'API Sistema Conferência V2',
    versao: '2.0.0'
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
        return jsonResponse({
          ok: false,
          erro: 'Ação não reconhecida.'
        });
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

  if (ultimaLinha < 2) {
    return { ok: true, conferentes: [] };
  }

  // Cadastro: A Separador | B Meta de Erro | C Observação | D Conferente | E Senha
  const valores = aba.getRange(2, 4, ultimaLinha - 1, 1).getDisplayValues();
  const conferentes = valores
    .map(linha => String(linha[0]).trim())
    .filter(Boolean);

  const unicos = [...new Set(conferentes)].sort((a, b) =>
    a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
  );

  return {
    ok: true,
    conferentes: unicos
  };
}

function login_(body) {
  const conferente = String(body.conferente || '').trim();

  if (!conferente) {
    return { ok: false, erro: 'Selecione um conferente.' };
  }

  const conferentes = listarConferentes_().conferentes;
  const encontrado = conferentes.some(nome =>
    nome.toLowerCase() === conferente.toLowerCase()
  );

  if (!encontrado) {
    return { ok: false, erro: 'Conferente não encontrado no cadastro.' };
  }

  const nomeOficial = conferentes.find(nome =>
    nome.toLowerCase() === conferente.toLowerCase()
  );

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

  return {
    ok: true,
    sessaoValida: true,
    conferente: sessao
  };
}

function logout_(body) {
  const token = String(body.sessao || '').trim();

  if (token) {
    CacheService.getScriptCache().remove(CACHE_PREFIX + token);
  }

  return { ok: true };
}

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

  const aba = getSheet_(ABA_LANCAMENTOS);
  const ultimaLinha = aba.getLastRow();

  if (ultimaLinha < 2) {
    return { ok: false, erro: 'Nenhum lançamento encontrado.' };
  }

  // A Data | B Turno | C Pedido | D Separador
  const dados = aba.getRange(2, 1, ultimaLinha - 1, 4).getDisplayValues();
  const pedidoBusca = pedido.toLowerCase();

  for (let i = 0; i < dados.length; i++) {
    const pedidoPlanilha = normalizarTexto_(dados[i][2]).toLowerCase();

    if (pedidoPlanilha === pedidoBusca) {
      return {
        ok: true,
        encontrado: true,
        pedido: dados[i][2],
        data: dados[i][0],
        turno: dados[i][1],
        separador: dados[i][3]
      };
    }
  }

  return {
    ok: true,
    encontrado: false,
    pedido: pedido,
    erro: 'Pedido não encontrado.'
  };
}

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

  const agora = new Date();
  const linha = [
    agora,                         // A Data
    resultadoConsulta.turno,      // B Turno
    resultadoConsulta.pedido,     // C Pedido
    resultadoConsulta.separador,  // D Separador
    sessao,                        // E Conferente
    '',                            // F SKU/Produto
    '',                            // G Qtd. Solicitada
    '',                            // H Qtd. Separada
    '',                            // I Tipo de Erro
    '',                            // J Gravidade
    'Não',                         // K Erro Detectado?
    '',                            // L Ação Tomada
    '',                            // M Observação
    'Sim'                          // N A separação está correta?
  ];

  getSheet_(ABA_LANCAMENTOS).appendRow(linha);

  return {
    ok: true,
    mensagem: 'Conferência registrada com sucesso.',
    pedido: resultadoConsulta.pedido,
    conferente: sessao
  };
}

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

  if (!pedido) {
    return { ok: false, erro: 'Pedido não informado.' };
  }

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

  if (!tipoErro) {
    return { ok: false, erro: 'Informe o tipo de erro.' };
  }

  if (!gravidade) {
    return { ok: false, erro: 'Informe a gravidade.' };
  }

  if (!acaoTomada) {
    return { ok: false, erro: 'Informe a ação tomada.' };
  }

  const linhas = itens.map(item => {
    const sku = normalizarTexto_(item.sku);
    const qtdSolicitada = normalizarNumero_(item.qtdSolicitada);
    const qtdSeparada = normalizarNumero_(item.qtdSeparada);

    if (!sku) {
      throw new Error('Existe um item sem SKU/Produto informado.');
    }

    if (qtdSolicitada === '' || qtdSeparada === '') {
      throw new Error('Preencha as quantidades solicitada e separada de todos os itens.');
    }

    return [
      new Date(),                    // A Data
      resultadoConsulta.turno,       // B Turno
      resultadoConsulta.pedido,      // C Pedido
      resultadoConsulta.separador,   // D Separador
      sessao,                        // E Conferente
      sku,                           // F SKU/Produto
      qtdSolicitada,                 // G Qtd. Solicitada
      qtdSeparada,                   // H Qtd. Separada
      tipoErro,                      // I Tipo de Erro
      gravidade,                     // J Gravidade
      'Sim',                         // K Erro Detectado?
      acaoTomada,                    // L Ação Tomada
      observacao,                    // M Observação
      'Não'                          // N A separação está correta?
    ];
  });

  const aba = getSheet_(ABA_LANCAMENTOS);
  const primeiraLinha = aba.getLastRow() + 1;
  aba.getRange(primeiraLinha, 1, linhas.length, 14).setValues(linhas);

  return {
    ok: true,
    mensagem: 'Conferência com erro registrada com sucesso.',
    itensRegistrados: linhas.length,
    pedido: resultadoConsulta.pedido,
    conferente: sessao
  };
}

function consultarPedidoInterno_(pedido) {
  const aba = getSheet_(ABA_LANCAMENTOS);
  const ultimaLinha = aba.getLastRow();

  if (ultimaLinha < 2) {
    return { encontrado: false };
  }

  const dados = aba.getRange(2, 1, ultimaLinha - 1, 4).getDisplayValues();
  const pedidoBusca = normalizarTexto_(pedido).toLowerCase();

  for (let i = 0; i < dados.length; i++) {
    if (normalizarTexto_(dados[i][2]).toLowerCase() === pedidoBusca) {
      return {
        encontrado: true,
        pedido: dados[i][2],
        data: dados[i][0],
        turno: dados[i][1],
        separador: dados[i][3]
      };
    }
  }

  return { encontrado: false };
}

function obterSessao_(body) {
  const token = String(body.sessao || '').trim();

  if (!token) {
    return null;
  }

  return CacheService.getScriptCache().get(CACHE_PREFIX + token);
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

  if (!texto) {
    return {};
  }

  try {
    return JSON.parse(texto);
  } catch (erro) {
    throw new Error('A requisição enviada não contém um JSON válido.');
  }
}

function normalizarTexto_(valor) {
  if (valor === null || valor === undefined) {
    return '';
  }

  return String(valor).trim();
}

function normalizarNumero_(valor) {
  if (valor === null || valor === undefined || String(valor).trim() === '') {
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
