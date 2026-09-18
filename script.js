const API_URL = 'https://script.google.com/macros/s/AKfycbwlJAOQ8sPFkADagsvCfENQ5CilWGr9TsShXrw1fk5M_LlJA4wGj3yr9l32Pxlhg7c5tQ/exec';

let sessao = null;
let nomeConferente = null;
let pedidoAtual = '';

const $ = id => document.getElementById(id);

window.addEventListener('DOMContentLoaded', () => {
  $('btnEntrar')?.addEventListener('click', fazerLogin);
  $('btnSair')?.addEventListener('click', sair);
  $('btnBuscarPedido')?.addEventListener('click', buscarPedido);
  $('btnSemErro')?.addEventListener('click', registrarSemErro);
  $('btnComErro')?.addEventListener('click', selecionarComErro);
  $('btnRegistrarComErro')?.addEventListener('click', registrarComErro);

  $('pedido')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      buscarPedido();
    }
  });

  restaurarSessaoOuCarregarConferentes();
});

async function chamarAPI(acao, dados = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const resposta = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ acao, ...dados }),
      signal: controller.signal
    });

    const texto = await resposta.text();

    let resultado;
    try {
      resultado = JSON.parse(texto);
    } catch {
      throw new Error('A API retornou uma resposta inválida.');
    }

    if (!resposta.ok) {
      throw new Error(resultado.erro || 'A API recusou a solicitação.');
    }

    return resultado;
  } catch (erro) {
    if (erro.name === 'AbortError') {
      throw new Error('Tempo esgotado ao comunicar com o Google Sheets.');
    }
    throw erro;
  } finally {
    clearTimeout(timer);
  }
}

async function restaurarSessaoOuCarregarConferentes() {
  const sessaoSalva = sessionStorage.getItem('sessaoConferencia');
  const nomeSalvo = sessionStorage.getItem('nomeConferente');

  if (!sessaoSalva || !nomeSalvo) {
    carregarConferentes();
    return;
  }

  try {
    const resultado = await chamarAPI('validarSessao', { sessao: sessaoSalva });

    if (resultado.ok && resultado.sessaoValida) {
      sessao = sessaoSalva;
      nomeConferente = resultado.conferente || nomeSalvo;
      mostrarSistema();
      return;
    }
  } catch (erro) {
    // Se a API estiver indisponível, mantém a tela de login.
  }

  sessionStorage.removeItem('sessaoConferencia');
  sessionStorage.removeItem('nomeConferente');
  sessao = null;
  nomeConferente = null;
  carregarConferentes();
}

async function carregarConferentes() {
  setStatus('statusLogin', 'Carregando conferentes...');

  const select = $('conferente');
  select.disabled = true;

  try {
    const resultado = await chamarAPI('listarConferentes');

    if (!resultado.ok) {
      throw new Error(
        resultado.erro || 'Não foi possível carregar os conferentes.'
      );
    }

    const lista = Array.isArray(resultado.conferentes)
      ? resultado.conferentes
      : [];

    select.innerHTML = '<option value="">Selecione seu nome</option>';

    lista.forEach(nome => {
      const texto = String(nome || '').trim();
      if (!texto) return;

      const option = document.createElement('option');
      option.value = texto;
      option.textContent = texto;
      select.appendChild(option);
    });

    select.disabled = false;

    if (lista.length === 0) {
      setStatus(
        'statusLogin',
        'Nenhum conferente foi encontrado no Cadastro.',
        'error'
      );
      return;
    }

    setStatus(
      'statusLogin',
      lista.length + ' conferente(s) encontrado(s).'
    );
  } catch (erro) {
    select.innerHTML = '<option value="">Erro ao carregar</option>';
    select.disabled = true;
    setStatus('statusLogin', erro.message, 'error');
  }
}

async function fazerLogin() {
  const conferente = $('conferente').value;

  if (!conferente) {
    setStatus('statusLogin', 'Selecione o conferente.', 'error');
    return;
  }

  const botao = $('btnEntrar');
  botao.disabled = true;
  botao.textContent = 'Entrando...';

  try {
    const resultado = await chamarAPI('login', { conferente });

    if (!resultado.ok) {
      throw new Error(
        resultado.erro || 'Não foi possível entrar.'
      );
    }

    if (!resultado.sessao) {
      throw new Error(
        'A API não criou a sessão do conferente.'
      );
    }

    sessao = resultado.sessao;
    nomeConferente = resultado.conferente || conferente;

    sessionStorage.setItem('sessaoConferencia', sessao);
    sessionStorage.setItem('nomeConferente', nomeConferente);

    mostrarSistema();
  } catch (erro) {
    setStatus('statusLogin', erro.message, 'error');
  } finally {
    botao.disabled = false;
    botao.textContent = 'Entrar';
  }
}

function mostrarSistema() {
  $('telaLogin').style.display = 'none';
  $('telaSistema').style.display = 'block';
  $('nomeConferente').textContent = nomeConferente || '-';

  limparEstadoVisual();

  setTimeout(() => $('pedido')?.focus(), 50);
}

async function sair() {
  const token = sessao;

  sessao = null;
  nomeConferente = null;
  pedidoAtual = '';

  sessionStorage.removeItem('sessaoConferencia');
  sessionStorage.removeItem('nomeConferente');

  try {
    if (token) {
      await chamarAPI('logout', { sessao: token });
    }
  } catch (erro) {
    // O logout local continua válido mesmo sem resposta da API.
  }

  $('telaSistema').style.display = 'none';
  $('telaLogin').style.display = 'flex';
  $('conferente').value = '';
  limparEstadoVisual();
  setStatus('statusLogin', 'Sessão encerrada.');
  carregarConferentes();
}

function limparEstadoVisual() {
  pedidoAtual = '';

  $('pedido').value = '';
  $('secaoResultado').style.display = 'none';
  $('secaoErro').style.display = 'none';

  $('sku').value = '';
  $('qtdSolicitada').value = '';
  $('qtdSeparada').value = '';
  $('tipoErro').value = '';
  $('gravidade').value = '';
  $('acaoTomada').value = '';
  $('observacao').value = '';

  setStatus('statusSistema', '');
}

async function buscarPedido() {
  const pedido = $('pedido').value.trim();

  if (!pedido) {
    setStatus(
      'statusSistema',
      'Informe ou escaneie o número do pedido.',
      'error'
    );
    $('pedido').focus();
    return;
  }

  sessao = sessao || sessionStorage.getItem('sessaoConferencia');
  nomeConferente =
    nomeConferente || sessionStorage.getItem('nomeConferente');

  if (!sessao || !nomeConferente) {
    setStatus(
      'statusSistema',
      'Sua sessão não está disponível. Faça o login novamente.',
      'error'
    );
    await sair();
    return;
  }

  const botao = $('btnBuscarPedido');
  botao.disabled = true;
  botao.textContent = 'Buscando...';

  try {
    const resultado = await chamarAPI('consultarPedido', {
      sessao,
      pedido
    });

    if (!resultado.ok) {
      if (resultado.sessaoExpirada) {
        await sair();
      }
      throw new Error(
        resultado.erro || 'Não foi possível consultar o pedido.'
      );
    }

    if (!resultado.encontrado) {
      $('secaoResultado').style.display = 'none';
      $('secaoErro').style.display = 'none';

      setStatus(
        'statusSistema',
        resultado.erro || 'Pedido não encontrado.',
        'error'
      );
      $('pedido').select();
      return;
    }

    pedidoAtual = resultado.pedido;
    mostrarResultadoPedido(resultado);
  } catch (erro) {
    setStatus('statusSistema', erro.message, 'error');
  } finally {
    botao.disabled = false;
    botao.textContent = 'Buscar pedido';
  }
}

function mostrarResultadoPedido(resultado) {
  $('resultadoPedido').textContent = resultado.pedido || '-';
  $('resultadoSeparador').textContent = resultado.separador || '-';

  $('secaoResultado').style.display = 'block';
  $('secaoErro').style.display = 'none';

  setStatus(
    'statusSistema',
    'Pedido localizado. Confira a separação.',
    'success'
  );

  $('secaoResultado').scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}

async function registrarSemErro() {
  if (!pedidoAtual) {
    setStatus(
      'statusSistema',
      'Nenhum pedido selecionado.',
      'error'
    );
    return;
  }

  await enviarConferencia({
    acao: 'registrarSemErro',
    sessao,
    pedido: pedidoAtual
  });
}

function selecionarComErro() {
  if (!pedidoAtual) {
    setStatus(
      'statusSistema',
      'Nenhum pedido selecionado.',
      'error'
    );
    return;
  }

  $('secaoErro').style.display = 'block';

  setStatus(
    'statusSistema',
    'Informe os dados do erro encontrado.',
    'error'
  );

  $('sku').focus();

  $('secaoErro').scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}

async function registrarComErro() {
  if (!pedidoAtual) {
    setStatus(
      'statusSistema',
      'Nenhum pedido selecionado.',
      'error'
    );
    return;
  }

  const sku = $('sku').value.trim();
  const qtdSolicitada = $('qtdSolicitada').value.trim();
  const qtdSeparada = $('qtdSeparada').value.trim();

  if (!sku) {
    setStatus(
      'statusSistema',
      'Informe o SKU/produto.',
      'error'
    );
    $('sku').focus();
    return;
  }

  if (qtdSolicitada === '' || qtdSeparada === '') {
    setStatus(
      'statusSistema',
      'Informe as quantidades solicitada e separada.',
      'error'
    );
    return;
  }

  if (!$('tipoErro').value) {
    setStatus(
      'statusSistema',
      'Informe o tipo de erro.',
      'error'
    );
    return;
  }

  if (!$('gravidade').value) {
    setStatus(
      'statusSistema',
      'Informe a gravidade.',
      'error'
    );
    return;
  }

  if (!$('acaoTomada').value) {
    setStatus(
      'statusSistema',
      'Informe a ação tomada.',
      'error'
    );
    return;
  }

  await enviarConferencia({
    acao: 'registrarComErro',
    sessao,
    pedido: pedidoAtual,
    sku,
    qtdSolicitada,
    qtdSeparada,
    tipoErro: $('tipoErro').value,
    gravidade: $('gravidade').value,
    acaoTomada: $('acaoTomada').value,
    observacao: $('observacao').value.trim()
  });
}

async function enviarConferencia(dados) {
  const botao =
    dados.acao === 'registrarComErro'
      ? $('btnRegistrarComErro')
      : $('btnSemErro');

  botao.disabled = true;
  botao.textContent = 'Registrando...';

  try {
    const resultado = await chamarAPI(dados.acao, dados);

    if (!resultado.ok) {
      if (resultado.sessaoExpirada) {
        await sair();
      }

      throw new Error(
        resultado.erro ||
        'Não foi possível registrar a conferência.'
      );
    }

    setStatus(
      'statusSistema',
      resultado.mensagem ||
      'Conferência registrada com sucesso.',
      'success'
    );

    limparCamposConferencia();

    setTimeout(() => $('pedido')?.focus(), 80);
  } catch (erro) {
    setStatus('statusSistema', erro.message, 'error');
  } finally {
    botao.disabled = false;
    botao.textContent =
      dados.acao === 'registrarComErro'
        ? 'Registrar conferência com erro'
        : 'Sim, está correta';
  }
}

function limparCamposConferencia() {
  pedidoAtual = '';

  $('pedido').value = '';
  $('secaoResultado').style.display = 'none';
  $('secaoErro').style.display = 'none';

  $('sku').value = '';
  $('qtdSolicitada').value = '';
  $('qtdSeparada').value = '';
  $('tipoErro').value = '';
  $('gravidade').value = '';
  $('acaoTomada').value = '';
  $('observacao').value = '';
}

function setStatus(id, mensagem, tipo = '') {
  const elemento = $(id);
  if (!elemento) return;

  elemento.textContent = mensagem || '';
  elemento.className = 'status' + (tipo ? ' ' + tipo : '');
}
