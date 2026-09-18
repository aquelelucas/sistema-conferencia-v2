/**
 * LINK DE CONFERÊNCIA V2
 *
 * Regras:
 * - Pedido é localizado exclusivamente pela coluna C da aba Lançamentos.
 * - O separador é lido da coluna D da mesma linha.
 * - A:D não são alteradas pela conferência.
 * - A conferência grava E:N na mesma linha do pedido.
 * - Não cria data nem hora.
 * - Não cria nova linha para registrar a conferência.
 */

const SPREADSHEET_ID = '16l4PoccxeI_masCzuQh1vHfJV5z3A-yvz80A2yaubRk';
const ABA_LANCAMENTOS = 'Lançamentos';
const ABA_CADASTRO = 'Cadastro';

const CACHE_PREFIX = 'CONFERENCIA_V2_';
const SESSION_SECONDS = 6 * 60 * 60;
const VERSAO_API = '2.1.0';

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
    const acao = normalizarTexto_(body.acao);

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
      erro: erro && erro.message
        ? erro.message
        : 'Erro interno da API.'
    });
  }
}

/**
 * Detecta a coluna dos conferentes pelo cabeçalho.
 *
 * Prioridade:
 * 1. cabeçalho contendo "Conferente";
 * 2. coluna D, que é o layout oficial do V2;
 * 3. coluna A como compatibilidade caso D esteja vazia.
 */
function descobrirColunaConferentes_(aba) {
  const ultimaColuna = Math.max(aba.getLastColumn(), 4);
  const cabecalhos = aba
    .getRange(1, 1, 1, ultimaColuna)
    .getDisplayValues()[0];

  for (let i = 0; i < cabecalhos.length; i++) {
    const cabecalho = normalizarCabecalho_(cabecalhos[i]);

    if (cabecalho.includes('conferente')) {
      return i + 1;
    }
  }

  if (aba.getLastRow() >= 2) {
    const valoresD = aba
      .getRange(2, 4, aba.getLastRow() - 1, 1)
      .getDisplayValues()
      .flat()
      .map(normalizarTexto_)
      .filter(Boolean);

    if (valoresD.length > 0) {
      return 4;
    }
  }

  return 1;
}

function listarConferentes_() {
  const aba = getSheet_(ABA_CADASTRO);
  const coluna = descobrirColunaConferentes_(aba);
  const ultimaLinha = aba.getLastRow();

  if (ultimaLinha < 2) {
    return {
      ok: true,
      conferentes: [],
      colunaUsada: coluna
    };
  }

  const conferentes = aba
    .getRange(2, coluna, ultimaLinha - 1, 1)
    .getDisplayValues()
    .flat()
    .map(normalizarTexto_)
    .filter(Boolean);

  const unicos = [...new Set(conferentes)].sort((a, b) =>
    a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
  );

  return {
    ok: true,
    conferentes: unicos,
    colunaUsada: coluna
  };
}

function login_(body) {
  const conferenteInformado = normalizarTexto_(body.conferente);

  if (!conferenteInformado) {
    return {
      ok: false,
      erro: 'Selecione o conferente.'
    };
  }

  const conferentes = listarConferentes_().conferentes;

  const nomeOficial = conferentes.find(nome =>
    nome.toLowerCase() === conferenteInformado.toLowerCase()
  );

  if (!nomeOficial) {
    return {
      ok: false,
      erro: 'Conferente não encontrado no Cadastro.'
    };
  }

  const token = Utilities.getUuid();

  CacheService
    .getScriptCache()
    .put(
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
  const token = normalizarTexto_(body.sessao);

  if (token) {
    CacheService
      .getScriptCache()
      .remove(CACHE_PREFIX + token);
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
    return {
      ok: false,
      erro: 'Informe ou escaneie o pedido.'
    };
  }

  const resultado = localizarPedido_(pedido);

  if (!resultado.encontrado) {
    return {
      ok: true,
      encontrado: false,
      pedido: pedido,
      erro: 'Pedido não encontrado.'
    };
  }

  if (resultado.jaConferido) {
    return {
      ok: true,
      encontrado: false,
      jaConferido: true,
      pedido: resultado.pedido,
      erro: 'O pedido ' + resultado.pedido + ' já foi conferido.'
    };
  }

  if (!resultado.separador) {
    return {
      ok: true,
      encontrado: false,
      pedido: resultado.pedido,
      erro:
        'O pedido ' +
        resultado.pedido +
        ' foi encontrado, mas não possui separador informado na coluna D.'
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
 * Localiza a primeira ocorrência do pedido ainda não conferida.
 * Se só existirem ocorrências já conferidas, devolve uma delas para o aviso.
 */
function localizarPedido_(pedido) {
  const aba = getSheet_(ABA_LANCAMENTOS);
  const ultimaLinha = aba.getLastRow();

  if (ultimaLinha < 2) {
    return { encontrado: false };
  }

  const dados = aba
    .getRange(2, 1, ultimaLinha - 1, 14)
    .getDisplayValues();

  const busca = normalizarPedido_(pedido);
  let primeiraConferida = null;

  for (let i = 0; i < dados.length; i++) {
    const linhaDados = dados[i];
    const pedidoPlanilha = normalizarTexto_(linhaDados[2]);

    if (!pedidoPlanilha) continue;

    if (normalizarPedido_(pedidoPlanilha) !== busca) {
      continue;
    }

    const registro = {
      encontrado: true,
      linha: i + 2,
      pedido: pedidoPlanilha,
      separador: normalizarTexto_(linhaDados[3]),
      conferenteAtual: normalizarTexto_(linhaDados[4]),
      resultadoAtual: normalizarTexto_(linhaDados[13]),
      jaConferido:
        !!normalizarTexto_(linhaDados[4]) ||
        !!normalizarTexto_(linhaDados[13])
    };

    if (!registro.jaConferido) {
      return registro;
    }

    if (!primeiraConferida) {
      primeiraConferida = registro;
    }
  }

  return primeiraConferida || { encontrado: false };
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
    return {
      ok: false,
      erro: 'Pedido não informado.'
    };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const registro = localizarPedido_(pedido);

    if (!registro || !registro.encontrado) {
      return {
        ok: false,
        erro: 'Pedido não encontrado.'
      };
    }

    if (registro.jaConferido) {
      return {
        ok: false,
        jaConferido: true,
        erro: 'O pedido ' + registro.pedido + ' já foi conferido.'
      };
    }

    const aba = registro.aba || getSheet_(ABA_LANCAMENTOS);

    // A:D permanecem intactas.
    // E:N recebem somente os dados da conferência.
    aba.getRange(registro.linha, 5, 1, 10).setValues([[
      sessao, // E Conferente
      '',     // F SKU/Produto
      '',     // G Qtd. Solicitada
      '',     // H Qtd. Separada
      '',     // I Tipo de Erro
      '',     // J Gravidade
      'NÃO',  // K Erro Detectado?
      '',     // L Ação Tomada
      '',     // M Observação
      'SIM'   // N A separação está correta?
    ]]);

    SpreadsheetApp.flush();

    return {
      ok: true,
      mensagem: 'Conferência registrada na linha original do pedido.',
      pedido: registro.pedido,
      separador: registro.separador,
      conferente: sessao
    };
  } finally {
    lock.releaseLock();
  }
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
  const sku = normalizarTexto_(body.sku);
  const qtdSolicitada = normalizarNumero_(body.qtdSolicitada);
  const qtdSeparada = normalizarNumero_(body.qtdSeparada);
  const tipoErro = normalizarTexto_(body.tipoErro);
  const gravidade = normalizarTexto_(body.gravidade);
  const acaoTomada = normalizarTexto_(body.acaoTomada);
  const observacao = normalizarTexto_(body.observacao);

  if (!pedido) return { ok: false, erro: 'Pedido não informado.' };
  if (!sku) return { ok: false, erro: 'Informe o SKU/produto.' };

  if (qtdSolicitada === '' || qtdSeparada === '') {
    return {
      ok: false,
      erro: 'Informe as quantidades solicitada e separada.'
    };
  }

  if (!tipoErro) {
    return { ok: false, erro: 'Informe o tipo de erro.' };
  }

  if (!gravidade) {
    return { ok: false, erro: 'Informe a gravidade.' };
  }

  if (!acaoTomada) {
    return { ok: false, erro: 'Informe a ação tomada.' };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const registro = localizarPedido_(pedido);

    if (!registro || !registro.encontrado) {
      return {
        ok: false,
        erro: 'Pedido não encontrado.'
      };
    }

    if (registro.jaConferido) {
      return {
        ok: false,
        jaConferido: true,
        erro: 'O pedido ' + registro.pedido + ' já foi conferido.'
      };
    }

    const aba = getSheet_(ABA_LANCAMENTOS);

    // A:D permanecem intactas e nenhuma nova linha é criada.
    // E:N recebem os dados da conferência.
    aba.getRange(registro.linha, 5, 1, 10).setValues([[
      sessao,          // E Conferente
      sku,             // F SKU/Produto
      qtdSolicitada,   // G Qtd. Solicitada
      qtdSeparada,     // H Qtd. Separada
      tipoErro,        // I Tipo de Erro
      gravidade,       // J Gravidade
      'SIM',           // K Erro Detectado?
      acaoTomada,      // L Ação Tomada
      observacao,      // M Observação
      'NÃO'            // N A separação está correta?
    ]]);

    SpreadsheetApp.flush();

    return {
      ok: true,
      mensagem: 'Conferência com erro registrada na linha original do pedido.',
      pedido: registro.pedido,
      separador: registro.separador,
      conferente: sessao
    };
  } finally {
    lock.releaseLock();
  }
}

function quantidadeConferencia_(conferente) {
  const nome = normalizarTexto_(conferente);

  if (!nome) {
    return {
      ok: true,
      quantidade: 0
    };
  }

  const aba = getSheet_(ABA_LANCAMENTOS);
  const ultimaLinha = aba.getLastRow();

  if (ultimaLinha < 2) {
    return {
      ok: true,
      quantidade: 0
    };
  }

  const dados = aba
    .getRange(2, 5, ultimaLinha - 1, 10)
    .getDisplayValues();

  let quantidade = 0;

  dados.forEach(linha => {
    const nomeLinha = normalizarTexto_(linha[0]);
    const resultado = normalizarTexto_(linha[9]).toUpperCase();

    if (
      nomeLinha === nome &&
      (resultado === 'SIM' || resultado === 'NÃO')
    ) {
      quantidade++;
    }
  });

  return {
    ok: true,
    quantidade: quantidade
  };
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

function normalizarCabecalho_(valor) {
  return normalizarTexto_(valor)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizarPedido_(valor) {
  const texto = normalizarTexto_(valor);

  if (!texto) return '';

  if (/^\d+$/.test(texto)) {
    return texto.replace(/^0+/, '') || '0';
  }

  return texto.toUpperCase();
}

function normalizarNumero_(valor) {
  if (
    valor === null ||
    valor === undefined ||
    String(valor).trim() === ''
  ) {
    return '';
  }

  const texto = String(valor)
    .trim()
    .replace(',', '.');

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
