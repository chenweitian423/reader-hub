const state = {
  appMeta: {
    title: "Reader Hub",
    version: "0.0.0",
  },
  ui: {
    activePage: "search",
    lastBrowsePage: "search",
    selectedResultKey: null,
    recentSearches: [],
    readerFocusMode: false,
    readerSidebarCollapsed: false,
    readerDrawerOpen: false,
    readerToolbarHidden: false,
  },
  sources: [],
  sampleJson: null,
  results: [],
  shelfBooks: [],
  cachedChapters: [],
  summary: {
    source_count: 0,
    enabled_source_count: 0,
    shelf_count: 0,
    cached_chapter_count: 0,
    reading_count: 0,
  },
  shelfFilters: {
    query: "",
    category: "all",
  },
  filters: {
    sourceId: "all",
    capability: "all",
    shelf: "all",
  },
  preferences: {
    theme: "warm",
    font_size: 17,
    content_width: 820,
    line_height: 2,
  },
  reader: {
    sourceId: null,
    sourceName: "",
    book: null,
    chapters: [],
    activeChapterIndex: -1,
  },
  prefetchTask: null,
};

let preferenceSaveTimer = null;
let prefetchPollTimer = null;
let previousWindowScrollY = 0;
const RECENT_SEARCH_STORAGE_KEY = "reader-hub-recent-searches";

const elements = {
  sourceJson: document.querySelector("#source-json"),
  sourceFile: document.querySelector("#source-file"),
  importBtn: document.querySelector("#import-btn"),
  loadSampleBtn: document.querySelector("#load-sample-btn"),
  sourceList: document.querySelector("#source-list"),
  sourceCount: document.querySelector("#source-count"),
  shelfList: document.querySelector("#shelf-list"),
  shelfCount: document.querySelector("#shelf-count"),
  shelfSearchInput: document.querySelector("#shelf-search-input"),
  shelfCategoryFilter: document.querySelector("#shelf-category-filter"),
  searchForm: document.querySelector("#search-form"),
  pageShell: document.querySelector("#page-shell"),
  keywordInput: document.querySelector("#keyword-input"),
  results: document.querySelector("#results"),
  resultCount: document.querySelector("#result-count"),
  statusPill: document.querySelector("#status-pill"),
  sourceStatus: document.querySelector("#source-status"),
  summarySourceCount: document.querySelector("#summary-source-count"),
  summarySourceMeta: document.querySelector("#summary-source-meta"),
  summaryShelfCount: document.querySelector("#summary-shelf-count"),
  summaryReadingMeta: document.querySelector("#summary-reading-meta"),
  summaryCacheCount: document.querySelector("#summary-cache-count"),
  sourceItemTemplate: document.querySelector("#source-item-template"),
  shelfItemTemplate: document.querySelector("#shelf-item-template"),
  resultItemTemplate: document.querySelector("#result-item-template"),
  chapterItemTemplate: document.querySelector("#chapter-item-template"),
  sourceFilter: document.querySelector("#source-filter"),
  capabilityFilter: document.querySelector("#capability-filter"),
  shelfFilter: document.querySelector("#shelf-filter"),
  readerSection: document.querySelector("#reader-section"),
  readerShell: document.querySelector("#reader-shell"),
  readerSourceName: document.querySelector("#reader-source-name"),
  readerBookTitle: document.querySelector("#reader-book-title"),
  readerBookAuthor: document.querySelector("#reader-book-author"),
  readerBookMeta: document.querySelector("#reader-book-meta"),
  readerBookIntro: document.querySelector("#reader-book-intro"),
  readerBookCover: document.querySelector("#reader-book-cover"),
  chapterCount: document.querySelector("#chapter-count"),
  chapterList: document.querySelector("#chapter-list"),
  readerDrawerList: document.querySelector("#reader-drawer-list"),
  readerChapterTitle: document.querySelector("#reader-chapter-title"),
  readerStatus: document.querySelector("#reader-status"),
  readerContent: document.querySelector("#reader-content"),
  bookCategoryInput: document.querySelector("#book-category-input"),
  bookTagsInput: document.querySelector("#book-tags-input"),
  saveBookMetaBtn: document.querySelector("#save-book-meta-btn"),
  prevChapterBtn: document.querySelector("#prev-chapter-btn"),
  nextChapterBtn: document.querySelector("#next-chapter-btn"),
  readerDrawerBtn: document.querySelector("#reader-drawer-btn"),
  readerDrawer: document.querySelector("#reader-drawer"),
  readerDrawerOverlay: document.querySelector("#reader-drawer-overlay"),
  readerDrawerCloseBtn: document.querySelector("#reader-drawer-close-btn"),
  readerDrawerTitle: document.querySelector("#reader-drawer-title"),
  readerSidebarBtn: document.querySelector("#reader-sidebar-btn"),
  readerFocusBtn: document.querySelector("#reader-focus-btn"),
  readerBackBtn: document.querySelector("#reader-back-btn"),
  readerShelfBtn: document.querySelector("#reader-shelf-btn"),
  readerPageTitle: document.querySelector("#reader-page-title"),
  readerPageMeta: document.querySelector("#reader-page-meta"),
  readerBottomPrevBtn: document.querySelector("#reader-bottom-prev-btn"),
  readerBottomNextBtn: document.querySelector("#reader-bottom-next-btn"),
  readerBottomTitle: document.querySelector("#reader-bottom-title"),
  readerBottomProgress: document.querySelector("#reader-bottom-progress"),
  toggleShelfBtn: document.querySelector("#toggle-shelf-btn"),
  cacheBookBtn: document.querySelector("#cache-book-btn"),
  clearCacheBtn: document.querySelector("#clear-cache-btn"),
  cacheSummary: document.querySelector("#cache-summary"),
  cacheTaskStatus: document.querySelector("#cache-task-status"),
  cacheProgressBar: document.querySelector("#cache-progress-bar"),
  themeSelect: document.querySelector("#theme-select"),
  fontSizeRange: document.querySelector("#font-size-range"),
  fontSizeValue: document.querySelector("#font-size-value"),
  contentWidthRange: document.querySelector("#content-width-range"),
  contentWidthValue: document.querySelector("#content-width-value"),
  lineHeightRange: document.querySelector("#line-height-range"),
  lineHeightValue: document.querySelector("#line-height-value"),
  appTitle: document.querySelector("#app-title"),
  appVersionBadge: document.querySelector("#app-version-badge"),
  backupExportBtn: document.querySelector("#backup-export-btn"),
  backupImportMode: document.querySelector("#backup-import-mode"),
  backupFile: document.querySelector("#backup-file"),
  backupImportBtn: document.querySelector("#backup-import-btn"),
  toolsVersionBadge: document.querySelector("#tools-version-badge"),
  menuButtons: Array.from(document.querySelectorAll(".menu-btn")),
  pagePanels: Array.from(document.querySelectorAll(".page-panel")),
  keywordChips: Array.from(document.querySelectorAll(".keyword-chip")),
  homeSpotlightCover: document.querySelector("#home-spotlight-cover"),
  homeSpotlightSource: document.querySelector("#home-spotlight-source"),
  homeSpotlightTitle: document.querySelector("#home-spotlight-title"),
  homeSpotlightAuthor: document.querySelector("#home-spotlight-author"),
  homeSpotlightIntro: document.querySelector("#home-spotlight-intro"),
  homeSpotlightPrimary: document.querySelector("#home-spotlight-primary"),
  homeSpotlightSecondary: document.querySelector("#home-spotlight-secondary"),
  homeContinueList: document.querySelector("#home-continue-list"),
  homeReadableList: document.querySelector("#home-readable-list"),
  homeShelfPicks: document.querySelector("#home-shelf-picks"),
  homeRecentSearches: document.querySelector("#home-recent-searches"),
  homeUpdatesList: document.querySelector("#home-updates-list"),
  homeRelatedList: document.querySelector("#home-related-list"),
  resultDetailPanel: document.querySelector("#result-detail-panel"),
  resultDetailCover: document.querySelector("#result-detail-cover"),
  resultDetailSource: document.querySelector("#result-detail-source"),
  resultDetailTitle: document.querySelector("#result-detail-title"),
  resultDetailAuthor: document.querySelector("#result-detail-author"),
  resultDetailMeta: document.querySelector("#result-detail-meta"),
  resultDetailIntro: document.querySelector("#result-detail-intro"),
  resultDetailFacts: document.querySelector("#result-detail-facts"),
  resultDetailTags: document.querySelector("#result-detail-tags"),
  resultDetailRelated: document.querySelector("#result-detail-related"),
  resultDetailPrimary: document.querySelector("#result-detail-primary"),
  resultDetailSecondary: document.querySelector("#result-detail-secondary"),
  readerSessionLabel: document.querySelector("#reader-session-label"),
  readerProgressText: document.querySelector("#reader-progress-text"),
  readerProgressBadge: document.querySelector("#reader-progress-badge"),
  readerProgressBar: document.querySelector("#reader-progress-bar"),
};

function setStatus(text, type = "idle") {
  elements.statusPill.textContent = text;
  elements.statusPill.className = `status-pill ${type}`;
}

function getSourceById(sourceId) {
  return state.sources.find((source) => source.id === sourceId) || null;
}

function getShelfBookByKey(bookKey) {
  return state.shelfBooks.find((book) => book.book_key === bookKey) || null;
}

function isReadableSource(sourceId) {
  const source = getSourceById(sourceId);
  return Boolean(source && source.config && source.config.chapters && source.config.content);
}

function isBookInShelf(book) {
  return Boolean(book && book.book_key && getShelfBookByKey(book.book_key));
}

function formatTime(value) {
  if (!value) return "未开始阅读";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function parseTags(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function loadRecentSearches() {
  try {
    const raw = window.localStorage.getItem(RECENT_SEARCH_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    state.ui.recentSearches = Array.isArray(parsed) ? parsed.filter(Boolean).slice(0, 8) : [];
  } catch {
    state.ui.recentSearches = [];
  }
}

function persistRecentSearches() {
  window.localStorage.setItem(
    RECENT_SEARCH_STORAGE_KEY,
    JSON.stringify(state.ui.recentSearches.slice(0, 8)),
  );
}

function rememberRecentSearch(keyword) {
  const normalized = keyword.trim();
  if (!normalized) return;
  state.ui.recentSearches = [
    normalized,
    ...state.ui.recentSearches.filter((item) => item !== normalized),
  ].slice(0, 8);
  persistRecentSearches();
}

function clearPrefetchPolling() {
  if (prefetchPollTimer) {
    window.clearTimeout(prefetchPollTimer);
    prefetchPollTimer = null;
  }
}

function isPrefetchRunning() {
  return Boolean(
    state.prefetchTask &&
      state.reader.book &&
      state.prefetchTask.book_key === state.reader.book.book_key &&
      ["pending", "running"].includes(state.prefetchTask.status),
  );
}

function setReaderPreferenceVars() {
  document.documentElement.style.setProperty("--reader-font-size", `${state.preferences.font_size}px`);
  document.documentElement.style.setProperty("--reader-content-width", `${state.preferences.content_width}px`);
  document.documentElement.style.setProperty("--reader-line-height", String(state.preferences.line_height));
  elements.readerSection.dataset.readerTheme = state.preferences.theme;
  elements.themeSelect.value = state.preferences.theme;
  elements.fontSizeRange.value = String(state.preferences.font_size);
  elements.fontSizeValue.textContent = `${state.preferences.font_size}px`;
  elements.contentWidthRange.value = String(state.preferences.content_width);
  elements.contentWidthValue.textContent = `${state.preferences.content_width}px`;
  elements.lineHeightRange.value = String(state.preferences.line_height);
  elements.lineHeightValue.textContent = Number(state.preferences.line_height).toFixed(1);
}

function currentReaderBook() {
  return state.reader.book;
}

function updateReaderShelfButton() {
  const book = currentReaderBook();
  if (!book) {
    elements.toggleShelfBtn.disabled = true;
    elements.toggleShelfBtn.textContent = "加入书架";
    return;
  }

  elements.toggleShelfBtn.disabled = false;
  elements.toggleShelfBtn.textContent = isBookInShelf(book) ? "移出书架" : "加入书架";
}

function updateCacheControls() {
  const book = currentReaderBook();
  const disabled = !book || !book.book_key || !state.reader.chapters.length;
  elements.cacheBookBtn.disabled = disabled || isPrefetchRunning();
  elements.clearCacheBtn.disabled = disabled || !state.cachedChapters.length || isPrefetchRunning();
  const total = state.reader.chapters.length || 0;
  elements.cacheSummary.textContent = `已缓存 ${state.cachedChapters.length} / ${total} 章`;
}

function updateReaderMetadataForm() {
  const book = currentReaderBook();
  const shelfBook = book ? getShelfBookByKey(book.book_key) : null;
  elements.bookCategoryInput.value = shelfBook?.category || "";
  elements.bookTagsInput.value = (shelfBook?.tags || []).join(", ");
  elements.saveBookMetaBtn.disabled = !book;
}

function updateReaderProgressUI() {
  const total = state.reader.chapters.length;
  const active = state.reader.activeChapterIndex;

  if (!state.reader.book || !total) {
    elements.readerSessionLabel.textContent = "沉浸阅读";
    elements.readerProgressText.textContent = "未开始阅读";
    elements.readerProgressBadge.textContent = "0%";
    elements.readerProgressBar.style.width = "0%";
    return;
  }

  const current = active >= 0 ? active + 1 : 0;
  const percent = current > 0 ? Math.round((current / total) * 100) : 0;
  elements.readerSessionLabel.textContent = state.reader.book.title || "沉浸阅读";
  elements.readerProgressText.textContent =
    current > 0 ? `已读到第 ${current} / ${total} 章` : `共 ${total} 章，选择章节开始阅读`;
  elements.readerProgressBadge.textContent = `${percent}%`;
  elements.readerProgressBar.style.width = `${percent}%`;
  elements.readerBottomTitle.textContent =
    active >= 0 ? state.reader.chapters[active]?.title || "当前章节" : "选择章节开始阅读";
  elements.readerBottomProgress.textContent = `第 ${Math.max(current, 0)} / ${total} 章`;
}

function setReaderFocusMode(enabled) {
  state.ui.readerFocusMode = Boolean(enabled);
  elements.readerSection.classList.toggle("focus-mode", state.ui.readerFocusMode);
  elements.readerFocusBtn.textContent = state.ui.readerFocusMode ? "退出沉浸" : "沉浸模式";
  if (state.ui.readerFocusMode) {
    setReaderDrawerOpen(false);
  }
}

function setReaderSidebarCollapsed(enabled) {
  state.ui.readerSidebarCollapsed = Boolean(enabled);
  elements.readerShell.classList.toggle("sidebar-collapsed", state.ui.readerSidebarCollapsed);
  elements.readerSidebarBtn.textContent = state.ui.readerSidebarCollapsed ? "展开侧栏" : "收起侧栏";
}

function setReaderDrawerOpen(enabled) {
  state.ui.readerDrawerOpen = Boolean(enabled);
  elements.readerDrawer.classList.toggle("hidden", !state.ui.readerDrawerOpen);
  elements.readerDrawerOverlay.classList.toggle("hidden", !state.ui.readerDrawerOpen);
  elements.readerDrawerBtn.textContent = state.ui.readerDrawerOpen ? "关闭目录" : "目录抽屉";
}

function setReaderToolbarHidden(enabled) {
  state.ui.readerToolbarHidden = Boolean(enabled);
  elements.pageShell.classList.toggle("reader-toolbar-hidden", state.ui.readerToolbarHidden);
}

function updatePrefetchTaskUI() {
  const task = state.prefetchTask;
  if (!task) {
    elements.cacheTaskStatus.textContent = "暂无缓存任务";
    elements.cacheProgressBar.style.width = "0%";
    return;
  }

  const total = Math.max(task.total_chapters || 0, 1);
  const progress = Math.min(100, Math.round(((task.completed_chapters + task.failed_chapters) / total) * 100));
  elements.cacheProgressBar.style.width = `${progress}%`;
  const suffix = task.failed_chapters ? `，失败 ${task.failed_chapters} 章` : "";
  elements.cacheTaskStatus.textContent = `${task.message} · ${task.completed_chapters}/${task.total_chapters}${suffix}`;
}

function renderSummary() {
  elements.summarySourceCount.textContent = String(state.summary.source_count);
  elements.summarySourceMeta.textContent = `已启用 ${state.summary.enabled_source_count} 个`;
  elements.summaryShelfCount.textContent = String(state.summary.shelf_count);
  elements.summaryReadingMeta.textContent = `进行中 ${state.summary.reading_count} 本`;
  elements.summaryCacheCount.textContent = String(state.summary.cached_chapter_count);
}

function setSelectedResult(book) {
  state.ui.selectedResultKey = book?.book_key || null;
}

function getSelectedResult(visibleResults = getFilteredResults()) {
  if (!visibleResults.length) return null;
  return (
    visibleResults.find((item) => item.book_key === state.ui.selectedResultKey) ||
    visibleResults[0]
  );
}

function getHomeSpotlightBook() {
  if (state.reader.book) {
    return {
      kind: "reading",
      book: state.reader.book,
      sourceName: state.reader.sourceName || state.reader.book.source_name || "",
    };
  }
  if (state.results.length) {
    return {
      kind: "result",
      book: state.results[0],
      sourceName: state.results[0].source_name || "",
    };
  }
  if (state.shelfBooks.length) {
    return {
      kind: "shelf",
      book: state.shelfBooks[0].book,
      sourceName: state.shelfBooks[0].source_name || "",
      shelfBook: state.shelfBooks[0],
    };
  }
  return null;
}

function getRelatedBooks(baseBook, limit = 4) {
  if (!baseBook) return [];

  const pool = [...state.results];
  return pool
    .filter((item) => item.book_key !== baseBook.book_key)
    .filter((item) => {
      if (baseBook.author && item.author && item.author === baseBook.author) return true;
      if (baseBook.source_id && item.source_id === baseBook.source_id) return true;
      return false;
    })
    .slice(0, limit);
}

function bindHomeSpotlightButtons(payload) {
  elements.homeSpotlightPrimary.replaceWith(elements.homeSpotlightPrimary.cloneNode(true));
  elements.homeSpotlightSecondary.replaceWith(elements.homeSpotlightSecondary.cloneNode(true));
  elements.homeSpotlightPrimary = document.querySelector("#home-spotlight-primary");
  elements.homeSpotlightSecondary = document.querySelector("#home-spotlight-secondary");

  if (!payload) {
    elements.homeSpotlightPrimary.textContent = "去导入书源";
    elements.homeSpotlightSecondary.textContent = "查看书架";
    elements.homeSpotlightPrimary.addEventListener("click", () => setActivePage("sources"));
    elements.homeSpotlightSecondary.addEventListener("click", () => setActivePage("shelf"));
    return;
  }

  if (payload.kind === "reading") {
    elements.homeSpotlightPrimary.textContent = "继续阅读";
    elements.homeSpotlightSecondary.textContent = "查看书架";
    elements.homeSpotlightPrimary.addEventListener("click", () => {
      setActivePage("reader");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    elements.homeSpotlightSecondary.addEventListener("click", () => setActivePage("shelf"));
    return;
  }

  if (payload.kind === "shelf" && payload.shelfBook) {
    elements.homeSpotlightPrimary.textContent = "继续阅读";
    elements.homeSpotlightSecondary.textContent = "查看书架";
    elements.homeSpotlightPrimary.addEventListener("click", () => continueShelfBook(payload.shelfBook));
    elements.homeSpotlightSecondary.addEventListener("click", () => setActivePage("shelf"));
    return;
  }

  elements.homeSpotlightPrimary.textContent = isReadableSource(payload.book.source_id) ? "打开阅读" : "加入书架";
  elements.homeSpotlightSecondary.textContent = "管理书源";
  elements.homeSpotlightPrimary.addEventListener("click", () => {
    if (isReadableSource(payload.book.source_id)) {
      openBook(payload.book);
    } else {
      toggleShelfBook(payload.book);
    }
  });
  elements.homeSpotlightSecondary.addEventListener("click", () => setActivePage("sources"));
}

function renderHomeSpotlight() {
  const payload = getHomeSpotlightBook();
  if (!payload) {
    elements.homeSpotlightSource.textContent = "欢迎来到 Reader Hub";
    elements.homeSpotlightTitle.textContent = "先搜索一本你想看的书";
    elements.homeSpotlightAuthor.textContent = "首页会把当前最值得打开的一本书放在这里。";
    elements.homeSpotlightIntro.textContent =
      "你可以先导入示例书源，再搜索“月”或“便利店”，这里会自动切换成搜索结果或当前阅读书籍的展示卡。";
    elements.homeSpotlightCover.style.display = "none";
    elements.homeSpotlightCover.removeAttribute("src");
    bindHomeSpotlightButtons(null);
    return;
  }

  const book = payload.book;
  elements.homeSpotlightSource.textContent =
    payload.kind === "reading" ? `正在阅读 · ${payload.sourceName}` : payload.sourceName || "推荐书籍";
  elements.homeSpotlightTitle.textContent = book.title || "未命名书籍";
  elements.homeSpotlightAuthor.textContent = book.author ? `作者：${book.author}` : "作者信息待补充";
  elements.homeSpotlightIntro.textContent = book.intro || "这本书还没有简介，可以直接打开看看内容。";
  if (book.cover) {
    elements.homeSpotlightCover.src = book.cover;
    elements.homeSpotlightCover.style.display = "block";
  } else {
    elements.homeSpotlightCover.removeAttribute("src");
    elements.homeSpotlightCover.style.display = "none";
  }
  bindHomeSpotlightButtons(payload);
}

function renderHomeContinue() {
  const books = [...state.shelfBooks]
    .sort((a, b) => {
      const left = a.last_read_at || a.added_at;
      const right = b.last_read_at || b.added_at;
      return new Date(right).getTime() - new Date(left).getTime();
    })
    .slice(0, 3);

  if (!books.length) {
    elements.homeContinueList.className = "continue-list empty";
    elements.homeContinueList.textContent = "书架里还没有可继续阅读的书，先搜一本到书架吧。";
    return;
  }

  elements.homeContinueList.className = "continue-list";
  elements.homeContinueList.innerHTML = "";

  books.forEach((book) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "continue-item";
    item.innerHTML = `
      <span class="continue-item-source">${book.source_name}</span>
      <strong>${book.title || "未命名书籍"}</strong>
      <span class="muted">${book.last_chapter_title || "还没有阅读进度"}</span>
    `;
    item.addEventListener("click", () => continueShelfBook(book));
    elements.homeContinueList.appendChild(item);
  });
}

function renderHomeRails() {
  const readable = getFilteredResults()
    .filter((item) => isReadableSource(item.source_id))
    .slice(0, 4);
  const shelfPicks = getFilteredResults().filter((item) => isBookInShelf(item)).slice(0, 4);

  const renderRail = (target, items, emptyText) => {
    if (!items.length) {
      target.className = "rail-list empty";
      target.textContent = emptyText;
      return;
    }

    target.className = "rail-list";
    target.innerHTML = "";
    items.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "rail-item";
      button.innerHTML = `
        <strong>${item.title || "未命名书籍"}</strong>
        <span class="muted">${item.author ? `作者：${item.author}` : "作者信息待补充"}</span>
      `;
      button.addEventListener("click", () => {
        setSelectedResult(item);
        renderResults();
      });
      target.appendChild(button);
    });
  };

  renderRail(
    elements.homeReadableList,
    readable,
    "搜索到可阅读结果后，这里会帮你挑出更适合直接打开的书。",
  );
  renderRail(
    elements.homeShelfPicks,
    shelfPicks,
    "搜索结果里如果有已经收藏过的书，会在这里集中展示。",
  );
}

function renderInteractiveBookList(target, items, emptyText) {
  if (!items.length) {
    target.className = "discovery-list empty";
    target.textContent = emptyText;
    return;
  }

  target.className = "discovery-list";
  target.innerHTML = "";
  items.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "discovery-item";
    button.innerHTML = `
      <strong>${item.title || "未命名书籍"}</strong>
      <span class="muted">${item.subtitle || item.author || "书籍推荐"}</span>
      <span class="discovery-meta">${item.meta || "点击查看详情"}</span>
    `;
    button.addEventListener("click", item.onClick);
    target.appendChild(button);
  });
}

function renderRecentSearches() {
  if (!state.ui.recentSearches.length) {
    elements.homeRecentSearches.className = "discovery-list empty";
    elements.homeRecentSearches.textContent = "你最近搜索过的关键词会显示在这里，方便一键重新进入。";
    return;
  }

  elements.homeRecentSearches.className = "search-history-list";
  elements.homeRecentSearches.innerHTML = "";
  state.ui.recentSearches.forEach((keyword) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-chip";
    button.textContent = keyword;
    button.addEventListener("click", () => runQuickSearch(keyword));
    elements.homeRecentSearches.appendChild(button);
  });
}

function renderDiscoverySections() {
  renderRecentSearches();

  const updateItems = getFilteredResults()
    .filter((item) => item.latest_chapter)
    .slice(0, 4)
    .map((item) => ({
      title: item.title || "未命名书籍",
      subtitle: item.author ? `作者：${item.author}` : "更新中",
      meta: `更新到 ${item.latest_chapter}`,
      onClick: () => {
        setSelectedResult(item);
        renderResults();
      },
    }));
  renderInteractiveBookList(
    elements.homeUpdatesList,
    updateItems,
    "搜索结果里带有最新章节信息的书，会在这里集中展示。",
  );

  const selectedBook = getSelectedResult();
  const relatedItems = getRelatedBooks(selectedBook || state.reader.book, 4).map((item) => ({
    title: item.title || "未命名书籍",
    subtitle: item.author ? `作者：${item.author}` : item.source_name,
    meta: item.source_name || "推荐书籍",
    onClick: () => {
      setSelectedResult(item);
      renderResults();
    },
  }));
  renderInteractiveBookList(
    elements.homeRelatedList,
    relatedItems,
    "当你选中一本书后，这里会帮你推荐同作者或同来源的其他书。",
  );
}

function bindResultDetailButtons(book) {
  elements.resultDetailPrimary.replaceWith(elements.resultDetailPrimary.cloneNode(true));
  elements.resultDetailSecondary.replaceWith(elements.resultDetailSecondary.cloneNode(true));
  elements.resultDetailPrimary = document.querySelector("#result-detail-primary");
  elements.resultDetailSecondary = document.querySelector("#result-detail-secondary");

  if (!book) {
    elements.resultDetailPrimary.textContent = "开始搜索";
    elements.resultDetailSecondary.textContent = "去书源管理";
    elements.resultDetailPrimary.addEventListener("click", () => {
      elements.keywordInput.focus();
      setActivePage("search");
    });
    elements.resultDetailSecondary.addEventListener("click", () => setActivePage("sources"));
    return;
  }

  const readable = isReadableSource(book.source_id);
  elements.resultDetailPrimary.textContent = readable ? "立即阅读" : "加入书架";
  elements.resultDetailSecondary.textContent = isBookInShelf(book) ? "前往书架" : "收藏到书架";
  elements.resultDetailPrimary.addEventListener("click", () => {
    if (readable) {
      openBook(book);
    } else {
      toggleShelfBook(book);
    }
  });
  elements.resultDetailSecondary.addEventListener("click", () => {
    if (isBookInShelf(book)) {
      setActivePage("shelf");
    } else {
      toggleShelfBook(book);
    }
  });
}

function renderResultDetail(book) {
  if (!book) {
    elements.resultDetailPanel.className = "result-detail-panel empty";
    elements.resultDetailSource.textContent = "书籍详情";
    elements.resultDetailTitle.textContent = "先从左侧挑一本书";
    elements.resultDetailAuthor.textContent = "这里会展示你当前选中的书。";
    elements.resultDetailMeta.textContent = "你可以先搜索，再从结果列表中切换书籍。";
    elements.resultDetailIntro.textContent =
      "这个详情面板会显示更完整的简介、来源、收藏状态和操作按钮，帮助你更快决定下一步要不要打开阅读。";
    elements.resultDetailFacts.innerHTML = "";
    elements.resultDetailTags.innerHTML = "";
    elements.resultDetailRelated.className = "result-detail-related-list empty";
    elements.resultDetailRelated.textContent = "选中一本书后，这里会补充同作者或同来源推荐。";
    elements.resultDetailCover.style.display = "none";
    elements.resultDetailCover.removeAttribute("src");
    bindResultDetailButtons(null);
    return;
  }

  elements.resultDetailPanel.className = "result-detail-panel";
  elements.resultDetailSource.textContent = book.source_name || "搜索结果";
  elements.resultDetailTitle.textContent = book.title || "未命名书籍";
  elements.resultDetailAuthor.textContent = book.author ? `作者：${book.author}` : "作者信息待补充";
  elements.resultDetailMeta.textContent = book.latest_chapter
    ? `最新章节：${book.latest_chapter}`
    : isReadableSource(book.source_id)
      ? "支持直接阅读"
      : "当前书源仅支持搜索";
  elements.resultDetailIntro.textContent = book.intro || "这本书暂时没有简介，可以先加入书架或直接打开看看。";
  elements.resultDetailFacts.innerHTML = "";
  elements.resultDetailTags.innerHTML = "";

  [
    { label: "来源", value: book.source_name || "未知来源" },
    { label: "阅读能力", value: isReadableSource(book.source_id) ? "支持直接阅读" : "当前仅支持搜索" },
    { label: "书架状态", value: isBookInShelf(book) ? "已收藏到书架" : "尚未加入书架" },
    { label: "更新状态", value: book.latest_chapter || "暂无最新章节" },
  ].forEach((item) => {
    const fact = document.createElement("div");
    fact.className = "detail-fact";
    fact.innerHTML = `<span>${item.label}</span><strong>${item.value}</strong>`;
    elements.resultDetailFacts.appendChild(fact);
  });

  const tags = [
    isReadableSource(book.source_id) ? "可阅读" : "仅搜索",
    isBookInShelf(book) ? "已在书架" : "未收藏",
  ];
  tags.forEach((tag) => {
    const chip = document.createElement("span");
    chip.className = "tag-chip";
    chip.textContent = tag;
    elements.resultDetailTags.appendChild(chip);
  });

  if (book.cover) {
    elements.resultDetailCover.src = book.cover;
    elements.resultDetailCover.style.display = "block";
  } else {
    elements.resultDetailCover.removeAttribute("src");
    elements.resultDetailCover.style.display = "none";
  }

  const relatedBooks = getRelatedBooks(book, 3);
  if (!relatedBooks.length) {
    elements.resultDetailRelated.className = "result-detail-related-list empty";
    elements.resultDetailRelated.textContent = "暂时还没有更多同作者或同来源推荐。";
  } else {
    elements.resultDetailRelated.className = "result-detail-related-list";
    elements.resultDetailRelated.innerHTML = "";
    relatedBooks.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "result-detail-related-item";
      button.innerHTML = `
        <strong>${item.title || "未命名书籍"}</strong>
        <span class="muted">${item.author ? `作者：${item.author}` : item.source_name}</span>
      `;
      button.addEventListener("click", () => {
        setSelectedResult(item);
        renderResults();
      });
      elements.resultDetailRelated.appendChild(button);
    });
  }
  bindResultDetailButtons(book);
}

function renderHomeSurface() {
  renderHomeSpotlight();
  renderHomeContinue();
  renderHomeRails();
  renderDiscoverySections();
}

function renderAppMeta() {
  elements.appTitle.textContent = state.appMeta.title;
  elements.appVersionBadge.textContent = `v${state.appMeta.version}`;
  elements.toolsVersionBadge.textContent = `v${state.appMeta.version}`;
  document.title = `${state.appMeta.title} v${state.appMeta.version}`;
}

function setActivePage(pageId) {
  state.ui.activePage = pageId;
  if (pageId !== "reader") {
    state.ui.lastBrowsePage = pageId;
    setReaderToolbarHidden(false);
    setReaderDrawerOpen(false);
  }
  elements.menuButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.page === pageId);
  });
  elements.pagePanels.forEach((panel) => {
    panel.classList.toggle("hidden", panel.id !== `page-${pageId}`);
  });
  elements.pageShell.classList.toggle("reader-page-active", pageId === "reader");
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    let message = "请求失败";
    try {
      const payload = await response.json();
      message = payload.detail || message;
    } catch {
      message = response.statusText || message;
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function resetReader(message = "选择一本支持阅读的书后，就可以在这里查看正文。") {
  clearPrefetchPolling();
  state.reader = {
    sourceId: null,
    sourceName: "",
    book: null,
    chapters: [],
    activeChapterIndex: -1,
  };
  state.cachedChapters = [];
  state.prefetchTask = null;
  elements.readerSection.classList.add("hidden");
  elements.readerPageTitle.textContent = "打开一本书，进入更大的阅读界面";
  elements.readerPageMeta.textContent = "阅读器已经从搜书页拆出来，正文、目录和设置都会在这里独立展示。";
  setReaderSidebarCollapsed(false);
  setReaderDrawerOpen(false);
  setReaderToolbarHidden(false);
  setReaderFocusMode(false);
  elements.chapterCount.textContent = "0";
  elements.chapterList.className = "chapter-list empty";
  elements.chapterList.textContent = "打开支持阅读的书籍后，章节会显示在这里。";
  elements.readerDrawerList.className = "chapter-list empty";
  elements.readerDrawerList.textContent = "打开支持阅读的书籍后，章节会显示在这里。";
  elements.readerDrawerTitle.textContent = "章节目录";
  elements.readerChapterTitle.textContent = "请选择章节";
  elements.readerStatus.textContent = message;
  elements.readerContent.className = "reader-content empty";
  elements.readerContent.textContent = "正文区域已准备好。";
  updateReaderShelfButton();
  updateReaderMetadataForm();
  updateReaderNav();
  updateReaderProgressUI();
  updateCacheControls();
  updatePrefetchTaskUI();
  renderHomeSurface();
}

function renderSourceFilterOptions() {
  const previous = state.filters.sourceId;
  elements.sourceFilter.innerHTML = '<option value="all">全部来源</option>';
  state.sources.forEach((source) => {
    const option = document.createElement("option");
    option.value = String(source.id);
    option.textContent = source.name;
    elements.sourceFilter.appendChild(option);
  });
  const stillExists = previous === "all" || state.sources.some((source) => String(source.id) === previous);
  state.filters.sourceId = stillExists ? previous : "all";
  elements.sourceFilter.value = state.filters.sourceId;
}

function renderSources() {
  elements.sourceCount.textContent = String(state.sources.length);
  renderSourceFilterOptions();

  if (!state.sources.length) {
    elements.sourceList.className = "source-list empty";
    elements.sourceList.textContent = "暂无书源，请先导入。";
    return;
  }

  elements.sourceList.className = "source-list";
  elements.sourceList.innerHTML = "";

  state.sources.forEach((source) => {
    const fragment = elements.sourceItemTemplate.content.cloneNode(true);
    const name = fragment.querySelector(".source-name");
    const description = fragment.querySelector(".source-description");
    const enabledTag = fragment.querySelector(".source-enabled");
    const toggleBtn = fragment.querySelector(".toggle-btn");
    const deleteBtn = fragment.querySelector(".delete-btn");

    name.textContent = source.name;
    description.textContent = source.description || "未填写说明";
    enabledTag.textContent = source.enabled ? "已启用" : "已停用";
    enabledTag.className = `source-enabled ${source.enabled ? "enabled" : "disabled"}`;
    toggleBtn.textContent = source.enabled ? "停用" : "启用";

    toggleBtn.addEventListener("click", () => toggleSource(source));
    deleteBtn.addEventListener("click", () => deleteSource(source));
    elements.sourceList.appendChild(fragment);
  });
  renderHomeSurface();
}

function renderShelfCategoryOptions() {
  const categories = Array.from(
    new Set(state.shelfBooks.map((book) => (book.category || "").trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, "zh-CN"));

  const previous = state.shelfFilters.category;
  elements.shelfCategoryFilter.innerHTML = '<option value="all">全部分类</option>';
  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    elements.shelfCategoryFilter.appendChild(option);
  });
  state.shelfFilters.category =
    previous === "all" || categories.includes(previous) ? previous : "all";
  elements.shelfCategoryFilter.value = state.shelfFilters.category;
}

function getFilteredShelfBooks() {
  const query = state.shelfFilters.query.trim().toLowerCase();
  return state.shelfBooks.filter((book) => {
    if (state.shelfFilters.category !== "all" && (book.category || "") !== state.shelfFilters.category) {
      return false;
    }
    if (!query) {
      return true;
    }
    const haystacks = [book.title, book.author, book.category || "", ...(book.tags || [])];
    return haystacks.some((value) => String(value).toLowerCase().includes(query));
  });
}

function renderShelf() {
  elements.shelfCount.textContent = String(state.shelfBooks.length);
  renderShelfCategoryOptions();
  const visibleBooks = getFilteredShelfBooks();
  renderHomeContinue();

  if (!visibleBooks.length) {
    elements.shelfList.className = "shelf-list empty";
    elements.shelfList.textContent = state.shelfBooks.length
      ? "当前筛选条件下没有书，换个关键字或分类试试。"
      : "书架还是空的，搜索到喜欢的书后加入书架吧。";
    return;
  }

  elements.shelfList.className = "shelf-list";
  elements.shelfList.innerHTML = "";

  visibleBooks.forEach((book) => {
    const fragment = elements.shelfItemTemplate.content.cloneNode(true);
    const cover = fragment.querySelector(".shelf-cover");
    const coverWrap = fragment.querySelector(".shelf-cover-wrap");
    const source = fragment.querySelector(".shelf-source");
    const title = fragment.querySelector(".shelf-title");
    const author = fragment.querySelector(".shelf-author");
    const progress = fragment.querySelector(".shelf-progress");
    const tags = fragment.querySelector(".shelf-tags");
    const time = fragment.querySelector(".shelf-time");
    const resumeBtn = fragment.querySelector(".resume-btn");
    const removeBtn = fragment.querySelector(".shelf-remove-btn");

    source.textContent = book.source_name;
    title.textContent = book.title || "未命名书籍";
    author.textContent = book.author ? `作者: ${book.author}` : "作者信息缺失";
    progress.textContent = book.last_chapter_title
      ? `继续阅读: ${book.last_chapter_title} · 已缓存 ${book.cached_chapter_count} 章`
      : `还没有阅读进度 · 已缓存 ${book.cached_chapter_count} 章`;
    time.textContent = formatTime(book.last_read_at || book.added_at);

    tags.innerHTML = "";
    if (book.category) {
      const chip = document.createElement("span");
      chip.className = "tag-chip";
      chip.textContent = `分类 · ${book.category}`;
      tags.appendChild(chip);
    }
    (book.tags || []).forEach((tag) => {
      const chip = document.createElement("span");
      chip.className = "tag-chip";
      chip.textContent = tag;
      tags.appendChild(chip);
    });

    if (book.cover) {
      cover.src = book.cover;
      cover.style.display = "block";
      coverWrap.textContent = "";
    } else {
      cover.removeAttribute("src");
      cover.style.display = "none";
      coverWrap.textContent = "暂无封面";
    }

    resumeBtn.addEventListener("click", () => continueShelfBook(book));
    removeBtn.addEventListener("click", () => handleShelfRemoval(book));
    elements.shelfList.appendChild(fragment);
  });
}

function renderSourceStatus(items = []) {
  if (!items.length) {
    elements.sourceStatus.className = "source-status muted";
    elements.sourceStatus.textContent = "导入书源后即可搜索。";
    return;
  }

  elements.sourceStatus.className = "source-status";
  elements.sourceStatus.innerHTML = "";

  items.forEach((item) => {
    const div = document.createElement("div");
    div.className = `source-status-item ${item.success ? "" : "failed"}`.trim();
    div.innerHTML = `
      <span>${item.source_name}</span>
      <span>${item.success ? `命中 ${item.count} 本` : item.error}</span>
    `;
    elements.sourceStatus.appendChild(div);
  });
}

function getFilteredResults() {
  return state.results.filter((item) => {
    if (state.filters.sourceId !== "all" && String(item.source_id) !== state.filters.sourceId) {
      return false;
    }
    if (state.filters.capability === "readable" && !isReadableSource(item.source_id)) {
      return false;
    }
    if (state.filters.capability === "search_only" && isReadableSource(item.source_id)) {
      return false;
    }
    if (state.filters.shelf === "in_shelf" && !isBookInShelf(item)) {
      return false;
    }
    if (state.filters.shelf === "not_in_shelf" && isBookInShelf(item)) {
      return false;
    }
    return true;
  });
}

function renderResults(items = state.results) {
  state.results = items;
  const visibleResults = getFilteredResults();
  const selected = getSelectedResult(visibleResults);
  state.ui.selectedResultKey = selected?.book_key || null;
  elements.resultCount.textContent = `${visibleResults.length}/${state.results.length}`;

  if (!visibleResults.length) {
    elements.results.className = "results empty";
    elements.results.textContent = state.results.length
      ? "当前筛选条件下没有结果，换个过滤条件试试。"
      : "没有搜索到结果，换个关键词或调整书源试试。";
    renderHomeSpotlight();
    renderHomeRails();
    renderResultDetail(null);
    return;
  }

  elements.results.className = "results";
  elements.results.innerHTML = "";

  visibleResults.forEach((item) => {
    const fragment = elements.resultItemTemplate.content.cloneNode(true);
    const cover = fragment.querySelector(".result-cover");
    const coverWrap = fragment.querySelector(".result-cover-wrap");
    const source = fragment.querySelector(".result-source");
    const title = fragment.querySelector(".result-title");
    const author = fragment.querySelector(".result-author");
    const intro = fragment.querySelector(".result-intro");
    const meta = fragment.querySelector(".result-meta");
    const link = fragment.querySelector(".result-link");
    const badge = fragment.querySelector(".result-badge");
    const readBtn = fragment.querySelector(".read-btn");
    const collectBtn = fragment.querySelector(".collect-btn");

    const readable = isReadableSource(item.source_id);
    const inShelf = isBookInShelf(item);

    source.textContent = item.source_name;
    title.textContent = item.title || "未命名书籍";
    author.textContent = item.author ? `作者: ${item.author}` : "作者信息缺失";
    intro.textContent = item.intro || "暂无简介";
    meta.textContent = item.latest_chapter ? `最新章节: ${item.latest_chapter}` : "未提供最新章节信息";
    badge.textContent = readable ? "可阅读" : "仅搜索";
    badge.className = `result-badge ${readable ? "readable" : "external"}`;
    fragment.querySelector(".result-card").classList.toggle("active", item.book_key === state.ui.selectedResultKey);

    if (item.cover) {
      cover.src = item.cover;
      cover.style.display = "block";
      coverWrap.textContent = "";
    } else {
      cover.removeAttribute("src");
      cover.style.display = "none";
      coverWrap.textContent = "暂无封面";
    }

    if (item.detail_url) {
      link.href = item.detail_url;
      link.style.display = "inline-flex";
    } else {
      link.removeAttribute("href");
      link.style.display = "none";
    }

    readBtn.disabled = !readable;
    readBtn.textContent = readable ? "阅读" : "未配置阅读";
    if (readable) {
      readBtn.addEventListener("click", () => openBook(item));
    }

    collectBtn.textContent = inShelf ? "已在书架" : "加入书架";
    collectBtn.addEventListener("click", () => toggleShelfBook(item));
    fragment.querySelector(".result-card").addEventListener("click", (event) => {
      if (event.target.closest("button, a")) return;
      setSelectedResult(item);
      renderResults();
    });
    elements.results.appendChild(fragment);
  });
  renderHomeSpotlight();
  renderHomeRails();
  renderResultDetail(selected);
}

function renderReaderShell(bookOpenPayload) {
  const { source_id: sourceId, source_name: sourceName, book, chapters } = bookOpenPayload;
  state.reader.sourceId = sourceId;
  state.reader.sourceName = sourceName;
  state.reader.book = book;
  state.reader.chapters = chapters;
  state.reader.activeChapterIndex = -1;

  setActivePage("reader");
  elements.readerSection.classList.remove("hidden");
  setReaderSidebarCollapsed(false);
  setReaderDrawerOpen(false);
  setReaderToolbarHidden(false);
  setReaderFocusMode(false);
  elements.readerPageTitle.textContent = book.title || "未命名书籍";
  elements.readerPageMeta.textContent = `${sourceName}${book.author ? ` · ${book.author}` : ""}${book.latest_chapter ? ` · 最新 ${book.latest_chapter}` : ""}`;
  elements.readerDrawerTitle.textContent = book.title || "章节目录";
  elements.readerSourceName.textContent = sourceName;
  elements.readerBookTitle.textContent = book.title || "未命名书籍";
  elements.readerBookAuthor.textContent = book.author ? `作者: ${book.author}` : "作者信息缺失";
  const metaParts = [];
  if (book.status) metaParts.push(`状态: ${book.status}`);
  if (book.latest_chapter) metaParts.push(`最新: ${book.latest_chapter}`);
  elements.readerBookMeta.textContent = metaParts.join(" · ") || "暂无补充信息";
  elements.readerBookIntro.textContent = book.intro || "暂无简介";

  if (book.cover) {
    elements.readerBookCover.src = book.cover;
    elements.readerBookCover.style.display = "block";
  } else {
    elements.readerBookCover.removeAttribute("src");
    elements.readerBookCover.style.display = "none";
  }

  elements.chapterCount.textContent = String(chapters.length);
  renderChapterList();
  updateReaderShelfButton();
  updateReaderMetadataForm();
  updateCacheControls();
  updatePrefetchTaskUI();
  updateReaderProgressUI();
  renderHomeSurface();
  elements.readerStatus.textContent = "章节已加载，点击目录开始阅读。";
  elements.readerContent.className = "reader-content empty";
  elements.readerContent.textContent = "请选择左侧章节。";
}

function renderChapterListInto(target) {
  const chapters = state.reader.chapters;
  if (!chapters.length) {
    target.className = "chapter-list empty";
    target.textContent = "当前书籍没有章节。";
    return;
  }

  target.className = "chapter-list";
  target.innerHTML = "";

  chapters.forEach((chapter, index) => {
    const fragment = elements.chapterItemTemplate.content.cloneNode(true);
    const button = fragment.querySelector(".chapter-item");
    const number = fragment.querySelector(".chapter-index");
    const title = fragment.querySelector(".chapter-title");
    const isCached = state.cachedChapters.some((item) => item.chapter_key === chapter.chapter_key);

    number.textContent = String(index + 1).padStart(2, "0");
    title.textContent = `${chapter.title || `第 ${index + 1} 章`}${isCached ? " · 已缓存" : ""}`;
    button.classList.toggle("active", index === state.reader.activeChapterIndex);
    button.addEventListener("click", () => {
      readChapter(index);
      setReaderDrawerOpen(false);
    });

    target.appendChild(fragment);
  });
}

function renderChapterList() {
  renderChapterListInto(elements.chapterList);
  renderChapterListInto(elements.readerDrawerList);
}

function updateReaderNav() {
  const { activeChapterIndex, chapters } = state.reader;
  elements.prevChapterBtn.disabled = activeChapterIndex <= 0;
  elements.nextChapterBtn.disabled = activeChapterIndex < 0 || activeChapterIndex >= chapters.length - 1;
  elements.readerBottomPrevBtn.disabled = elements.prevChapterBtn.disabled;
  elements.readerBottomNextBtn.disabled = elements.nextChapterBtn.disabled;
  updateReaderProgressUI();
}

function resolveResumeChapterIndex(chapters, resumeChapter, resumeChapterIndex) {
  if (resumeChapter && resumeChapter.chapter_key) {
    const byKey = chapters.findIndex((item) => item.chapter_key === resumeChapter.chapter_key);
    if (byKey >= 0) return byKey;
  }
  if (resumeChapter && resumeChapter.chapter_id) {
    const byId = chapters.findIndex((item) => item.chapter_id && item.chapter_id === resumeChapter.chapter_id);
    if (byId >= 0) return byId;
  }
  if (resumeChapter && resumeChapter.title) {
    const byTitle = chapters.findIndex((item) => item.title === resumeChapter.title);
    if (byTitle >= 0) return byTitle;
  }
  if (resumeChapterIndex >= 0 && resumeChapterIndex < chapters.length) {
    return resumeChapterIndex;
  }
  return 0;
}

async function refreshSources() {
  state.sources = await apiFetch("/api/sources", { method: "GET", headers: {} });
  renderSources();
  renderResults();
  await refreshSummary();
}

async function refreshAppMeta() {
  state.appMeta = await apiFetch("/api/app/meta", { method: "GET", headers: {} });
  renderAppMeta();
}

async function refreshShelf() {
  state.shelfBooks = await apiFetch("/api/library/books", { method: "GET", headers: {} });
  renderShelf();
  renderResults();
  updateReaderShelfButton();
  updateReaderMetadataForm();
  await refreshSummary();
}

async function refreshPreferences() {
  state.preferences = await apiFetch("/api/reader/preferences", { method: "GET", headers: {} });
  setReaderPreferenceVars();
}

async function refreshSummary() {
  state.summary = await apiFetch("/api/dashboard/summary", { method: "GET", headers: {} });
  renderSummary();
}

async function refreshCurrentBookCache(bookKey = currentReaderBook() && currentReaderBook().book_key) {
  if (!bookKey) {
    state.cachedChapters = [];
    updateCacheControls();
    return;
  }
  state.cachedChapters = await apiFetch(`/api/library/books/${bookKey}/cached-chapters`, {
    method: "GET",
    headers: {},
  });
  renderChapterList();
  updateCacheControls();
}

async function refreshLatestPrefetchTask(bookKey = currentReaderBook() && currentReaderBook().book_key) {
  if (!bookKey) {
    clearPrefetchPolling();
    state.prefetchTask = null;
    updatePrefetchTaskUI();
    updateCacheControls();
    return null;
  }

  const payload = await apiFetch(`/api/library/books/${bookKey}/prefetch-tasks/latest`, {
    method: "GET",
    headers: {},
  });
  state.prefetchTask = payload;
  updatePrefetchTaskUI();
  updateCacheControls();
  return payload;
}

async function pollPrefetchTask(taskId) {
  try {
    const payload = await apiFetch(`/api/prefetch-tasks/${taskId}`, {
      method: "GET",
      headers: {},
    });
    state.prefetchTask = payload;
    updatePrefetchTaskUI();
    updateCacheControls();

    if (["pending", "running"].includes(payload.status)) {
      prefetchPollTimer = window.setTimeout(() => {
        pollPrefetchTask(taskId);
      }, 1200);
      return;
    }

    clearPrefetchPolling();
    await refreshCurrentBookCache(payload.book_key);
    await refreshShelf();
    if (payload.status === "completed") {
      setStatus(payload.message, "success");
    } else if (payload.status === "failed") {
      setStatus(payload.message, "error");
    }
  } catch (error) {
    clearPrefetchPolling();
    setStatus(error.message, "error");
  }
}

function startPrefetchPolling(taskId) {
  clearPrefetchPolling();
  pollPrefetchTask(taskId);
}

async function loadSampleJson() {
  if (!state.sampleJson) {
    const response = await fetch("/static/sample_sources.json");
    state.sampleJson = await response.text();
  }
  elements.sourceJson.value = state.sampleJson;
}

async function importSources() {
  const raw = elements.sourceJson.value.trim();
  if (!raw) {
    setStatus("请先粘贴书源 JSON", "error");
    return;
  }

  elements.importBtn.disabled = true;
  setStatus("正在导入书源", "loading");

  try {
    await apiFetch("/api/sources/import", {
      method: "POST",
      body: raw,
    });
    await refreshSources();
    setStatus("书源导入成功", "success");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    elements.importBtn.disabled = false;
  }
}

async function exportBackup() {
  elements.backupExportBtn.disabled = true;
  setStatus("正在生成备份文件", "loading");
  try {
    const payload = await apiFetch("/api/library/backup", {
      method: "GET",
      headers: {},
    });
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `reader-hub-backup-v${state.appMeta.version}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
    setStatus("备份文件已导出", "success");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    elements.backupExportBtn.disabled = false;
  }
}

async function importBackup() {
  const [file] = elements.backupFile.files || [];
  if (!file) {
    setStatus("请先选择备份 JSON 文件", "error");
    return;
  }

  const mode = elements.backupImportMode.value || "merge";
  const confirmed =
    mode === "replace"
      ? window.confirm("覆盖恢复会清空当前书源、书架和缓存，确认继续吗？")
      : true;
  if (!confirmed) return;

  elements.backupImportBtn.disabled = true;
  setStatus(mode === "replace" ? "正在覆盖恢复备份" : "正在导入备份", "loading");
  try {
    const raw = await file.text();
    const backupData = JSON.parse(raw);
    const payload = await apiFetch("/api/library/restore", {
      method: "POST",
      body: JSON.stringify({
        mode,
        data: backupData,
      }),
    });
    await Promise.all([refreshAppMeta(), refreshSources(), refreshShelf(), refreshPreferences()]);
    resetReader();
    renderSummary();
    const actionText = mode === "replace" ? "覆盖恢复完成" : "备份导入完成";
    setStatus(
      `${actionText}，书源 ${payload.source_count} 个，书架 ${payload.shelf_count} 本，缓存 ${payload.cached_chapter_count} 章`,
      "success",
    );
    elements.backupFile.value = "";
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    elements.backupImportBtn.disabled = false;
  }
}

async function toggleSource(source) {
  setStatus(`${source.enabled ? "停用" : "启用"}书源中`, "loading");
  try {
    await apiFetch(`/api/sources/${source.id}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled: !source.enabled }),
    });
    await refreshSources();
    setStatus("书源状态已更新", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function deleteSource(source) {
  const confirmed = window.confirm(`确认删除书源“${source.name}”吗？`);
  if (!confirmed) return;

  setStatus("删除书源中", "loading");
  try {
    await apiFetch(`/api/sources/${source.id}`, {
      method: "DELETE",
      headers: {},
    });
    await refreshSources();
    setStatus("书源已删除", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function searchBooks(event) {
  event.preventDefault();
  const keyword = elements.keywordInput.value.trim();
  if (!keyword) {
    setStatus("请输入搜索关键词", "error");
    return;
  }

  setStatus("正在搜索", "loading");
  setActivePage("search");
  state.results = [];
  renderResults();
  resetReader();

  try {
    const payload = await apiFetch("/api/search", {
      method: "POST",
      body: JSON.stringify({
        keyword,
        limit_per_source: 10,
      }),
    });
    rememberRecentSearch(keyword);
    renderResults(payload.items);
    renderSourceStatus(payload.sources);
    setStatus(`搜索完成，共 ${payload.total} 本`, "success");
  } catch (error) {
    renderSourceStatus([]);
    setStatus(error.message, "error");
  }
}

async function addBookToShelf(book, sourceId) {
  return apiFetch("/api/library/books", {
    method: "POST",
    body: JSON.stringify({
      source_id: sourceId,
      book,
    }),
  });
}

async function removeShelfBook(bookOrShelf) {
  const bookKey = bookOrShelf.book_key;
  await apiFetch(`/api/library/books/${bookKey}`, {
    method: "DELETE",
    headers: {},
  });
}

async function handleShelfRemoval(book) {
  try {
    await removeShelfBook(book);
    await refreshShelf();
    if (currentReaderBook() && currentReaderBook().book_key === book.book_key) {
      state.cachedChapters = [];
      state.prefetchTask = null;
      clearPrefetchPolling();
      updatePrefetchTaskUI();
      updateReaderMetadataForm();
      updateCacheControls();
    }
    setStatus("已移出书架", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function toggleShelfBook(book, explicitSourceId = null) {
  const sourceId = explicitSourceId || book.source_id || state.reader.sourceId;
  if (!sourceId) {
    setStatus("无法识别书源，暂时不能加入书架", "error");
    return;
  }

  try {
    if (isBookInShelf(book)) {
      await removeShelfBook(book);
      if (currentReaderBook() && currentReaderBook().book_key === book.book_key) {
        state.cachedChapters = [];
      }
      setStatus("已移出书架", "success");
    } else {
      await addBookToShelf(book, sourceId);
      setStatus("已加入书架", "success");
    }
    await refreshShelf();
    updateCacheControls();
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function openBook(book, options = {}) {
  setStatus("正在加载章节目录", "loading");
  try {
    const payload = await apiFetch("/api/books/open", {
      method: "POST",
      body: JSON.stringify({
        source_id: book.source_id || state.reader.sourceId,
        book,
      }),
    });
    renderReaderShell(payload);
    await refreshCurrentBookCache(payload.book.book_key);
    const latestTask = await refreshLatestPrefetchTask(payload.book.book_key);
    if (latestTask && ["pending", "running"].includes(latestTask.status)) {
      startPrefetchPolling(latestTask.task_id);
    }
    updateReaderNav();
    setStatus(`已打开《${payload.book.title}》`, "success");
    window.scrollTo({ top: 0, behavior: "smooth" });

    const resumeIndex = resolveResumeChapterIndex(
      payload.chapters,
      options.resumeChapter || null,
      options.resumeChapterIndex ?? -1,
    );
    if (payload.chapters.length && options.autoRead !== false) {
      if (options.resumeChapter || options.resumeChapterIndex >= 0) {
        await readChapter(resumeIndex);
      }
    }
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function continueShelfBook(shelfBook) {
  await openBook(shelfBook.book, {
    resumeChapter: shelfBook.last_chapter,
    resumeChapterIndex: shelfBook.last_chapter_index,
  });
}

async function saveProgress(chapter, chapterIndex) {
  const book = currentReaderBook();
  if (!book || !book.book_key) return;

  try {
    await apiFetch(`/api/library/books/${book.book_key}/progress`, {
      method: "POST",
      body: JSON.stringify({
        source_id: state.reader.sourceId,
        book,
        chapter,
        chapter_index: chapterIndex,
      }),
    });
    await refreshShelf();
  } catch (error) {
    elements.readerStatus.textContent = `${elements.readerStatus.textContent}；进度保存失败: ${error.message}`;
  }
}

async function readChapter(index) {
  const chapter = state.reader.chapters[index];
  if (!chapter || !state.reader.book) return;

  state.reader.activeChapterIndex = index;
  renderChapterList();
  updateReaderNav();
  elements.readerChapterTitle.textContent = chapter.title || "正在加载章节";
  elements.readerStatus.textContent = "正在加载正文...";
  elements.readerContent.className = "reader-content empty";
  elements.readerContent.textContent = "正在请求正文内容。";
  setStatus("正在加载正文", "loading");

  try {
    const payload = await apiFetch("/api/books/content", {
      method: "POST",
      body: JSON.stringify({
        source_id: state.reader.sourceId,
        book: state.reader.book,
        chapter,
      }),
    });
    elements.readerChapterTitle.textContent = payload.chapter_title || chapter.title;
    elements.readerStatus.textContent = payload.cached
      ? `正在阅读 ${payload.chapter_title || chapter.title} · 来自本地缓存`
      : `正在阅读 ${payload.chapter_title || chapter.title} · 已写入缓存`;
    elements.readerContent.className = "reader-content";
    elements.readerContent.textContent = payload.content;
    setReaderToolbarHidden(false);
    setStatus(payload.cached ? "正文已从缓存加载" : "正文加载完成并已缓存", "success");
    await refreshCurrentBookCache(state.reader.book.book_key);
    await saveProgress(payload.chapter, index);
  } catch (error) {
    elements.readerStatus.textContent = error.message;
    elements.readerContent.className = "reader-content empty";
    elements.readerContent.textContent = "正文加载失败，请尝试切换章节。";
    setStatus(error.message, "error");
  }
}

async function cacheCurrentBook() {
  const book = currentReaderBook();
  if (!book || !book.book_key || !state.reader.chapters.length) return;

  setStatus("正在创建后台缓存任务", "loading");
  try {
    const payload = await apiFetch(`/api/library/books/${book.book_key}/prefetch-jobs`, {
      method: "POST",
      body: JSON.stringify({
        source_id: state.reader.sourceId,
        book,
        chapters: state.reader.chapters,
      }),
    });
    state.prefetchTask = payload;
    updatePrefetchTaskUI();
    updateCacheControls();
    startPrefetchPolling(payload.task_id);
    setStatus(payload.message || "后台缓存任务已开始", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function clearCurrentBookCache() {
  const book = currentReaderBook();
  if (!book || !book.book_key) return;

  setStatus("正在清空缓存", "loading");
  try {
    await apiFetch(`/api/library/books/${book.book_key}/cached-chapters`, {
      method: "DELETE",
      headers: {},
    });
    await refreshCurrentBookCache(book.book_key);
    await refreshShelf();
    setStatus("本书缓存已清空", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function saveCurrentBookMetadata() {
  const book = currentReaderBook();
  if (!book || !book.book_key) {
    setStatus("请先打开一本书再设置分类和标签", "error");
    return;
  }

  try {
    if (!isBookInShelf(book)) {
      await addBookToShelf(book, state.reader.sourceId);
    }
    await apiFetch(`/api/library/books/${book.book_key}`, {
      method: "PATCH",
      body: JSON.stringify({
        category: elements.bookCategoryInput.value.trim(),
        tags: parseTags(elements.bookTagsInput.value),
      }),
    });
    await refreshShelf();
    updateReaderMetadataForm();
    setStatus("书架分类与标签已保存", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function schedulePreferenceSave() {
  if (preferenceSaveTimer) {
    window.clearTimeout(preferenceSaveTimer);
  }
  preferenceSaveTimer = window.setTimeout(async () => {
    try {
      state.preferences = await apiFetch("/api/reader/preferences", {
        method: "PUT",
        body: JSON.stringify(state.preferences),
      });
      setReaderPreferenceVars();
      setStatus("阅读设置已保存", "success");
    } catch (error) {
      setStatus(error.message, "error");
    }
  }, 220);
}

function handlePreferenceInput() {
  state.preferences = {
    theme: elements.themeSelect.value,
    font_size: Number(elements.fontSizeRange.value),
    content_width: Number(elements.contentWidthRange.value),
    line_height: Number(elements.lineHeightRange.value),
  };
  setReaderPreferenceVars();
  schedulePreferenceSave();
}

function handleFilterChange() {
  state.filters = {
    sourceId: elements.sourceFilter.value,
    capability: elements.capabilityFilter.value,
    shelf: elements.shelfFilter.value,
  };
  renderResults();
}

function handleShelfFilterChange() {
  state.shelfFilters = {
    query: elements.shelfSearchInput.value,
    category: elements.shelfCategoryFilter.value,
  };
  renderShelf();
}

function runQuickSearch(keyword) {
  elements.keywordInput.value = keyword;
  elements.searchForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

loadRecentSearches();
elements.importBtn.addEventListener("click", importSources);
elements.loadSampleBtn.addEventListener("click", loadSampleJson);
elements.backupExportBtn.addEventListener("click", exportBackup);
elements.backupImportBtn.addEventListener("click", importBackup);
elements.searchForm.addEventListener("submit", searchBooks);
elements.prevChapterBtn.addEventListener("click", () => {
  if (state.reader.activeChapterIndex > 0) {
    readChapter(state.reader.activeChapterIndex - 1);
  }
});
elements.nextChapterBtn.addEventListener("click", () => {
  if (state.reader.activeChapterIndex < state.reader.chapters.length - 1) {
    readChapter(state.reader.activeChapterIndex + 1);
  }
});
elements.readerBottomPrevBtn.addEventListener("click", () => {
  if (state.reader.activeChapterIndex > 0) {
    readChapter(state.reader.activeChapterIndex - 1);
  }
});
elements.readerBottomNextBtn.addEventListener("click", () => {
  if (state.reader.activeChapterIndex < state.reader.chapters.length - 1) {
    readChapter(state.reader.activeChapterIndex + 1);
  }
});
elements.readerDrawerBtn.addEventListener("click", () => {
  if (!state.reader.book) {
    setStatus("请先打开一本书再查看目录", "error");
    return;
  }
  setReaderDrawerOpen(!state.ui.readerDrawerOpen);
});
elements.readerDrawerCloseBtn.addEventListener("click", () => {
  setReaderDrawerOpen(false);
});
elements.readerDrawerOverlay.addEventListener("click", () => {
  setReaderDrawerOpen(false);
});
elements.readerSidebarBtn.addEventListener("click", () => {
  setReaderSidebarCollapsed(!state.ui.readerSidebarCollapsed);
});
elements.readerFocusBtn.addEventListener("click", () => {
  if (!state.reader.book) {
    setStatus("请先打开一本书再进入沉浸模式", "error");
    return;
  }
  setReaderFocusMode(!state.ui.readerFocusMode);
});
elements.readerBackBtn.addEventListener("click", () => {
  setActivePage(state.ui.lastBrowsePage || "search");
  window.scrollTo({ top: 0, behavior: "smooth" });
});
elements.readerShelfBtn.addEventListener("click", () => {
  setActivePage("shelf");
  window.scrollTo({ top: 0, behavior: "smooth" });
});
elements.toggleShelfBtn.addEventListener("click", () => {
  const book = currentReaderBook();
  if (book) {
    toggleShelfBook(book, state.reader.sourceId);
  }
});
elements.cacheBookBtn.addEventListener("click", cacheCurrentBook);
elements.clearCacheBtn.addEventListener("click", clearCurrentBookCache);
elements.saveBookMetaBtn.addEventListener("click", saveCurrentBookMetadata);
elements.themeSelect.addEventListener("change", handlePreferenceInput);
elements.fontSizeRange.addEventListener("input", handlePreferenceInput);
elements.contentWidthRange.addEventListener("input", handlePreferenceInput);
elements.lineHeightRange.addEventListener("input", handlePreferenceInput);
elements.sourceFilter.addEventListener("change", handleFilterChange);
elements.capabilityFilter.addEventListener("change", handleFilterChange);
elements.shelfFilter.addEventListener("change", handleFilterChange);
elements.shelfSearchInput.addEventListener("input", handleShelfFilterChange);
elements.shelfCategoryFilter.addEventListener("change", handleShelfFilterChange);
elements.sourceFile.addEventListener("change", async (event) => {
  const [file] = event.target.files || [];
  if (!file) return;
  elements.sourceJson.value = await file.text();
  setStatus(`已载入文件: ${file.name}`, "idle");
});
elements.backupFile.addEventListener("change", (event) => {
  const [file] = event.target.files || [];
  if (!file) return;
  setStatus(`已选择备份文件: ${file.name}`, "idle");
});
elements.menuButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setActivePage(button.dataset.page);
  });
});
elements.keywordChips.forEach((button) => {
  button.addEventListener("click", () => {
    runQuickSearch(button.dataset.keyword || "");
  });
});
window.addEventListener(
  "scroll",
  () => {
    if (state.ui.activePage !== "reader" || !state.reader.book || state.ui.readerDrawerOpen) {
      previousWindowScrollY = window.scrollY;
      return;
    }
    const currentY = window.scrollY;
    const delta = currentY - previousWindowScrollY;
    if (currentY < 120 || delta < -10) {
      setReaderToolbarHidden(false);
    } else if (delta > 12) {
      setReaderToolbarHidden(true);
    }
    previousWindowScrollY = currentY;
  },
  { passive: true },
);

Promise.all([refreshAppMeta(), refreshSources(), refreshShelf(), refreshPreferences()])
  .then(() => {
    resetReader();
    setActivePage("search");
    renderAppMeta();
    renderSummary();
  })
  .catch((error) => {
    setStatus(error.message, "error");
    resetReader("初始化失败，请检查接口是否正常。");
  });
