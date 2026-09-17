const API_URL = 'https://script.google.com/macros/s/AKfycbxnoQ8Nm9-ZsyPk0n_QKb_PFbCiutRuuOm7lJaQv4Cix_BmLh2X5xdZU_-BstX8k_AWYA/exec';
const CHAVE_API = 'KING-CONFERENCIA-2026';

let sessao = null;
let nomeConferente = null;
let itens = [];
let pedidoAtual = '';

const $ = id => document.getElementById(id);

window.addEventListener('DOMContentLoaded', () => {
  $('btnEntrar')?.addEventListener('click', fazerLogin);
  $('btnSair')?.addEventListener('click', sair);
  $('btnBuscarPedido')?.addEventListener('click', buscarPedido);
  $('btnSemErro')?.addEventListener('click', selecionarSemErro);
  $('btnComErro')?.addEventListener('click', selecionarComErro);
  $('btnRegistrarSemErro')?.addEventListener('click', registrarSemErro);
  $('btnAdicionarItem')?.addEventListener('click', adicionarItem);
  $('btnRegistrarComErro')?.addEventListener('click', registrarComErro);

  $('pedido')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') buscarPedido();
  });

  $('sku')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') adicionarItem();
  });

  carregarConferentes();
});

async function chamarAPI(acao, dados = {}) {
  const corpo = {
    chave: CHAVE_API,
    acao,
    ...dados
  };

  const resposta = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(corpo)
  });

  const texto = await resposta.text();

  let resultado;
  try {
    resultado = JSON.parse(texto);
  } catch {
    throw new Error('A API retornou uma resposta inválida.');
  }

  return resultado;
}

async function carregarConferentes() {
  setStatus('statusLogin', 'Carregando conferentes...');

  try {
    const resultado = await chamarAPI('conferentes');

    if (!resultado.sucesso) {
      throw new Error(resultado.mensagem || 'Não foi possível carregar os conferentes.');
    }

    const select = $('conferente');
    select.innerHTML = '<option value="">Selecione seu nome</option>';

    (resultado.conferentes || []).forEach(nome => {
      const option = document.createElement('option');
      option.value = nome;
      option.textContent = nome;
      select.appendChild(option);
    });

    setStatus('statusLogin', '');
  } catch (erro) {
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
  setStatus('statusLogin', '');

  try {
    const resultado = await chamarAPI('login', { conferente });

    if (!resultado.sucesso) {
      throw new Error(resultado.mensagem || 'Não foi possível entrar.');
    }

    if (!resultado.sessao) {
      throw new Error('A API não criou a sessão do conferente.');
    }

    sessao = resultado.sessao;
    nomeConferente = resultado.nomeConferente || resultado.conferente || conferente;

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
  $('pedido')?.focus();
}

function sair() {
  sessao = null;
  nomeConferente = null;
  sessionStorage.removeItem('sessaoConferencia');
  sessionStorage.removeItem('nomeConferente');
  itens = [];
  pedidoAtual = '';

  $('telaSistema').style.display = 'none';
  $('telaLogin').style.display = 'flex';
  $('pedido').value = '';
  $('secaoResultado').style.display = 'none';
  $('secaoErro').style.display = 'none';
  $('btnRegistrarSemErro').style.display = 'none';
  $('listaItens').innerHTML = '';
}

async function buscarPedido() {
  const pedido = $('pedido').value.trim();

  if (!pedido) {
    setStatus('statusSistema', 'Informe ou escaneie o número do pedido.', 'error');
    $('pedido').focus();
    return;
  }

  sessao = sessao || sessionStorage.getItem('sessaoConferencia');
  nomeConferente = nomeConferente || sessionStorage.getItem('nomeConferente');

  if (!sessao) {
    setStatus('statusSistema', 'Sua sessão não está disponível. Faça o login novamente.', 'error');
    sair();
    return;
  }

  const botao = $('btnBuscarPedido');
  botao.disabled = true;
  botao.textContent = 'Buscando...';
  setStatus('statusSistema', '');

  try {
    const resultado = await chamarAPI('pedido', { sessao, pedido });

    if (!resultado.sucesso) {
      if ((resultado.mensagem || '').toLowerCase().includes('sessão')) {
        sair();
      }
      throw new Error(resultado.mensagem || 'Não foi possível consultar o pedido.');
    }

    if (!resultado.encontrado) {
      $('secaoResultado').style.display = 'none';
      $('secaoErro').style.display = 'none';
      $('btnRegistrarSemErro').style.display = 'none';
      setStatus('statusSistema', resultado.mensagem || 'Pedido não encontrado.', 'error');
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
  $('resultadoData').textContent = formatarData(resultado.data);
  $('resultadoTurno').textContent = resultado.turno || '-';
  $('resultadoSeparador').textContent = resultado.separador || '-';

  $('secaoResultado').style.display = 'block';
  $('secaoErro').style.display = 'none';
  $('btnRegistrarSemErro').style.display = 'none';
  setStatus('statusSistema', 'Pedido localizado. Faça a conferência.', 'success');
  $('secaoResultado').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function selecionarSemErro() {
  $('secaoErro').style.display = 'none';
  $('btnRegistrarSemErro').style.display = 'block';
  setStatus('statusSistema', 'Pedido marcado como correto. Clique em registrar para finalizar.', 'success');
}

function selecionarComErro() {
  $('btnRegistrarSemErro').style.display = 'none';
  $('secaoErro').style.display = 'block';
  setStatus('statusSistema', 'Informe os itens que apresentaram erro.', 'error');
  $('sku').focus();
  $('secaoErro').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function adicionarItem() {
  const sku = $('sku').value.trim();
  const qtdSolicitada = $('qtdSolicitada').value.trim();
  const qtdSeparada = $('qtdSeparada').value.trim();

  if (!sku) {
    setStatus('statusSistema', 'Informe o SKU/produto.', 'error');
    $('sku').focus();
    return;
  }

  if (qtdSolicitada === '' || qtdSeparada === '') {
    setStatus('statusSistema', 'Informe as quantidades solicitada e separada.', 'error');
    return;
  }

  itens.push({ sku, qtdSolicitada, qtdSeparada });
  renderizarItens();

  $('sku').value = '';
  $('qtdSolicitada').value = '';
  $('qtdSeparada').value = '';
  $('sku').focus();

  setStatus('statusSistema', 'Item adicionado.', 'success');
}

function renderizarItens() {
  const lista = $('listaItens');
  lista.innerHTML = '';

  itens.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'item-row';
    div.innerHTML = `
      <div><strong>${escapeHtml(item.sku)}</strong><br><span>Solicitada: ${escapeHtml(item.qtdSolicitada)} | Separada: ${escapeHtml(item.qtdSeparada)}</span></div>
      <button type="button" class="btn btn-outline" onclick="removerItem(${index})">Remover</button>
    `;
    lista.appendChild(div);
  });
}

function removerItem(index) {
  itens.splice(index, 1);
  renderizarItens();
}

async function registrarSemErro() {
  await enviarConferencia({ erro: false, itens: [] });
}

async function registrarComErro() {
  if (itens.length === 0) {
    setStatus('statusSistema', 'Adicione pelo menos um item com erro.', 'error');
    $('sku').focus();
    return;
  }

  if (!$('tipoErro').value || !$('gravidade').value || !$('acaoTomada').value) {
    setStatus('statusSistema', 'Preencha tipo de erro, gravidade e ação tomada.', 'error');
    return;
  }

  await enviarConferencia({
    erro: true,
    itens,
    tipoErro: $('tipoErro').value,
    gravidade: $('gravidade').value,
    acaoTomada: $('acaoTomada').value,
    observacao: $('observacao').value.trim()
  });
}

async function enviarConferencia(dados) {
  if (!pedidoAtual) {
    setStatus('statusSistema', 'Nenhum pedido selecionado.', 'error');
    return;
  }

  sessao = sessao || sessionStorage.getItem('sessaoConferencia');

  const botao = dados.erro ? $('btnRegistrarComErro') : $('btnRegistrarSemErro');
  botao.disabled = true;
  botao.textContent = 'Registrando...';

  try {
    const resultado = await chamarAPI('registrarConferencia', {
      sessao,
      pedido: pedidoAtual,
      ...dados
    });

    if (!resultado.sucesso) {
      if ((resultado.mensagem || '').toLowerCase().includes('sessão')) sair();
      throw new Error(resultado.mensagem || 'Não foi possível registrar a conferência.');
    }

    setStatus('statusSistema', resultado.mensagem || 'Conferência registrada com sucesso.', 'success');
    limparCamposConferencia();
  } catch (erro) {
    setStatus('statusSistema', erro.message, 'error');
  } finally {
    botao.disabled = false;
    botao.textContent = dados.erro ? 'Registrar conferência com erro' : 'Registrar conferência';
  }
}

function limparCamposConferencia() {
  itens = [];
  pedidoAtual = '';
  renderizarItens();
  $('pedido').value = '';
  $('secaoResultado').style.display = 'none';
  $('secaoErro').style.display = 'none';
  $('btnRegistrarSemErro').style.display = 'none';
  $('sku').value = '';
  $('qtdSolicitada').value = '';
  $('qtdSeparada').value = '';
  $('tipoErro').value = '';
  $('gravidade').value = '';
  $('acaoTomada').value = '';
  $('observacao').value = '';
  $('pedido').focus();
}

function setStatus(id, mensagem, tipo = '') {
  const elemento = $(id);
  if (!elemento) return;
  elemento.textContent = mensagem || '';
  elemento.className = 'status' + (tipo ? ' ' + tipo : '');
}

function formatarData(valor) {
  if (!valor) return '-';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return String(valor);
  return data.toLocaleDateString('pt-BR');
}

function escapeHtml(valor) {
  return String(valor ?? '').replace(/[&<>'"]/g, caractere => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#039;',
    '"': '&quot;'
  }[caractere]));
}
