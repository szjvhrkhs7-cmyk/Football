(() => {
  const STORAGE_KEY = 'traveler-journal-atlas-v1';
  let saveTimer = null;

  function persistAtlas() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data.atlas));
    } catch (error) {
      console.warn('Не удалось сохранить атлас', error);
    }
  }

  function restoreAtlas() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (Array.isArray(saved) && saved.length) {
        data.atlas.splice(0, data.atlas.length, ...saved);
      }
    } catch (error) {
      console.warn('Не удалось восстановить атлас', error);
    }
  }

  function currentAtlas() {
    return data.atlas.find((item) => item.id === state.selectedAtlasId) || data.atlas[0];
  }

  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persistAtlas, 350);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function closeDialog() {
    document.querySelector('.stage4-atlas-overlay')?.remove();
  }

  function atlasForm(entry = null) {
    const isEdit = Boolean(entry);
    const subtitleParts = String(entry?.subtitle || '').split('·').map((part) => part.trim()).filter(Boolean);
    const kind = subtitleParts[0] || 'Место';
    const context = subtitleParts.slice(1).join(' · ');
    const tags = Array.isArray(entry?.tags) ? entry.tags.join(', ') : '';

    const overlay = document.createElement('div');
    overlay.className = 'stage4-atlas-overlay';
    overlay.innerHTML = `
      <form class="stage4-atlas-sheet">
        <p class="kicker">${isEdit ? 'Страница атласа' : 'Новая запись'}</p>
        <h3>${isEdit ? 'Редактировать запись' : 'Добавить в атлас'}</h3>
        <label><span>Название</span><input name="title" required maxlength="80" value="${escapeHtml(entry?.title || '')}" placeholder="Например: Чёрная Гавань"></label>
        <div class="stage4-atlas-fields">
          <label><span>Тип</span>
            <select name="kind">
              ${['Место','Организация','Предмет','Существо','Легенда','Другое'].map((item) => `<option${item === kind ? ' selected' : ''}>${item}</option>`).join('')}
            </select>
          </label>
          <label><span>Уточнение</span><input name="context" maxlength="80" value="${escapeHtml(context)}" placeholder="Город, фракция, артефакт"></label>
        </div>
        <label><span>Описание</span><textarea name="description" rows="6" maxlength="2400" placeholder="Что путешественник знает об этом месте, предмете или существе">${escapeHtml(entry?.description || '')}</textarea></label>
        <label><span>Метки через запятую</span><input name="tags" maxlength="180" value="${escapeHtml(tags)}" placeholder="опасность, торговля, тайна"></label>
        ${isEdit ? '<div class="stage4-danger-zone"><button type="button" class="stage4-delete-atlas" data-delete-atlas>Удалить запись</button></div>' : ''}
        <div class="stage4-sheet-actions">
          <button type="button" class="stage4-sheet-button stage4-sheet-button--ghost" data-cancel-atlas>Отмена</button>
          <button type="submit" class="stage4-sheet-button stage4-sheet-button--primary">${isEdit ? 'Сохранить' : 'Создать'}</button>
        </div>
      </form>`;

    document.body.append(overlay);
    overlay.querySelector('[data-cancel-atlas]').addEventListener('click', closeDialog);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeDialog();
    });

    overlay.querySelector('[data-delete-atlas]')?.addEventListener('click', () => {
      if (data.atlas.length <= 1) {
        alert('В атласе должна остаться хотя бы одна запись.');
        return;
      }
      if (!confirm(`Удалить «${entry.title}» из атласа?`)) return;
      const index = data.atlas.findIndex((item) => item.id === entry.id);
      if (index >= 0) data.atlas.splice(index, 1);
      const fallback = data.atlas[Math.max(0, Math.min(index, data.atlas.length - 1))] || data.atlas[0];
      state.selectedAtlasId = fallback.id;
      state.mobileDetail = false;
      persistAtlas();
      closeDialog();
      render();
    });

    overlay.querySelector('form').addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const title = String(formData.get('title') || '').trim();
      const kindValue = String(formData.get('kind') || 'Другое').trim();
      const contextValue = String(formData.get('context') || '').trim();
      const description = String(formData.get('description') || '').trim();
      const tagValues = String(formData.get('tags') || '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 8);
      if (!title) return;

      const subtitle = [kindValue, contextValue].filter(Boolean).join(' · ');
      if (entry) {
        entry.title = title;
        entry.subtitle = subtitle;
        entry.description = description || 'Добавьте описание этой записи.';
        entry.tags = tagValues;
      } else {
        const created = {
          id: `atlas-${Date.now()}`,
          title,
          subtitle,
          image: './assets/atlas-harbor.jpg',
          description: description || 'Добавьте описание этой записи.',
          tags: tagValues,
          links: []
        };
        data.atlas.push(created);
        state.selectedAtlasId = created.id;
        state.section = 'atlas';
        state.mobileDetail = window.matchMedia('(max-width: 760px)').matches;
      }

      persistAtlas();
      closeDialog();
      render();
    });

    requestAnimationFrame(() => overlay.querySelector('input[name="title"]')?.focus());
  }

  function enhanceAtlasIndex() {
    if (state.section !== 'atlas') return;
    const page = document.querySelector('.atlas-index');
    if (!page) return;

    if (!page.querySelector('.stage4-add-atlas')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'stage4-add-atlas';
      button.innerHTML = '<span aria-hidden="true">+</span><span>Добавить запись</span>';
      button.addEventListener('click', () => atlasForm());
      const header = page.querySelector('.placeholder-header');
      header?.insertAdjacentElement('afterend', button);
    }
  }

  function enhanceAtlasDetail() {
    if (state.section !== 'atlas') return;
    const card = document.querySelector('.atlas-card');
    if (!card) return;
    const entry = currentAtlas();
    if (!entry) return;

    if (state.mobileDetail && !card.querySelector('.stage4-inline-back')) {
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'stage4-inline-back';
      back.innerHTML = '<span aria-hidden="true">‹</span><span>Атлас</span>';
      back.addEventListener('click', () => {
        state.mobileDetail = false;
        render();
      });
      card.insertBefore(back, card.firstElementChild?.nextElementSibling || card.firstChild);
    }

    if (!card.querySelector('.stage4-edit-atlas')) {
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'stage4-edit-atlas';
      edit.textContent = 'Править';
      edit.addEventListener('click', () => atlasForm(entry));
      card.append(edit);
    }

    const description = [...card.querySelectorAll('p')].find((node) => node.textContent.trim() === String(entry.description || '').trim());
    if (description && !description.dataset.stage4Editable) {
      description.dataset.stage4Editable = '1';
      description.contentEditable = 'true';
      description.spellcheck = true;
      description.classList.add('stage4-editable-atlas-description');
      description.setAttribute('aria-label', 'Редактируемое описание записи атласа');
      description.addEventListener('input', () => {
        entry.description = description.innerText.trim();
        saveSoon();
      });
    }
  }

  let queued = false;
  function enhance() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      enhanceAtlasIndex();
      enhanceAtlasDetail();
    });
  }

  restoreAtlas();
  const observer = new MutationObserver(enhance);
  observer.observe(document.querySelector('#app'), { childList: true, subtree: true });
  render();
  enhance();
})();
