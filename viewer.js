/* ==========================================================================
   Tech ProjetAR — visualizador
   Controla escala (1:1 / maquete), medidas, acabamentos, AR, captura e envio.
   ========================================================================== */
(function () {
  'use strict';

  const D  = JSON.parse(document.getElementById('dados-projeto').textContent);
  const mv = document.getElementById('mv');
  const $  = (s) => document.querySelector(s);

  let escalaAtual = 1;          // 1 = real; 10 = 1:10; 20 = 1:20 ...
  let caixa       = null;       // bounding box do modelo (metros, sem escala)
  let acabamento  = null;       // acabamento selecionado
  let cotasVisiveis = false;
  let raioBase    = 0;          // distância de câmera que enquadra o modelo em 1:1

  // ------------------------------------------------------------- utilidades
  function toast(msg, ms = 2600) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('visivel');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('visivel'), ms);
  }

  function rastrear(evento, extra) {
    if (!D.apiTrack) return;              // versão estática (GitHub Pages) não registra
    try {
      const corpo = JSON.stringify({ slug: D.slug, evento: evento, extra: extra || {} });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(D.apiTrack, new Blob([corpo], { type: 'application/json' }));
      } else {
        fetch(D.apiTrack, { method: 'POST', body: corpo, keepalive: true,
                            headers: { 'Content-Type': 'application/json' } });
      }
    } catch (e) { /* rastreio nunca pode quebrar a página */ }
  }

  const num = (v, c = 2) => Number(v).toLocaleString('pt-BR',
    { minimumFractionDigits: c, maximumFractionDigits: c });

  function medida(metros) {
    return metros < 1
      ? num(metros * 100, 1) + ' cm'
      : num(metros, 2) + ' m';
  }

  function zap(texto) {
    return 'https://wa.me/' + D.whatsapp + '?text=' + encodeURIComponent(texto);
  }

  function rotuloProjeto() {
    return (D.titulo || 'Projeto') + (D.codigo ? ' (' + D.codigo + ')' : '')
         + (D.cliente ? ' — ' + D.cliente : '');
  }

  // ------------------------------------------------------------- escala
  function aplicarEscala(n, silencioso) {
    escalaAtual = n;
    const f = 1 / n;
    // setAttribute (e não a propriedade) para funcionar mesmo antes do
    // custom element do model-viewer terminar de carregar
    mv.setAttribute('scale', f + ' ' + f + ' ' + f);

    const real = (n === 1);

    // Em 1:1 a escala fica travada para não distorcer a percepção de tamanho.
    // No modo maquete o cliente pode ajustar com os dedos.
    const podeRedimensionar = real ? !!D.permissoes.redimensionar_real : true;
    mv.setAttribute('ar-scale', podeRedimensionar ? 'auto' : 'fixed');

    // iPhone (AR Quick Look): o arquivo USDZ tem tamanho fixo.
    // Em 1:1 usamos o USDZ oficial; na maquete deixamos o model-viewer
    // gerar o arquivo já com a escala aplicada.
    if (D.usdz) {
      if (real) mv.setAttribute('ios-src', D.usdz);
      else      mv.removeAttribute('ios-src');
    }

    // rótulos
    const selo = $('#selo-escala');
    selo.classList.toggle('maquete', !real);
    $('#txt-escala').textContent = real ? 'Escala real 1:1' : 'Maquete 1:' + n;
    $('#txt-ar-escala').textContent = real ? '1:1' : '1:' + n;

    const d = D.dimensoes;
    $('#txt-escala-info').innerHTML = real
      ? 'O produto aparece no <b>tamanho exato de fabricação</b>: '
        + medida(d.altura) + ' de altura. Ideal para conferir no local da instalação.'
      : 'Versão reduzida para apoiar sobre uma mesa: <b>'
        + medida(d.altura / n) + ' de altura</b> ('
        + medida(d.largura / n) + ' × ' + medida(d.profundidade / n) + ').';

    document.querySelectorAll('#escalas .chip').forEach((c) =>
      c.classList.toggle('ativo', Number(c.dataset.escala) === n));

    if (mv.loaded) { enquadrar(); posicionarCotas(); desenharLinhas(); }
    if (!silencioso) rastrear('mudou_escala', { escala: n });
  }

  /** Enquadra a câmera de acordo com a escala atual (raio em metros). */
  function enquadrar() {
    if (!caixa) return;
    const s    = 1 / escalaAtual;
    const raio = Math.max(0.02, raioBase * s);
    const alvo = caixa.centro;
    mv.cameraTarget = (alvo.x * s) + 'm ' + (alvo.y * s) + 'm ' + (alvo.z * s) + 'm';
    mv.cameraOrbit  = '18deg 74deg ' + raio.toFixed(4) + 'm';
    mv.minCameraOrbit = 'auto auto ' + (raio * 0.25).toFixed(4) + 'm';
    mv.maxCameraOrbit = 'auto 92deg ' + (raio * 3).toFixed(4) + 'm';
  }

  // ------------------------------------------------------------- cotas
  function posicionarCotas() {
    if (!caixa) return;
    // as âncoras não acompanham o atributo scale: aplicamos o fator na mão
    const s      = 1 / escalaAtual;
    const min    = { x: caixa.min.x * s, y: caixa.min.y * s, z: caixa.min.z * s };
    const max    = { x: caixa.max.x * s, y: caixa.max.y * s, z: caixa.max.z * s };
    const centro = { x: caixa.centro.x * s, y: caixa.centro.y * s, z: caixa.centro.z * s };
    const alturaCx = caixa.dim.y * s;
    const frente = max.z + 0.02 * s;
    const folga  = Math.max(0.12, caixa.dim.x * 0.20) * s;   // afastamento das cotas

    const pos = (n, x, y, z) => mv.updateHotspot({ name: n, position: x + ' ' + y + ' ' + z });

    pos('hotspot-cota-altura',  min.x - folga, centro.y, frente);
    pos('hotspot-cota-largura', centro.x, min.y - folga, frente);
    pos('hotspot-cota-prof',    max.x + folga, max.y - alturaCx * 0.10, centro.z);

    // pontas das linhas: p1-p2 = altura (esquerda) | p3-p4 = largura (base)
    pos('hotspot-p1', min.x - folga, max.y, frente);
    pos('hotspot-p2', min.x - folga, min.y, frente);
    pos('hotspot-p3', min.x, min.y - folga, frente);
    pos('hotspot-p4', max.x, min.y - folga, frente);

    const d = D.dimensoes, k = escalaAtual;
    $('#cota-altura').textContent = medida(d.altura / k);
    $('#cota-largura').textContent = medida(d.largura / k);
    $('#cota-prof').textContent   = 'P ' + medida(d.profundidade / k);
    desenharLinhas();
  }

  function desenharLinhas() {
    if (!cotasVisiveis) return;
    const p1 = mv.queryHotspot('hotspot-p1');
    const p2 = mv.queryHotspot('hotspot-p2');
    const p3 = mv.queryHotspot('hotspot-p3');
    const p4 = mv.queryHotspot('hotspot-p4');
    const la = $('#l-altura'), ll = $('#l-largura');
    if (p1 && p2 && la) {
      la.setAttribute('x1', p1.canvasPosition.x); la.setAttribute('y1', p1.canvasPosition.y);
      la.setAttribute('x2', p2.canvasPosition.x); la.setAttribute('y2', p2.canvasPosition.y);
    }
    if (p3 && p4 && ll) {
      ll.setAttribute('x1', p3.canvasPosition.x); ll.setAttribute('y1', p3.canvasPosition.y);
      ll.setAttribute('x2', p4.canvasPosition.x); ll.setAttribute('y2', p4.canvasPosition.y);
    }
  }

  function alternarCotas(forcar) {
    cotasVisiveis = (forcar !== undefined) ? forcar : !cotasVisiveis;
    ['#cota-altura', '#cota-largura', '#cota-prof'].forEach((s) => {
      const el = $(s); if (el) el.style.display = cotasVisiveis ? '' : 'none';
    });
    $('#linhas-cota').style.display = cotasVisiveis ? '' : 'none';
    $('#btn-cotas').classList.toggle('ativo', cotasVisiveis);
    if (cotasVisiveis) { posicionarCotas(); rastrear('viu_medidas'); }
  }

  // ------------------------------------------------------------- acabamento
  function aplicarAcabamento(botao) {
    const cor  = botao.dataset.cor;
    const nome = botao.dataset.nome;
    const alvo = botao.dataset.material;
    acabamento = nome;

    document.querySelectorAll('#acabamentos .acab')
      .forEach((b) => b.classList.toggle('ativo', b === botao));

    // 1) se o GLB tiver variantes de material (KHR_materials_variants)
    const variantes = mv.availableVariants || [];
    const achou = variantes.find((v) => v.toLowerCase() === String(botao.dataset.id).toLowerCase()
                                     || v.toLowerCase() === String(nome).toLowerCase());
    if (achou) {
      mv.variantName = achou;
      rastrear('trocou_acabamento', { acabamento: nome, via: 'variante' });
      return;
    }

    // 2) caso contrário, troca a cor do material nomeado
    try {
      const mats = (mv.model && mv.model.materials) || [];
      const alvos = alvo ? mats.filter((m) => m.name === alvo) : mats.slice(0, 1);
      (alvos.length ? alvos : mats.slice(0, 1)).forEach((m) => {
        m.pbrMetallicRoughness.setBaseColorFactor(cor);
      });
      rastrear('trocou_acabamento', { acabamento: nome, via: 'cor' });
    } catch (e) {
      toast('Não foi possível trocar o acabamento neste modelo.');
    }
  }

  // ------------------------------------------------------------- AR
  function abrirAR() {
    if (mv.canActivateAR) {
      rastrear('iniciou_ar', { escala: escalaAtual });
      mv.activateAR();
    } else {
      $('#ar-indisponivel').hidden = false;
      $('#ar-indisponivel').scrollIntoView({ behavior: 'smooth', block: 'center' });
      rastrear('ar_indisponivel', { agente: navigator.userAgent.slice(0, 120) });
    }
  }

  // ------------------------------------------------------------- foto
  async function tirarFoto() {
    try {
      const blob = await mv.toBlob({ idealAspect: true, mimeType: 'image/png' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = (D.codigo || 'projeto') + '-' + (escalaAtual === 1 ? 'real' : '1-' + escalaAtual) + '.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast('Imagem salva no seu aparelho.');
      rastrear('capturou_foto');
    } catch (e) {
      toast('Não foi possível salvar a imagem.');
    }
  }

  // ------------------------------------------------------------- modal
  function abrirModal(titulo, texto, placeholder, aoEnviar) {
    $('#modal-titulo').textContent = titulo;
    $('#modal-texto').textContent  = texto;
    const campo = $('#modal-campo');
    campo.placeholder = placeholder;
    campo.value = '';
    $('#modal').classList.add('aberto');
    $('#modal-enviar').onclick = () => { aoEnviar(campo.value.trim()); fecharModal(); };
    setTimeout(() => campo.focus(), 120);
  }
  const fecharModal = () => $('#modal').classList.remove('aberto');

  // ------------------------------------------------------------- inicialização
  mv.addEventListener('load', () => {
    // getDimensions() devolve o tamanho já com a escala aplicada;
    // guardamos sempre o tamanho real (1:1) do modelo.
    const k  = escalaAtual;
    const dE = mv.getDimensions(), cE = mv.getBoundingBoxCenter();
    const dim = { x: dE.x * k, y: dE.y * k, z: dE.z * k };
    const c   = { x: cE.x * k, y: cE.y * k, z: cE.z * k };
    caixa = {
      centro: c,
      min: { x: c.x - dim.x / 2, y: c.y - dim.y / 2, z: c.z - dim.z / 2 },
      max: { x: c.x + dim.x / 2, y: c.y + dim.y / 2, z: c.z + dim.z / 2 },
      dim: dim
    };

    // usa o enquadramento automático do model-viewer como referência de 1:1
    const orb = mv.getCameraOrbit();
    raioBase = ((orb && orb.radius) ? orb.radius : Math.max(dim.x, dim.y, dim.z) * 2.2) * k;

    enquadrar();
    posicionarCotas();
    alternarCotas(cotasVisiveis);

    // conferência: o GLB precisa bater com as medidas do projeto
    const declarada = Number(D.dimensoes.altura);
    if (declarada > 0) {
      const erro = Math.abs(dim.y - declarada) / declarada;
      if (erro > 0.02) {
        console.warn('[Tech ProjetAR] Altura do GLB (' + dim.y.toFixed(3) +
          ' m) diverge da altura do projeto (' + declarada.toFixed(3) + ' m).');
        if (new URLSearchParams(location.search).has('debug')) {
          toast('Atenção: GLB com ' + dim.y.toFixed(2) + ' m e projeto com ' + declarada.toFixed(2) + ' m.', 6000);
        }
      }
    }

    if (!mv.canActivateAR) $('#ar-indisponivel').hidden = false;
    $('#carga').classList.add('pronta');
    rastrear('carregou_modelo');
  });

  mv.addEventListener('progress', (ev) => {
    const t = ev.detail.totalProgress;
    const f = $('#carga-fill'); if (f) f.style.width = (t * 100).toFixed(0) + '%';
    if (t === 1) $('#carga').classList.add('pronta');
  });

  mv.addEventListener('camera-change', desenharLinhas);
  window.addEventListener('resize', desenharLinhas);

  mv.addEventListener('ar-status', (ev) => {
    if (ev.detail.status === 'session-started') rastrear('ar_ativo', { escala: escalaAtual });
    if (ev.detail.status === 'failed')          toast('A realidade aumentada não pôde iniciar.');
  });

  // ------------------------------------------------------------- eventos
  document.querySelectorAll('#escalas .chip').forEach((c) =>
    c.addEventListener('click', () => aplicarEscala(Number(c.dataset.escala))));

  document.querySelectorAll('#acabamentos .acab').forEach((b) =>
    b.addEventListener('click', () => aplicarAcabamento(b)));

  $('#btn-ar').addEventListener('click', abrirAR);
  $('#btn-ar-fixo').addEventListener('click', abrirAR);
  $('#btn-cotas').addEventListener('click', () => alternarCotas());
  $('#btn-reset').addEventListener('click', () => { mv.fieldOfView = 'auto'; enquadrar(); });
  $('#btn-girar').addEventListener('click', (e) => {
    const on = !mv.hasAttribute('auto-rotate');
    on ? mv.setAttribute('auto-rotate', '') : mv.removeAttribute('auto-rotate');
    e.currentTarget.classList.toggle('ativo', on);
  });
  const btnFoto = $('#btn-foto');
  if (btnFoto) btnFoto.addEventListener('click', tirarFoto);

  $('#btn-aprovar').addEventListener('click', () => {
    abrirModal('Aprovar projeto',
      'Confirme a aprovação. Se quiser, escreva alguma observação para a produção.',
      'Observações (opcional)',
      (txt) => {
        rastrear('aprovou', { acabamento: acabamento, observacao: txt });
        const msg = 'APROVAÇÃO DE PROJETO\n' + rotuloProjeto()
          + (acabamento ? '\nAcabamento escolhido: ' + acabamento : '')
          + (txt ? '\nObservações: ' + txt : '')
          + '\n\n' + D.link;
        window.open(zap(msg), '_blank');
        toast('Aprovação registrada. Abrindo o WhatsApp...');
      });
  });

  $('#btn-alterar').addEventListener('click', () => {
    abrirModal('Solicitar alteração',
      'Descreva o que deseja ajustar. A mensagem será enviada para a equipe da Tech pelo WhatsApp.',
      'Ex.: aumentar a testeira, trocar a cor do ACM, mudar a ordem dos combustíveis...',
      (txt) => {
        if (!txt) { toast('Escreva a alteração desejada.'); return; }
        rastrear('pediu_alteracao', { texto: txt });
        const msg = 'SOLICITAÇÃO DE ALTERAÇÃO\n' + rotuloProjeto()
          + (acabamento ? '\nAcabamento visualizado: ' + acabamento : '')
          + '\n\nAlteração: ' + txt + '\n\n' + D.link;
        window.open(zap(msg), '_blank');
      });
  });

  $('#modal-cancelar').addEventListener('click', fecharModal);
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') fecharModal(); });

  $('#btn-whats').href = zap('Olá! Estou vendo o projeto ' + rotuloProjeto() + '.\n' + D.link);
  $('#btn-whats').addEventListener('click', () => rastrear('falou_whatsapp'));

  // tempo de permanência
  const inicio = Date.now();
  window.addEventListener('pagehide', () =>
    rastrear('saiu', { segundos: Math.round((Date.now() - inicio) / 1000) }));

  // estado inicial
  aplicarEscala(1, true);
})();
