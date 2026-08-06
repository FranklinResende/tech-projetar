/* ==========================================================================
   Tech ProjetAR — versão estática (GitHub Pages / qualquer hospedagem simples)
   Monta a página do cliente a partir de projetos.json e depois
   carrega o mesmo viewer.js usado na versão PHP.
   Arquivo-fonte: tools/estatico.js  →  copiado para static/assets/js/
   ========================================================================== */
(async function () {
  'use strict';

  const app = document.getElementById('app');
  const esc = (t) => String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const num = (v, c = 2) => Number(v).toLocaleString('pt-BR',
    { minimumFractionDigits: c, maximumFractionDigits: c });
  const med = (m) => num(m) + ' m';

  function erro(msg) {
    app.innerHTML = '<div class="container" style="padding-top:60px;text-align:center">' +
      '<div class="marca-selo" style="margin:0 auto 18px;width:44px;height:44px;font-size:16px">T</div>' +
      '<h1>Projeto indisponível</h1><p class="subtitulo">' + esc(msg) + '</p></div>';
  }

  // sem cache nos cadastros: o cliente precisa ver sempre a versão atual.
  // (o modelo 3D continua em cache, porque o nome do arquivo muda a cada projeto)
  const buscar = (arq) =>
    fetch(arq + '?v=' + Date.now(), { cache: 'no-store' }).then((r) => r.json());

  let cfg, lista;
  try {
    [cfg, lista] = await Promise.all([
      buscar('config.json'),
      buscar('projetos.json'),
    ]);
  } catch (e) {
    return erro('Não foi possível carregar os dados do projeto.');
  }

  const slug = new URLSearchParams(location.search).get('id') || (lista[0] && lista[0].slug);
  const p    = lista.find((x) => x.slug === slug);
  if (!p || p.publicado === false) return erro('Projeto não encontrado ou link desativado.');

  const d   = p.dimensoes;
  const zap = 'https://wa.me/' + cfg.whatsapp;
  document.title = p.titulo + ' — ' + p.cliente + ' | ' + cfg.app;

  const maquetes = (p.escalas && p.escalas.maquete) || [10, 20, 50];
  const perm     = p.permissoes || {};

  app.innerHTML = `
<header class="topo">
  <div class="topo-inner">
    <div class="marca-selo">T</div>
    <div>
      <div class="marca" style="font-size:14px">${esc(cfg.empresa)}</div>
      <div class="topo-sub">${esc(cfg.app)} · ${esc(p.codigo || '')}</div>
    </div>
    <a class="topo-acao btn btn-pequeno btn-fantasma" href="${zap}?text=${encodeURIComponent('Olá! Estou vendo o projeto ' + (p.codigo || '') + ' — ' + p.titulo)}">Ajuda</a>
  </div>
</header>

<div class="palco">
  <model-viewer id="mv"
      src="${esc(p.modelo.glb)}"
      ${p.modelo.usdz ? 'ios-src="' + esc(p.modelo.usdz) + '"' : ''}
      ${p.modelo.poster ? 'poster="' + esc(p.modelo.poster) + '"' : ''}
      alt="${esc(p.titulo)}"
      ar ar-modes="webxr scene-viewer quick-look" ar-scale="fixed" ar-placement="floor"
      camera-controls touch-action="pan-y"
      shadow-intensity="2.2" shadow-softness="0.32" exposure="1.15"
      tone-mapping="neutral" environment-image="estudio.hdr"
      max-camera-orbit="auto 89deg auto"
      interaction-prompt="auto" loading="eager">

    <effect-composer id="efeitos">
      <ssao-effect strength="4.5"></ssao-effect>
      <smaa-effect></smaa-effect>
    </effect-composer>

    <div class="carga" slot="progress-bar" id="carga"><div class="carga-fill" id="carga-fill"></div></div>

    <div class="selo-escala" id="selo-escala"><span class="ponto"></span><span id="txt-escala">Escala real 1:1</span></div>
    <div class="selo-medidas">A <b>${num(d.altura)} m</b><br>L <b>${num(d.largura)} m</b><br>P <b>${num(d.profundidade)} m</b></div>

    <button slot="hotspot-cota-altura" class="cota" data-position="0 0 0" data-normal="0 0 1" data-visibility-attribute="visible" id="cota-altura">—</button>
    <button slot="hotspot-cota-largura" class="cota" data-position="0 0 0" data-normal="0 1 0" data-visibility-attribute="visible" id="cota-largura">—</button>
    <button slot="hotspot-cota-prof" class="cota" data-position="0 0 0" data-normal="1 0 0" data-visibility-attribute="visible" id="cota-prof">—</button>
    <button slot="hotspot-p1" class="ponta" data-position="0 0 0"></button>
    <button slot="hotspot-p2" class="ponta" data-position="0 0 0"></button>
    <button slot="hotspot-p3" class="ponta" data-position="0 0 0"></button>
    <button slot="hotspot-p4" class="ponta" data-position="0 0 0"></button>
    <button slot="hotspot-h1" class="ponta" data-position="0 0 0"></button>
    <button slot="hotspot-h2" class="ponta" data-position="0 0 0"></button>
    <button slot="hotspot-rot-pessoa" class="cota" data-position="0 0 0" id="rotulo-pessoa">1,75 m</button>

    <svg id="linhas-cota" xmlns="http://www.w3.org/2000/svg">
      <line id="l-altura"></line><line id="l-largura"></line>
      <g id="pessoa" style="display:none">
        <circle cx="50" cy="26" r="24"/>
        <rect x="26" y="56" width="48" height="120" rx="18"/>
        <rect x="11" y="62" width="16" height="102" rx="8"/>
        <rect x="73" y="62" width="16" height="102" rx="8"/>
        <rect x="30" y="168" width="17" height="177" rx="8"/>
        <rect x="53" y="168" width="17" height="177" rx="8"/>
      </g>
    </svg>

    <div class="carregando" id="carregando">
      <div class="pct" id="carga-pct">0%</div>
      <div class="txt">Carregando o projeto em 3D</div>
    </div>

    <div class="barra-palco">
      <button class="btn-redondo" id="btn-cotas" aria-label="Medidas"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 7h18M3 7v10M21 7v10M3 17h18M7 7v3M11 7v3M15 7v3M19 7v3"/></svg></button>
      <button class="btn-redondo" id="btn-pessoa" aria-label="Comparar com uma pessoa"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="5" r="3"/><path d="M12 8v7M8 22l4-7 4 7M7 11h10"/></svg></button>
      <button class="btn-redondo" id="btn-girar" aria-label="Girar"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/></svg></button>
      ${perm.captura === false ? '' : '<button class="btn-redondo" id="btn-foto" aria-label="Foto"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></button>'}
      <button class="btn-redondo" id="btn-reset" aria-label="Enquadrar"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"/></svg></button>
    </div>
  </model-viewer>
</div>

<main class="container">
  <section class="secao">
    <h1>${esc(p.titulo)}</h1>
    <p class="subtitulo">${esc(p.cliente)} · ${esc(p.produto || '')}</p>

    <div class="identificacao">
      ${p.codigo ? '<span class="tag">' + esc(p.codigo) + '</span>' : ''}
      <span class="tag ok">Medidas reais conferidas</span>
    </div>

    <dl class="medidas-resumo">
      <div><dt>Altura</dt><dd>${num(d.altura)}<small>m</small></dd></div>
      <div><dt>Largura</dt><dd>${num(d.largura)}<small>m</small></dd></div>
      <div><dt>Profund.</dt><dd>${num(d.profundidade)}<small>m</small></dd></div>
    </dl>

    ${p.descricao ? '<p style="font-size:14px;color:var(--texto2);margin:0 0 16px">' + esc(p.descricao) + '</p>' : ''}
    <div class="botoes">
      <button class="btn btn-primario" id="btn-ar">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="m3 7 9 5 9-5M12 12v10"/></svg>
        Ver no meu espaço
      </button>
      <div id="ar-indisponivel" class="aviso" hidden><span>⚠️</span>
        <div>Este aparelho ou navegador não abriu a realidade aumentada. Use o <b>Chrome no Android</b> ou o <b>Safari no iPhone</b>. A visualização em 3D continua funcionando normalmente.</div>
      </div>
    </div>
  </section>

  <section class="secao">
    <h2 class="secao-titulo">Escala de visualização</h2>
    <div class="escalas" id="escalas">
      <button class="chip ativo" data-escala="1">Tamanho real<small>1:1 — no local</small></button>
      ${maquetes.map((m) => `<button class="chip" data-escala="${m}">Maquete<small>1:${m} — sobre a mesa</small></button>`).join('')}
    </div>
    <p style="font-size:12px;color:var(--texto2);margin:12px 0 0" id="txt-escala-info"></p>
  </section>

  ${(p.acabamentos || []).length ? `
  <section class="secao">
    <h2 class="secao-titulo">Escolha o acabamento</h2>
    <div class="acabamentos" id="acabamentos">
      ${p.acabamentos.map((a, i) => `
        <button class="acab ${i === 0 ? 'ativo' : ''}" data-id="${esc(a.id)}" data-cor="${esc(a.cor)}"
                data-material="${esc(a.material || '')}" data-nome="${esc(a.nome)}">
          <span class="acab-bola" style="background:${esc(a.cor)}"></span><span>${esc(a.nome)}</span>
        </button>`).join('')}
    </div>
  </section>` : ''}

  <section class="secao">
    <h2 class="secao-titulo">Como visualizar no seu posto</h2>
    <ol class="passos">
      <li>Aponte a câmera para o chão, a cerca de 2 metros de distância.</li>
      <li>Movimente o celular lentamente até a superfície ser reconhecida.</li>
      <li>Toque no ponto exato onde o produto será instalado.</li>
      <li>Afaste-se caminhando para ver a peça inteira em tamanho real.</li>
    </ol>
  </section>

  <section class="secao">
    <h2 class="secao-titulo">Ficha técnica</h2>
    <dl class="ficha">
      <div class="ficha-linha"><dt>Altura</dt><dd>${med(d.altura)}</dd></div>
      <div class="ficha-linha"><dt>Largura</dt><dd>${med(d.largura)}</dd></div>
      <div class="ficha-linha"><dt>Profundidade</dt><dd>${med(d.profundidade)}</dd></div>
      ${(p.ficha || []).map((f) => `<div class="ficha-linha"><dt>${esc(f.rotulo)}</dt><dd>${esc(f.valor)}</dd></div>`).join('')}
      <div class="ficha-linha"><dt>Projeto</dt><dd>${esc(p.codigo || '—')}</dd></div>
    </dl>
  </section>

  <section class="secao">
    <h2 class="secao-titulo">Sua decisão</h2>
    <div class="botoes-2">
      <button class="btn btn-ok" id="btn-aprovar">Aprovar projeto</button>
      <button class="btn" id="btn-alterar">Solicitar alteração</button>
    </div>
    <div class="botoes" style="margin-top:10px">
      <a class="btn btn-zap" id="btn-whats" href="#">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.2-1.7-.9-2-1-.3-.1-.5-.1-.7.1s-.7 1-.9 1.2c-.2.2-.3.2-.6.1s-1.2-.5-2.3-1.4c-.9-.8-1.4-1.7-1.6-2s0-.4.1-.6l.4-.5c.1-.2.2-.3.3-.5s0-.4 0-.5c-.1-.1-.7-1.5-.9-2.1-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5 4.5.7.3 1.2.5 1.7.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.5-.3M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2"/></svg>
        Falar com a ${esc(cfg.empresa)}
      </a>
    </div>
  </section>

  <div class="rodape"><strong>${esc(cfg.empresa)}</strong>${esc(cfg.slogan)}</div>
</main>

<div class="barra-fixa">
  <button class="btn btn-primario" id="btn-ar-fixo">Ver no meu espaço · <span id="txt-ar-escala">1:1</span></button>
</div>

<div class="modal" id="modal">
  <div class="modal-caixa">
    <h3 id="modal-titulo">Solicitar alteração</h3>
    <p id="modal-texto"></p>
    <textarea class="campo" id="modal-campo"></textarea>
    <div class="botoes-2">
      <button class="btn btn-fantasma" id="modal-cancelar">Cancelar</button>
      <button class="btn btn-zap" id="modal-enviar">Enviar</button>
    </div>
  </div>
</div>`;

  // dados para o viewer.js
  const dados = document.createElement('script');
  dados.id = 'dados-projeto';
  dados.type = 'application/json';
  dados.textContent = JSON.stringify({
    slug: p.slug, titulo: p.titulo, cliente: p.cliente, codigo: p.codigo,
    dimensoes: d, usdz: p.modelo.usdz || '', permissoes: perm,
    escalaPadrao: (p.escalas && p.escalas.padrao) || 1,
    foco: p.foco || null,
    whatsapp: cfg.whatsapp, link: location.href, apiTrack: '',
  });
  document.body.appendChild(dados);

  const js = document.createElement('script');
  js.src = 'viewer.js?v=1785977671';
  document.body.appendChild(js);
})();
