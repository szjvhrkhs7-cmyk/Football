(() => {
  const portraits = [
    '<svg class="stage8-portrait-svg" viewBox="0 0 90 110" aria-hidden="true"><path d="M28 100c2-17 10-26 18-28 11-3 21 3 26 12 3 5 5 10 6 16M34 50c0-18 8-31 21-31s21 13 21 31c0 14-8 27-21 27S34 64 34 50Z"/><path d="M38 42c7-2 12-7 17-15 5 7 10 11 19 14M43 53c3 2 6 2 9 0M59 53c3 2 6 2 9 0M50 64c4 2 8 2 12 0M29 92l16-8M77 91l-15-8"/><path class="shade" d="M39 36l-5 13M43 32l-6 17M67 34l7 16M70 39l5 13M38 88l17 9M42 83l20 14M49 81l17 14"/></svg>',
    '<svg class="stage8-portrait-svg" viewBox="0 0 90 110" aria-hidden="true"><path d="M25 101c2-15 9-24 18-28 12-5 25-1 32 10 4 6 6 12 7 18M31 51c0-20 10-34 24-34 15 0 24 14 24 34 0 15-9 27-24 27-14 0-24-12-24-27Z"/><path d="M31 43c4-17 13-25 24-26 12 2 20 11 24 25M30 40c5 3 9 4 15 4M80 40c-5 3-10 4-16 4M41 55c3-2 6-2 9 0M61 55c3-2 6-2 9 0M50 66c3 2 7 2 11 0M36 81l17 14M72 81 57 95"/><path class="shade" d="M33 37l-5 10M37 30l-7 12M72 31l7 12M75 37l5 10M38 89l18 10M45 84l17 12"/></svg>',
    '<svg class="stage8-portrait-svg" viewBox="0 0 90 110" aria-hidden="true"><path d="M20 101c4-17 11-25 21-29 10-4 21-2 29 5 7 6 11 14 13 24M31 48c0-20 9-33 24-33 14 0 24 13 24 33 0 18-10 31-24 31-15 0-24-13-24-31Z"/><path d="M28 39c9-3 17-11 24-22 8 9 17 15 27 20M40 52c3-1 6-1 9 0M62 52c3-1 6-1 9 0M47 64c5 4 11 4 16 0M38 71c3 9 9 15 17 17 9-2 15-8 19-18M28 92l18-8M80 92l-18-8"/><path class="shade" d="M35 35l-6 14M39 30l-7 16M71 31l6 16M75 37l5 12M44 84l11 16M61 84l-6 16"/></svg>',
    '<svg class="stage8-portrait-svg" viewBox="0 0 90 110" aria-hidden="true"><path d="M22 101c3-16 10-25 20-29 11-4 24-1 31 8 5 6 8 13 9 21M30 51c0-21 10-35 25-35 15 0 25 14 25 35 0 16-10 29-25 29S30 67 30 51Z"/><path d="M29 40c5-13 14-21 26-24 13 3 21 11 25 24M39 53c3-2 6-2 9 0M62 53c3-2 6-2 9 0M49 66c4 3 9 3 13 0M28 92l18-8M81 92l-18-8M35 28l-8 8M75 27l8 9"/><path class="shade" d="M34 37l-5 12M38 31l-6 15M72 31l6 16M76 37l5 12M42 84l15 14M64 84l-8 14"/></svg>',
    '<svg class="stage8-portrait-svg" viewBox="0 0 90 110" aria-hidden="true"><path d="M19 102c3-18 12-28 23-31 13-4 27 1 34 12 4 6 6 12 7 19M31 49c0-20 9-34 24-34s24 14 24 34c0 18-9 31-24 31S31 67 31 49Z"/><path d="M28 42c6-15 15-24 27-27 12 3 21 12 27 27M39 53c3-2 6-2 9 0M62 53c3-2 6-2 9 0M48 64c5 4 11 4 16 0M38 69c2 13 9 20 17 21 8-1 15-8 18-21M30 92l18-7M79 92l-17-7"/><path class="shade" d="M32 34l-5 13M36 29l-6 15M74 31l6 14M78 36l5 12M43 84l12 16M63 84l-8 16"/></svg>'
  ];

  const atlasArt = {
    'black-harbor': '<svg class="stage8-atlas-svg" viewBox="0 0 240 140" aria-hidden="true"><path d="M8 113h224M16 100h208M34 100V64l24-18 22 18v36M91 100V53l29-25 29 25v47M162 100V65l21-15 22 15v35M20 78h48M94 69h50M169 78h31M34 116c18-8 35-8 53 0 18 8 38 8 60 0 19-7 41-7 65 0"/><path d="M120 28v-16M120 13l28 12M120 13l-19 17M184 50V32M184 33l18 9M184 33l-12 12"/></svg>',
    order: '<svg class="stage8-atlas-svg" viewBox="0 0 240 140" aria-hidden="true"><circle cx="120" cy="70" r="44"/><circle cx="120" cy="70" r="32"/><path d="m120 25 9 32 32-9-26 22 26 22-32-9-9 32-9-32-32 9 26-22-26-22 32 9 9-32Z"/><path d="M56 116h128M72 124h96"/></svg>',
    compass: '<svg class="stage8-atlas-svg" viewBox="0 0 240 140" aria-hidden="true"><circle cx="120" cy="70" r="45"/><circle cx="120" cy="70" r="31"/><path d="M120 12v21M120 107v21M62 70h21M157 70h21M137 53l-10 24-24 10 10-24 24-10Z"/><path d="M120 18c27 0 52 23 52 52s-25 52-52 52-52-23-52-52 25-52 52-52Z"/></svg>',
    beast: '<svg class="stage8-atlas-svg" viewBox="0 0 240 140" aria-hidden="true"><path d="M26 104c10-33 31-54 61-61 15-3 30 1 42 12l15-22 30 5-16 19c22 10 37 27 46 51-18-7-36-7-52-1-15 5-27 13-36 26-10-20-27-31-52-31l-19 14-12-12c-14-1-27 4-39 15Z"/><path d="M123 57l18 17M146 31l15 6M85 62l-13 13M78 49l-18 8"/></svg>'
  };

  function currentCharacterIndex() {
    const idx = data.characters.findIndex((item) => item.id === state.selectedCharacterId);
    return Math.max(0, idx);
  }
  function currentAtlasId() {
    return data.atlas.find((item) => item.id === state.selectedAtlasId)?.id || data.atlas[0]?.id;
  }
  function replacePortrait(host, index) {
    if (!host || host.dataset.stage8Portrait === String(index)) return;
    host.dataset.stage8Portrait = String(index);
    host.style.backgroundImage = 'none';
    host.innerHTML = portraits[index % portraits.length];
  }
  function replaceAtlasArt(host, id) {
    if (!host) return;
    const key = atlasArt[id] ? id : 'compass';
    if (host.dataset.stage8AtlasArt === key) return;
    host.dataset.stage8AtlasArt = key;
    host.style.backgroundImage = 'none';
    host.innerHTML = atlasArt[key];
  }
  function enhanceCharacterSearch() {
    if (state.section !== 'characters') return;
    const strip = document.querySelector('.character-index .search-strip');
    if (!strip || strip.dataset.stage8Search === '1') return;
    strip.dataset.stage8Search = '1';
    strip.classList.add('stage8-character-search');
    const oldText = strip.querySelector('span:not(.icon)');
    if (oldText) {
      const input = document.createElement('input');
      input.type = 'search';
      input.placeholder = 'Поиск персонажей...';
      input.autocomplete = 'off';
      input.setAttribute('aria-label', 'Поиск персонажей');
      oldText.replaceWith(input);
      input.addEventListener('input', () => {
        const query = input.value.trim().toLocaleLowerCase('ru');
        let visible = 0;
        document.querySelectorAll('.character-row').forEach((row) => {
          const text = row.textContent.toLocaleLowerCase('ru');
          const show = !query || text.includes(query);
          row.hidden = !show;
          if (show) visible += 1;
        });
        let empty = document.querySelector('.stage8-empty-search');
        if (!visible && query) {
          if (!empty) {
            empty = document.createElement('div');
            empty.className = 'stage8-empty-search';
            empty.textContent = 'Никого не найдено';
            document.querySelector('.character-list')?.append(empty);
          }
        } else {
          empty?.remove();
        }
      });
    }
  }
  function enhanceCharacters() {
    if (state.section !== 'characters') return;
    document.querySelectorAll('.character-row').forEach((row, index) => replacePortrait(row.querySelector('.character-thumb'), index));
    replacePortrait(document.querySelector('.portrait-frame .portrait-image'), currentCharacterIndex());
  }
  function enhanceAtlas() {
    if (state.section !== 'atlas') return;
    document.querySelectorAll('.atlas-tile').forEach((tile, index) => {
      const entry = data.atlas[index];
      replaceAtlasArt(tile.querySelector('.atlas-tile-image'), entry?.id || 'compass');
    });
    replaceAtlasArt(document.querySelector('.atlas-hero-image'), currentAtlasId());
  }
  function enhance() {
    enhanceCharacterSearch();
    enhanceCharacters();
    enhanceAtlas();
  }
  const app = document.querySelector('#app');
  if (!app) return;
  const observer = new MutationObserver(() => queueMicrotask(enhance));
  observer.observe(app, { childList: true, subtree: true });
  enhance();
})();
