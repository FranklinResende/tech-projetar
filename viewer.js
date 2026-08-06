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
  let cotasVisiveis  = false;
  let pessoaVisivel  = false;   // silhueta de 1,75 m ao lado do modelo
  let raioBase       = 0;       // distância de câmera que enquadra o modelo em 1:1
  const ALTURA_PESSOA = 1.75;   // metros

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

    const d     = D.dimensoes;
    const maior = Math.max(d.altura, d.largura, d.profundidade);
    let texto;
    if (real) {
      texto = 'O projeto aparece no <b>tamanho exato de fabricação</b>: '
            + medida(d.altura) + ' de altura por ' + medida(d.largura) + ' de largura.';
      if (maior > 20) {
        texto += ' <b>Atenção:</b> uma peça deste porte só cabe inteira no terreno. '
               + 'Para ver em reunião ou sobre a mesa, use uma das maquetes abaixo.';
      } else {
        texto += ' Ideal para conferir no local da instalação.';
      }
    } else {
      texto = 'Versão reduzida: <b>' + medida(d.largura / n) + ' × ' + medida(d.profundidade / n)
            + '</b>, com ' + medida(d.altura / n) + ' de altura.';
      const area = Math.max(d.largura, d.profundidade) / n;
      texto += area <= 1.2 ? ' Cabe sobre uma mesa.'
             : (area <= 4 ? ' Cabe no chão de uma sala.' : ' Precisa de um espaço amplo.');
    }
    $('#txt-escala-info').innerHTML = texto;

    document.querySelectorAll('#escalas .chip').forEach((c) =>
      c.classList.toggle('ativo', Number(c.dataset.escala) === n));

    if (mv.loaded) { enquadrar(); posicionarCotas(); desenharLinhas(); }
    if (!silencioso) rastrear('mudou_escala', { escala: n });
  }

  /** Enquadra a câmera de acordo com a escala atual (raio em metros).
      Se o projeto tiver um foco definido (a área construída, e não o
      terreno inteiro), a câmera abre já olhando para ele. */
  function enquadrar() {
    if (!caixa) return;
    const s = 1 / escalaAtual;

    let alvo = caixa.centro;
    let raio = raioBase;
    let angulo = '18deg 74deg ';

    const f = D.foco;
    if (f && Array.isArray(f.centro) && f.raio > 0) {
      alvo   = { x: f.centro[0], y: f.centro[1], z: f.centro[2] };
      raio   = f.raio;
      angulo = '30deg 68deg ';        // ângulo de perspectiva para arquitetura
    }

    raio = Math.max(0.02, raio * s);
    mv.cameraTarget = (alvo.x * s) + 'm ' + (alvo.y * s) + 'm ' + (alvo.z * s) + 'm';
    mv.cameraOrbit  = angulo + raio.toFixed(4) + 'm';
    mv.minCameraOrbit = 'auto auto ' + (raio * 0.15).toFixed(4) + 'm';
    mv.maxCameraOrbit = 'auto 92deg ' + (raio * 4).toFixed(4) + 'm';
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

    // silhueta humana: fica ao lado da área construída (ou do modelo),
    // sempre apoiada no mesmo chão
    const f = D.foco;
    const xPessoa = (f && Array.isArray(f.centro))
      ? (f.centro[0] + (f.largura || 0) / 2 + 3) * s
      : max.x + folga * 2.2;
    const zPessoa = (f && Array.isArray(f.centro)) ? f.centro[2] * s : centro.z;
    const alturaP = ALTURA_PESSOA * s;
    pos('hotspot-h1', xPessoa, min.y, zPessoa);
    pos('hotspot-h2', xPessoa, min.y + alturaP, zPessoa);
    pos('hotspot-rot-pessoa', xPessoa, min.y + alturaP + 0.4 * s, zPessoa);

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
    desenharPessoa();
  }

  /** Silhueta de 1,75 m desenhada entre dois pontos ancorados na cena 3D,
      por isso ela acompanha a perspectiva e a escala escolhida. */
  function desenharPessoa() {
    const g = $('#pessoa');
    if (!g) return;
    if (!pessoaVisivel) { g.style.display = 'none'; return; }

    const pe   = mv.queryHotspot('hotspot-h1');
    const topo = mv.queryHotspot('hotspot-h2');
    if (!pe || !topo) { g.style.display = 'none'; return; }

    const alturaPx = pe.canvasPosition.y - topo.canvasPosition.y;
    if (!(alturaPx > 6)) { g.style.display = 'none'; return; }

    const k = alturaPx / 345;                       // o desenho tem 345 de altura
    g.style.display = '';
    g.setAttribute('transform',
      'translate(' + (topo.canvasPosition.x - 50 * k) + ' ' + topo.canvasPosition.y + ') scale(' + k + ')');
  }

  function alternarPessoa() {
    pessoaVisivel = !pessoaVisivel;
    $('#btn-pessoa').classList.toggle('ativo', pessoaVisivel);
    const rot = $('#rotulo-pessoa');
    if (rot) rot.style.display = pessoaVisivel ? '' : 'none';
    desenharPessoa();
    if (pessoaVisivel) rastrear('viu_medidas', { referencia: 'pessoa' });
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

  /* ---------------------------------------------------------------------
     Realismo dos materiais
     ---------------------------------------------------------------------
     A exportação do SketchUp/SimLab entrega todos os materiais iguais:
     metal 0, rugosidade 0,5. Aço, acrílico, vidro e painel impresso ficam
     com o mesmo comportamento de luz — e o resultado parece papel.

     Aqui o próprio nome do material (que vem do projeto) diz como ele deve
     reagir à luz. Só entra em ação quando o modelo está realmente chapado;
     se o projetista já ajustou os materiais, nada é alterado.
  --------------------------------------------------------------------- */
  const REGRAS_MATERIAL = [
    { re: /espelho|mirror/i,                                    metal: 1.00, rug: 0.05 },
    { re: /cromo|chrome|inox|niquel|níquel/i,                    metal: 0.95, rug: 0.12 },
    { re: /metal|steel|a[çc]o|alum[ií]nio|ferro|galvani/i,       metal: 0.85, rug: 0.30 },
    { re: /vidro|glass|acr[ií]lic|cristal|policarb/i,            metal: 0.00, rug: 0.06 },
    { re: /led|luminoso|neon|lamp|light|luz/i,                   metal: 0.00, rug: 0.22 },
    { re: /acm|pintura|paint|esmalte|laca|automotiv/i,           metal: 0.05, rug: 0.34 },
    { re: /adesiv|vinil|lona|impress|grafic|gr[áa]fic/i,         metal: 0.00, rug: 0.45 },
    { re: /concreto|cimento|piso|asfalto|blacktop|paver|tile/i,  metal: 0.00, rug: 0.93 },
    { re: /grama|folha|planta|[áa]rvore|vegeta|daun|batang/i,    metal: 0.00, rug: 0.88 },
    { re: /tecido|linen|fabric|couro|leather/i,                  metal: 0.00, rug: 0.90 },
    { re: /borracha|rubber|pneu|tire/i,                          metal: 0.00, rug: 0.95 },
  ];

  // materiais já tratados, para não mexer duas vezes nem perder os que
  // chegam atrasados (o modelo carrega em partes)
  const jaTratados = new WeakSet();

  function aplicarRealismo(tentativa) {
    tentativa = tentativa || 0;
    try {
      const mats = (mv.model && mv.model.materials) || [];

      // a lista de materiais nem sempre está pronta junto com o modelo
      if (!mats.length) {
        if (tentativa < 25) setTimeout(() => aplicarRealismo(tentativa + 1), 150);
        return;
      }

      let novos = 0, porNome = 0;
      mats.forEach((m) => {
        if (jaTratados.has(m)) return;
        jaTratados.add(m);
        novos++;

        const p = m.pbrMetallicRoughness;

        // material já configurado pelo projetista: respeitar como está
        if (p.metallicFactor > 0.1) return;

        const regra = REGRAS_MATERIAL.find((r) => r.re.test(m.name || ''));
        if (regra) {
          p.setMetallicFactor(regra.metal);
          p.setRoughnessFactor(regra.rug);
          porNome++;
        } else {
          // sem pista no nome: um leve brilho, o suficiente para a peça
          // deixar de parecer recortada em papel
          p.setRoughnessFactor(Math.max(0.28, p.roughnessFactor * 0.82));
        }
      });

      if (novos) {
        console.info('[Tech ProjetAR] realismo: ' + novos + ' materiais tratados, '
                   + porNome + ' reconhecidos pelo nome.');
      }
      // o modelo pode continuar chegando em partes
      if (tentativa < 12) setTimeout(() => aplicarRealismo(tentativa + 1), 400);
    } catch (e) {
      // realismo é enfeite: nunca pode derrubar o visualizador
    }
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
  let preparado = false;

  function preparar() {
    if (preparado || !mv.loaded || !mv.model) return;
    preparado = true;
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

    /* Trava de aproximação. Num posto inteiro de 200 m o giro acontece em
       torno do centro do terreno: continuar aproximando não chega mais perto
       de nada, só enfia a câmera para dentro do prédio — e o cliente vê meia
       tela preta achando que o projeto está quebrado.
       O limite fica em 12% do enquadramento, o suficiente para ler uma
       testeira de perto sem atravessar parede. */
    mv.setAttribute('min-camera-orbit', 'auto auto ' + (raioBase * 0.12) + 'm');

    aplicarRealismo();
    enquadrar();
    posicionarCotas();
    alternarCotas(cotasVisiveis);
    const rot = $('#rotulo-pessoa');
    if (rot && !pessoaVisivel) rot.style.display = 'none';
    desenharPessoa();

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
    const ov = $('#carregando'); if (ov) { ov.classList.add('pronto'); setTimeout(() => ov.remove(), 500); }
    ['#btn-ar', '#btn-ar-fixo'].forEach((s) => { const b = $(s); if (b) b.disabled = false; });
    rastrear('carregou_modelo');
  }

  // o evento 'load' nem sempre chega (modelo vindo do cache do navegador),
  // por isso além dele verificamos o estado por alguns segundos
  // O model-viewer pode recarregar o modelo mais de uma vez; cada recarga
  // devolve os materiais ao estado do arquivo. Por isso o realismo é
  // reaplicado a cada carga, enquanto a preparação acontece uma vez só.
  mv.addEventListener('load', () => {
    preparar();
    aplicarRealismo();
    setTimeout(aplicarRealismo, 600);
  });
  const relogio = setInterval(() => {
    preparar();
    if (preparado) clearInterval(relogio);
  }, 150);
  setTimeout(() => clearInterval(relogio), 40000);

  mv.addEventListener('progress', (ev) => {
    const t = ev.detail.totalProgress;
    const f = $('#carga-fill'); if (f) f.style.width = (t * 100).toFixed(0) + '%';
    const p = $('#carga-pct');  if (p) p.textContent = Math.round(t * 100) + '%';
    if (t === 1) $('#carga').classList.add('pronta');
  });

  mv.addEventListener('camera-change', desenharLinhas);
  window.addEventListener('resize', desenharLinhas);

  mv.addEventListener('ar-status', (ev) => {
    if (ev.detail.status === 'session-started') rastrear('ar_ativo', { escala: escalaAtual });
    if (ev.detail.status === 'failed')          toast('A realidade aumentada não pôde iniciar.');
  });

  /* No celular os botões de escala e de acabamento ficam abaixo do modelo.
     Sem isto o cliente troca para maquete, ou muda a cor, e não vê nada
     acontecer — a peça mudou fora da tela. */
  function verPalco() {
    const palco = document.querySelector('.palco');
    if (!palco) return;
    const r = palco.getBoundingClientRect();
    const visivel = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
    if (visivel > r.height * 0.55) return;      // já está à vista
    palco.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* Quatro escalas não cabem na largura de um celular. A borda direita
     desbotada avisa que a lista corre para o lado. */
  function marcarRolagem() {
    const e = $('#escalas');
    if (!e) return;
    const sobra = e.scrollWidth - e.clientWidth - e.scrollLeft;
    e.classList.toggle('tem-mais', sobra > 8);
  }

  // ------------------------------------------------------------- eventos
  document.querySelectorAll('#escalas .chip').forEach((c) =>
    c.addEventListener('click', () => { aplicarEscala(Number(c.dataset.escala)); verPalco(); }));

  const listaEscalas = $('#escalas');
  if (listaEscalas) {
    listaEscalas.addEventListener('scroll', marcarRolagem, { passive: true });
    window.addEventListener('resize', marcarRolagem);
    marcarRolagem();
    setTimeout(marcarRolagem, 300);
  }

  document.querySelectorAll('#acabamentos .acab').forEach((b) =>
    b.addEventListener('click', () => { aplicarAcabamento(b); verPalco(); }));

  $('#btn-ar').addEventListener('click', abrirAR);
  $('#btn-ar-fixo').addEventListener('click', abrirAR);
  $('#btn-cotas').addEventListener('click', () => alternarCotas());
  const btnPessoa = $('#btn-pessoa');
  if (btnPessoa) btnPessoa.addEventListener('click', alternarPessoa);
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
  if (!mv.loaded) {
    ['#btn-ar', '#btn-ar-fixo'].forEach((s) => { const b = $(s); if (b) b.disabled = true; });
  }
  aplicarEscala(Number(D.escalaPadrao) > 0 ? Number(D.escalaPadrao) : 1, true);
})();
