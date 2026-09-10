(() => {
  const sketches = {
    compass: '<svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="28"/><path d="M60 20v14M60 86v14M20 60h14M86 60h14M72 48 64 64 48 72l8-16 16-8Z"/><path d="M60 8c21 0 40 18 40 40s-19 44-40 44-40-23-40-44S39 8 60 8Z"/></svg>',
    mountains: '<svg viewBox="0 0 180 90" aria-hidden="true"><path d="M8 74h164M20 74 50 34l18 22 23-38 24 32 16-18 27 42M54 39l9 35M92 18l11 56M132 34l7 40"/></svg>',
    tower: '<svg viewBox="0 0 120 140" aria-hidden="true"><path d="M28 124h64M38 124V56l22-18 22 18v68M47 56V28h26v28M52 83h16M52 98h16"/></svg>',
    ruins: '<svg viewBox="0 0 150 110" aria-hidden="true"><path d="M14 90h124M28 90V46l16-14v14l19-12v56M83 90V40l18 10 16-18v58M57 90l10-18M110 52l10-10"/></svg>',
    bridge: '<svg viewBox="0 0 180 95" aria-hidden="true"><path d="M14 68h152M30 68c10-18 28-27 58-27 31 0 49 9 62 27M48 68V52M67 68V46M89 68V43M111 68V46M132 68V54"/></svg>',
    tavern: '<svg viewBox="0 0 160 115" aria-hidden="true"><path d="M18 90h124M30 90V46l20-18 18 18v44M86 90V38h44v52M39 58h20M106 55h24M46 90V70M116 90V69"/></svg>',
    campfire: '<svg viewBox="0 0 120 120" aria-hidden="true"><path d="M34 98 58 62l18 22c8-8 13-19 13-31 0-8-2-14-6-22-3 8-9 16-16 22 0-11-4-20-13-31-2 8-5 13-11 20-6 8-9 15-9 23 0 10 4 20 11 27"/><path d="M28 104 50 88M44 106l14-14M58 106l16-16M70 104l16-16"/></svg>',
    pines: '<svg viewBox="0 0 150 115" aria-hidden="true"><path d="M12 97h126M34 97V74M76 97V66M114 97V78M20 75l14-24 14 24M57 67l19-32 20 32M101 78l13-22 12 22"/></svg>',
    moon: '<svg viewBox="0 0 120 120" aria-hidden="true"><path d="M70 16c-22 6-38 27-38 51 0 23 16 42 38 47-7 3-14 4-22 4-31 0-56-24-56-56S17 6 48 6c8 0 15 1 22 4Z"/><path d="M75 36h10M98 52h10M83 20h5M86 74h10"/></svg>',
    ship: '<svg viewBox="0 0 180 110" aria-hidden="true"><path d="M18 86h142M48 84 69 44h30l21 40M84 18v58M84 18c22 4 41 19 52 34-26-1-43-7-52-14M84 30c-16 7-27 18-38 31 14 0 26-5 38-12"/></svg>',
    sword: '<svg viewBox="0 0 120 140" aria-hidden="true"><path d="M60 18v72M49 30l11-12 11 12M43 98h34M50 98v11l10 8 10-8V98M56 117v14M64 117v14"/></svg>',
    potion: '<svg viewBox="0 0 100 130" aria-hidden="true"><path d="M38 12h24M44 12v18l-22 30a29 29 0 0 0 23 46h10a29 29 0 0 0 23-46L56 30V12"/><path d="M32 72c9 3 17 2 24-2 6-3 12-4 18-1"/></svg>',
    dragon: '<svg viewBox="0 0 170 120" aria-hidden="true"><path d="M18 90c10-27 26-43 50-47 12-2 22 1 30 8l9-15 20 4-11 13c13 6 22 18 28 35-11-4-20-4-31-1-10 2-17 7-24 14-6-13-17-20-34-21l-13 10-8-10c-8-1-16 2-26 10Z"/><path d="M88 52l12 12M102 31l10 5"/></svg>',
    route: '<svg viewBox="0 0 180 90" aria-hidden="true"><path d="M12 70c23-21 48-27 73-18 22 8 34-2 44-16 9-14 18-20 39-20"/><path d="M24 60c4 0 7 3 7 7s-3 7-7 7-7-3-7-7 3-7 7-7Zm120-52 18 1-6 16" stroke-dasharray="5 5"/></svg>',
    signpost: '<svg viewBox="0 0 120 120" aria-hidden="true"><path d="M58 16v88M58 38h40l10-10-10-10H58M58 64H24l-10-10 10-10h34"/><path d="M49 104h18"/></svg>'
  };

  const chronicleThemes = [
    ['mountains', 'compass', 'route'],
    ['tavern', 'bridge', 'campfire'],
    ['tower', 'ruins', 'route'],
    ['pines', 'moon', 'dragon'],
    ['potion', 'sword', 'compass'],
    ['ship', 'route', 'moon']
  ];
  const characterMotifs = ['sword', 'compass', 'potion', 'moon', 'dragon'];
  const atlasMotifs = ['route', 'ship', 'compass', 'signpost'];

  function makeSketch(name, className) {
    const markup = sketches[name];
    if (!markup) return null;
    const item = document.createElement('span');
    item.className = `stage5-sketch ${className}`;
    item.innerHTML = markup;
    return item;
  }

  function ensureLayer(host) {
    if (!host) return null;
    let layer = host.querySelector(':scope > .stage5-sketch-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'stage5-sketch-layer';
      host.append(layer);
    }
    return layer;
  }

  function decorateCampaign() {
    const page = document.querySelector('.campaign-page');
    if (!page) return;
    const layer = ensureLayer(page);
    if (!layer || layer.dataset.stage5Campaign === '1') return;
    layer.dataset.stage5Campaign = '1';
    layer.append(
      makeSketch('compass', 'stage5-sketch--campaign-compass stage5-sketch--soft'),
      makeSketch('route', 'stage5-sketch--campaign-route stage5-sketch--soft'),
      makeSketch('moon', 'stage5-sketch--campaign-moon stage5-sketch--soft')
    );
  }

  function decorateChronicle() {
    const page = document.querySelector('.entry-page');
    if (!page) return;
    const layer = ensureLayer(page);
    if (!layer) return;
    layer.innerHTML = '';
    const dayIndex = Math.max(0, (Number(state.selectedDayId) || 1) - 1) % chronicleThemes.length;
    const [hero, note, footer] = chronicleThemes[dayIndex];
    [
      makeSketch(hero, 'stage5-sketch--entry-hero stage5-sketch--soft'),
      makeSketch(note, 'stage5-sketch--entry-note stage5-sketch--soft'),
      makeSketch(footer, 'stage5-sketch--entry-footer stage5-sketch--strong')
    ].forEach((node) => node && layer.append(node));
  }

  function decorateCharacters() {
    const indexPage = document.querySelector('.character-index');
    const card = document.querySelector('.character-card');
    if (indexPage) {
      const layer = ensureLayer(indexPage);
      if (layer && !layer.dataset.stage5Index) {
        layer.dataset.stage5Index = '1';
        layer.append(makeSketch('signpost', 'stage5-sketch--characters-index stage5-sketch--soft'));
      }
    }
    if (!card) return;
    const layer = ensureLayer(card);
    if (!layer) return;
    layer.innerHTML = '';
    const index = Math.max(0, data.characters.findIndex((item) => item.id === state.selectedCharacterId));
    layer.append(
      makeSketch(characterMotifs[index % characterMotifs.length], 'stage5-sketch--character-crest stage5-sketch--soft'),
      makeSketch('route', 'stage5-sketch--character-footer stage5-sketch--soft')
    );
  }

  function decorateAtlas() {
    const indexPage = document.querySelector('.atlas-index');
    const card = document.querySelector('.atlas-card');
    if (indexPage) {
      const layer = ensureLayer(indexPage);
      if (layer && !layer.dataset.stage5Index) {
        layer.dataset.stage5Index = '1';
        layer.append(makeSketch('compass', 'stage5-sketch--atlas-index stage5-sketch--soft'));
      }
    }
    if (!card) return;
    const layer = ensureLayer(card);
    if (!layer) return;
    layer.innerHTML = '';
    const index = Math.max(0, data.atlas.findIndex((item) => item.id === state.selectedAtlasId));
    layer.append(
      makeSketch(atlasMotifs[index % atlasMotifs.length], 'stage5-sketch--atlas-map stage5-sketch--soft'),
      makeSketch('pines', 'stage5-sketch--atlas-footer stage5-sketch--soft')
    );
  }

  function enhance() {
    decorateCampaign();
    decorateChronicle();
    decorateCharacters();
    decorateAtlas();
  }

  const app = document.querySelector('#app');
  if (!app) return;
  const observer = new MutationObserver(() => queueMicrotask(enhance));
  observer.observe(app, { childList: true, subtree: true });
  enhance();
})();
