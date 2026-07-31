/* ==========================================================================
   Ponte de compatibilidade do Three.js
   ==========================================================================
   A biblioteca de efeitos do model-viewer (usada para a oclusão ambiental)
   ainda procura duas constantes que o Three removeu nas versões novas.
   Sem elas o módulo nem carrega.

   Este arquivo repassa o Three inteiro e devolve as duas constantes com os
   valores históricos, permitindo que a biblioteca de efeitos funcione.
   ========================================================================== */

export * from 'https://cdn.jsdelivr.net/npm/three@0.183.0/build/three.module.min.js';

// valores originais da tabela de formatos de textura do Three
export const LuminanceFormat = 1024;
export const LuminanceAlphaFormat = 1025;
