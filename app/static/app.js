const state = {
  appMeta: {
    title: "Reader Hub",
    version: "0.0.0",
  },
  auth: {
    user: null,
  },
  ui: {
    activePage: "search",
    lastBrowsePage: "search",
    selectedResultKey: null,
    detailBookKey: null,
    recentSearches: [],
    readingHistory: [],
    pendingUploadFiles: [],
    sourcePage: 1,
    sourcePageSize: 12,
    selectedSourceIds: [],
    readerFocusMode: false,
    readerSidebarCollapsed: false,
    readerDrawerOpen: false,
    readerToolbarHidden: false,
    readerChapterListExpanded: false,
    readerMenuOpen: false,
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
const READING_HISTORY_STORAGE_KEY = "reader-hub-reading-history";
const SUPPORTED_UPLOAD_EXTENSIONS = new Set(["txt", "md", "epub"]);
const themeLabelMap = {
  warm: "暖纸",
  mist: "雾白",
  night: "夜读",
};
const BQG_STANDARD_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
  Accept: "*/*",
  Referer: "https://www.bqg496.xyz/",
  "X-Requested-With": "XMLHttpRequest",
};

const BQG_STRICT_HEADERS = {
  ...BQG_STANDARD_HEADERS,
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  Origin: "https://www.bqg496.xyz",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
};

const PRIVATE_SITE_PRESETS = {
  bqg_api: {
    label: "笔趣阁前端站",
    values: {
      name: "笔趣阁前端站示例",
      description: "适合前端页面 + JSON API 的笔趣阁类站点，可直接接入搜索、目录和正文",
      base_url: "https://www.bqg496.xyz",
      headers: BQG_STANDARD_HEADERS,
      search_url: "https://www.bqg496.xyz/api/search?q={keyword}",
      search_list: "data",
      search_title: "title",
      search_author: "author",
      search_cover: "",
      search_intro: "intro",
      search_detail_url: "id",
      search_latest_chapter: "",
      detail_title: "title",
      detail_author: "author",
      detail_cover: "",
      detail_intro: "intro",
      detail_status: "full",
      toc_list: "list",
      toc_title: "value",
      toc_url: "_index",
      toc_next_url: "",
      content_body: "txt",
      content_next_url: "",
      test_keyword: "凡人修仙",
    },
  },
  bqg_api_standard: {
    label: "笔趣阁前端站（标准版）",
    values: {
      name: "笔趣阁前端站标准版",
      description: "适合大多数前端页面 + JSON API 的笔趣阁类站点，常规请求头即可命中",
      base_url: "https://www.bqg496.xyz",
      headers: BQG_STANDARD_HEADERS,
      search_url: "https://www.bqg496.xyz/api/search?q={keyword}",
      search_list: "data",
      search_title: "title",
      search_author: "author",
      search_cover: "",
      search_intro: "intro",
      search_detail_url: "id",
      search_latest_chapter: "",
      detail_title: "title",
      detail_author: "author",
      detail_cover: "",
      detail_intro: "intro",
      detail_status: "full",
      toc_list: "list",
      toc_title: "value",
      toc_url: "_index",
      toc_next_url: "",
      content_body: "txt",
      content_next_url: "",
      test_keyword: "凡人修仙",
    },
  },
  bqg_api_cf: {
    label: "笔趣阁前端站（严格请求头）",
    values: {
      name: "笔趣阁前端站严格版",
      description: "适合对请求头更敏感、需要更像浏览器 AJAX 请求的笔趣阁类站点",
      base_url: "https://www.bqg496.xyz",
      headers: BQG_STRICT_HEADERS,
      search_url: "https://www.bqg496.xyz/api/search?q={keyword}",
      search_list: "data",
      search_title: "title",
      search_author: "author",
      search_cover: "",
      search_intro: "intro",
      search_detail_url: "id",
      search_latest_chapter: "",
      detail_title: "title",
      detail_author: "author",
      detail_cover: "",
      detail_intro: "intro",
      detail_status: "full",
      toc_list: "list",
      toc_title: "value",
      toc_url: "_index",
      toc_next_url: "",
      content_body: "txt",
      content_next_url: "",
      test_keyword: "凡人修仙",
    },
  },
  html_pc: {
    label: "PC HTML 列表站",
    values: {
      name: "PC HTML 书站示例",
      description: "常见 PC 端 HTML 搜索 + 详情 + 目录站点",
      base_url: "https://books.example.com",
      headers: { "User-Agent": "ReaderHub Private Connector/1.0" },
      search_url: "https://books.example.com/search?keyword={keyword}",
      search_list: ".search-list .book-item",
      search_title: ".book-title@text",
      search_author: ".book-author@text",
      search_cover: "img@src",
      search_intro: ".book-intro@text",
      search_detail_url: ".book-title@href",
      search_latest_chapter: ".book-latest@text",
      detail_title: ".book-header h1@text",
      detail_author: ".book-meta .author@text",
      detail_cover: ".book-cover img@src",
      detail_intro: "#bookIntro@text",
      detail_status: ".book-status@text",
      toc_list: ".chapter-list li",
      toc_title: "a@text",
      toc_url: "a@href",
      toc_next_url: "",
      content_body: "#content@html",
      content_next_url: "",
      test_keyword: "凡人修仙",
    },
  },
  mobile_paged: {
    label: "移动站多页正文",
    values: {
      name: "移动站多页正文示例",
      description: "适合目录页正常、正文需要翻页拼接的移动站",
      base_url: "https://m.books.example.com",
      headers: { "User-Agent": "Mozilla/5.0 ReaderHub Mobile" },
      search_url: "https://m.books.example.com/search?keyword={keyword}",
      search_list: ".search-item",
      search_title: ".book-title@text",
      search_author: ".book-author@text",
      search_cover: ".book-cover img@src",
      search_intro: ".book-desc@text",
      search_detail_url: "a@href",
      search_latest_chapter: ".book-update@text",
      detail_title: ".book-info h1@text",
      detail_author: ".book-meta .author@text",
      detail_cover: ".book-cover img@src",
      detail_intro: ".book-intro@text",
      detail_status: ".book-status@text",
      toc_list: ".chapter-list li",
      toc_title: "a@text",
      toc_url: "a@href",
      toc_next_url: ".pagination .next@href",
      content_body: "#nr1@html",
      content_next_url: ".page-next@href",
      test_keyword: "斗破苍穹",
    },
  },
  json_api: {
    label: "JSON API 站",
    values: {
      name: "JSON API 书站示例",
      description: "搜索、目录和正文都直接走 JSON 接口",
      base_url: "https://api.books.example.com",
      headers: { Authorization: "Bearer your-token" },
      search_url: "https://api.books.example.com/search?keyword={keyword}",
      search_list: "data.list",
      search_title: "title",
      search_author: "author",
      search_cover: "cover",
      search_intro: "intro",
      search_detail_url: "detailUrl",
      search_latest_chapter: "latestChapter",
      detail_title: "data.book.title",
      detail_author: "data.book.author",
      detail_cover: "data.book.cover",
      detail_intro: "data.book.intro",
      detail_status: "data.book.status",
      toc_list: "data.chapters",
      toc_title: "title",
      toc_url: "url",
      toc_next_url: "data.nextPageUrl",
      content_body: "data.content",
      content_next_url: "data.nextPageUrl",
      test_keyword: "雪中悍刀行",
    },
  },
  json_search_html_read: {
    label: "JSON 搜索 + HTML 阅读",
    values: {
      name: "JSON 搜索 + HTML 阅读示例",
      description: "搜索接口是 JSON，详情页、目录页、正文页还是 HTML",
      base_url: "https://books.example.com",
      headers: { "User-Agent": "ReaderHub Hybrid Connector/1.0" },
      search_url: "https://books.example.com/api/search?keyword={keyword}",
      search_list: "data.items",
      search_title: "title",
      search_author: "author",
      search_cover: "cover",
      search_intro: "intro",
      search_detail_url: "detailUrl",
      search_latest_chapter: "latestChapter",
      detail_title: ".book-header h1@text",
      detail_author: ".book-meta .author@text",
      detail_cover: ".book-cover img@src",
      detail_intro: "#intro@text",
      detail_status: ".status@text",
      toc_list: ".chapter-list li",
      toc_title: "a@text",
      toc_url: "a@href",
      toc_next_url: "",
      content_body: "#content@html",
      content_next_url: ".next-page@href",
      test_keyword: "庆余年",
    },
  },
  xpath_site: {
    label: "XPath 站点",
    values: {
      name: "XPath 书站示例",
      description: "适合结构稳定、XPath 更容易命中的老站点",
      base_url: "https://novel.example.com",
      headers: { "User-Agent": "ReaderHub XPath Connector/1.0" },
      search_url: "https://novel.example.com/search?keyword={keyword}",
      search_list: "//div[contains(@class,'book-item')]",
      search_title: ".//h3/a/text()",
      search_author: ".//p[contains(@class,'author')]/text()",
      search_cover: ".//img/@src",
      search_intro: ".//p[contains(@class,'intro')]/text()",
      search_detail_url: ".//h3/a/@href",
      search_latest_chapter: ".//p[contains(@class,'latest')]/text()",
      detail_title: "//div[@class='book-header']/h1/text()",
      detail_author: "//span[@class='author']/text()",
      detail_cover: "//div[@class='cover']//img/@src",
      detail_intro: "//div[@id='intro']",
      detail_status: "//span[@class='status']/text()",
      toc_list: "//ul[@class='chapter-list']/li",
      toc_title: ".//a/text()",
      toc_url: ".//a/@href",
      toc_next_url: "//a[contains(@class,'next')]/@href",
      content_body: "//div[@id='content']",
      content_next_url: "//a[contains(@class,'next-page')]/@href",
      test_keyword: "诛仙",
    },
  },
};

const elements = {
  sourceJson: document.querySelector("#source-json"),
  authScreen: document.querySelector("#auth-screen"),
  loginForm: document.querySelector("#login-form"),
  loginUsername: document.querySelector("#login-username"),
  loginPassword: document.querySelector("#login-password"),
  loginStatus: document.querySelector("#login-status"),
  currentUserBadge: document.querySelector("#current-user-badge"),
  logoutBtn: document.querySelector("#logout-btn"),
  sourceFile: document.querySelector("#source-file"),
  importBtn: document.querySelector("#import-btn"),
  loadSampleBtn: document.querySelector("#load-sample-btn"),
  privateSiteAutodetectUrl: document.querySelector("#private-site-autodetect-url"),
  privateSiteAutodetectBtn: document.querySelector("#private-site-autodetect-btn"),
  privateSiteName: document.querySelector("#private-site-name"),
  privateSiteDescription: document.querySelector("#private-site-description"),
  privateSiteBaseUrl: document.querySelector("#private-site-base-url"),
  privateSiteHeaders: document.querySelector("#private-site-headers"),
  privateSiteSearchUrl: document.querySelector("#private-site-search-url"),
  privateSiteSearchList: document.querySelector("#private-site-search-list"),
  privateSiteSearchTitle: document.querySelector("#private-site-search-title"),
  privateSiteSearchAuthor: document.querySelector("#private-site-search-author"),
  privateSiteSearchCover: document.querySelector("#private-site-search-cover"),
  privateSiteSearchIntro: document.querySelector("#private-site-search-intro"),
  privateSiteSearchDetailUrl: document.querySelector("#private-site-search-detail-url"),
  privateSiteSearchLatest: document.querySelector("#private-site-search-latest"),
  privateSiteDetailTitle: document.querySelector("#private-site-detail-title"),
  privateSiteDetailAuthor: document.querySelector("#private-site-detail-author"),
  privateSiteDetailCover: document.querySelector("#private-site-detail-cover"),
  privateSiteDetailIntro: document.querySelector("#private-site-detail-intro"),
  privateSiteDetailStatus: document.querySelector("#private-site-detail-status"),
  privateSiteTocList: document.querySelector("#private-site-toc-list"),
  privateSiteTocTitle: document.querySelector("#private-site-toc-title"),
  privateSiteTocUrl: document.querySelector("#private-site-toc-url"),
  privateSiteTocNext: document.querySelector("#private-site-toc-next"),
  privateSiteContentBody: document.querySelector("#private-site-content-body"),
  privateSiteContentNext: document.querySelector("#private-site-content-next"),
  privateSiteTestKeyword: document.querySelector("#private-site-test-keyword"),
  privateSiteSampleBtn: document.querySelector("#private-site-sample-btn"),
  privateSiteTestBtn: document.querySelector("#private-site-test-btn"),
  privateSiteImportBtn: document.querySelector("#private-site-import-btn"),
  privateSiteGenerateBtn: document.querySelector("#private-site-generate-btn"),
  privateSitePreview: document.querySelector("#private-site-preview"),
  privateSitePresetButtons: Array.from(document.querySelectorAll("[data-private-site-preset]")),
  sourceList: document.querySelector("#source-list"),
  sourceCount: document.querySelector("#source-count"),
  shelfList: document.querySelector("#shelf-list"),
  shelfCount: document.querySelector("#shelf-count"),
  shelfSearchInput: document.querySelector("#shelf-search-input"),
  shelfCategoryFilter: document.querySelector("#shelf-category-filter"),
  shelfUploadFile: document.querySelector("#shelf-upload-file"),
  shelfUploadDirectory: document.querySelector("#shelf-upload-directory"),
  shelfUploadCategory: document.querySelector("#shelf-upload-category"),
  shelfUploadTags: document.querySelector("#shelf-upload-tags"),
  shelfUploadDropzone: document.querySelector("#shelf-upload-dropzone"),
  shelfUploadSelection: document.querySelector("#shelf-upload-selection"),
  shelfUploadFilesTrigger: document.querySelector("#shelf-upload-files-trigger"),
  shelfUploadDirectoryTrigger: document.querySelector("#shelf-upload-directory-trigger"),
  shelfUploadClearBtn: document.querySelector("#shelf-upload-clear-btn"),
  shelfUploadProgressText: document.querySelector("#shelf-upload-progress-text"),
  shelfUploadProgressBar: document.querySelector("#shelf-upload-progress-bar"),
  shelfUploadBtn: document.querySelector("#shelf-upload-btn"),
  uploadApiEndpoint: document.querySelector("#upload-api-endpoint"),
  uploadPortalLink: document.querySelector("#upload-portal-link"),
  copyUploadLinkBtn: document.querySelector("#copy-upload-link-btn"),
  sourcePageSize: document.querySelector("#source-page-size"),
  sourcePrevPage: document.querySelector("#source-prev-page"),
  sourceNextPage: document.querySelector("#source-next-page"),
  sourcePaginationInfo: document.querySelector("#source-pagination-info"),
  sourceSelectPageBtn: document.querySelector("#source-select-page-btn"),
  sourceClearSelectionBtn: document.querySelector("#source-clear-selection-btn"),
  sourceDeleteSelectedBtn: document.querySelector("#source-delete-selected-btn"),
  sourceDeleteAllBtn: document.querySelector("#source-delete-all-btn"),
  sourceSelectionInfo: document.querySelector("#source-selection-info"),
  searchForm: document.querySelector("#search-form"),
  pageShell: document.querySelector("#page-shell"),
  workspace: document.querySelector(".workspace"),
  keywordInput: document.querySelector("#keyword-input"),
  results: document.querySelector("#results"),
  resultCount: document.querySelector("#result-count"),
  resultsHelper: document.querySelector("#results-helper"),
  resultsFocusBadge: document.querySelector("#results-focus-badge"),
  statusPill: document.querySelector("#status-pill"),
  sourceStatusSummary: document.querySelector("#source-status-summary"),
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
  chapterListToggleBtn: document.querySelector("#chapter-list-toggle-btn"),
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
  readerMenuBtn: document.querySelector("#reader-menu-btn"),
  readerMenuPanel: document.querySelector("#reader-menu-panel"),
  readerPageTitle: document.querySelector("#reader-page-title"),
  readerPageMeta: document.querySelector("#reader-page-meta"),
  readerToolbarProgress: document.querySelector("#reader-toolbar-progress"),
  readerBottomPrevBtn: document.querySelector("#reader-bottom-prev-btn"),
  readerBottomNextBtn: document.querySelector("#reader-bottom-next-btn"),
  readerBottomTitle: document.querySelector("#reader-bottom-title"),
  readerBottomProgress: document.querySelector("#reader-bottom-progress"),
  readerScrollTopBtn: document.querySelector("#reader-scroll-top-btn"),
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
  adminUserCount: document.querySelector("#admin-user-count"),
  adminNewUsername: document.querySelector("#admin-new-username"),
  adminNewPassword: document.querySelector("#admin-new-password"),
  adminNewRole: document.querySelector("#admin-new-role"),
  adminCreateUserBtn: document.querySelector("#admin-create-user-btn"),
  adminUserList: document.querySelector("#admin-user-list"),
  profileRoleBadge: document.querySelector("#profile-role-badge"),
  profileUsername: document.querySelector("#profile-username"),
  profileRolePill: document.querySelector("#profile-role-pill"),
  profileDescription: document.querySelector("#profile-description"),
  profileSourceCount: document.querySelector("#profile-source-count"),
  profileShelfCount: document.querySelector("#profile-shelf-count"),
  profileReadingCount: document.querySelector("#profile-reading-count"),
  profileThemeValue: document.querySelector("#profile-theme-value"),
  profileFontSizeValue: document.querySelector("#profile-font-size-value"),
  profileWidthValue: document.querySelector("#profile-width-value"),
  profileLineHeightValue: document.querySelector("#profile-line-height-value"),
  profileGoSearchBtn: document.querySelector("#profile-go-search-btn"),
  profileGoShelfBtn: document.querySelector("#profile-go-shelf-btn"),
  profileGoReaderBtn: document.querySelector("#profile-go-reader-btn"),
  profileRecentReading: document.querySelector("#profile-recent-reading"),
  profileSearchHistory: document.querySelector("#profile-search-history"),
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
  homeRankingList: document.querySelector("#home-ranking-list"),
  homeCategoryList: document.querySelector("#home-category-list"),
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
  bookDetailPageTitle: document.querySelector("#book-detail-page-title"),
  bookDetailBackBtn: document.querySelector("#book-detail-back-btn"),
  bookDetailSource: document.querySelector("#book-detail-source"),
  bookDetailTitle: document.querySelector("#book-detail-title"),
  bookDetailAuthor: document.querySelector("#book-detail-author"),
  bookDetailMeta: document.querySelector("#book-detail-meta"),
  bookDetailIntro: document.querySelector("#book-detail-intro"),
  bookDetailCover: document.querySelector("#book-detail-cover"),
  bookDetailFacts: document.querySelector("#book-detail-facts"),
  bookDetailTags: document.querySelector("#book-detail-tags"),
  bookDetailPrimaryBtn: document.querySelector("#book-detail-primary-btn"),
  bookDetailSecondaryBtn: document.querySelector("#book-detail-secondary-btn"),
  bookDetailChapters: document.querySelector("#book-detail-chapters"),
  bookDetailChapterCount: document.querySelector("#book-detail-chapter-count"),
  bookDetailRelated: document.querySelector("#book-detail-related"),
  readerSessionLabel: document.querySelector("#reader-session-label"),
  readerProgressText: document.querySelector("#reader-progress-text"),
  readerProgressBadge: document.querySelector("#reader-progress-badge"),
  readerProgressBar: document.querySelector("#reader-progress-bar"),
  resultsSection: document.querySelector(".results-section"),
};

function setStatus(text, type = "idle") {
  elements.statusPill.textContent = text;
  elements.statusPill.className = `status-pill ${type}`;
}

function currentUser() {
  return state.auth.user;
}

function userIsAdmin() {
  return currentUser()?.role === "admin";
}

function setAuthState(user) {
  state.auth.user = user || null;
  const loggedIn = Boolean(state.auth.user);
  elements.authScreen.classList.toggle("hidden", loggedIn);
  elements.pageShell.classList.toggle("hidden", !loggedIn);
  elements.logoutBtn.classList.toggle("hidden", !loggedIn);
  elements.currentUserBadge.textContent = loggedIn
    ? `${state.auth.user.username} · ${userIsAdmin() ? "管理员" : "用户"}`
    : "未登录";
  renderProfile();
}

function applyRoleMode() {
  const admin = userIsAdmin();
  document.querySelectorAll("[data-role='admin']").forEach((element) => {
    element.classList.toggle("hidden", !admin);
  });
  document.querySelectorAll(".admin-only").forEach((element) => {
    element.classList.toggle("hidden", !admin);
  });

  if (!admin && ["sources", "tools", "admin"].includes(state.ui.activePage)) {
    state.ui.activePage = "search";
  }
  elements.menuButtons.forEach((button) => {
    button.classList.toggle("hidden", button.dataset.role === "admin" && !admin);
  });
}

function getSourceById(sourceId) {
  return state.sources.find((source) => source.id === sourceId) || null;
}

function getShelfBookByKey(bookKey) {
  return state.shelfBooks.find((book) => book.book_key === bookKey) || null;
}

function isProtectedSource(source) {
  return Boolean(source && source.name === "本地导入书库");
}

function syncSelectedSources() {
  const validIds = new Set(state.sources.map((source) => source.id));
  state.ui.selectedSourceIds = state.ui.selectedSourceIds.filter((id) => validIds.has(id));
}

function getSelectedSourceIds() {
  syncSelectedSources();
  return state.ui.selectedSourceIds;
}

function toggleSelectedSource(sourceId, enabled) {
  const selected = new Set(getSelectedSourceIds());
  if (enabled) {
    selected.add(sourceId);
  } else {
    selected.delete(sourceId);
  }
  state.ui.selectedSourceIds = Array.from(selected);
}

function getSourcePaginationMeta() {
  const totalPages = Math.max(1, Math.ceil(state.sources.length / state.ui.sourcePageSize));
  const normalizedPage = Math.min(Math.max(state.ui.sourcePage, 1), totalPages);
  const startIndex = (normalizedPage - 1) * state.ui.sourcePageSize;
  const pageItems = state.sources.slice(startIndex, startIndex + state.ui.sourcePageSize);
  return {
    totalPages,
    normalizedPage,
    startIndex,
    pageItems,
  };
}

function sourceSupportsReadingConfig(config) {
  if (!config) return false;
  if (config.chapters && config.content) return true;
  const legacyRaw = config.legacy && config.legacy.raw;
  return Boolean(
    legacyRaw &&
      legacyRaw.ruleToc &&
      legacyRaw.ruleToc.chapterList &&
      legacyRaw.ruleContent &&
      legacyRaw.ruleContent.content,
  );
}

function isReadableSource(sourceId) {
  const source = getSourceById(sourceId);
  return Boolean(source && source.config && sourceSupportsReadingConfig(source.config));
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

function formatFileSize(size) {
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const digits = value >= 100 || index === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[index]}`;
}

function hashString(value) {
  const text = String(value || "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function escapeSvgText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildBookPlaceholderDataUrl(book, variant = "default") {
  const title = String(book?.title || "未命名书籍").trim() || "未命名书籍";
  const author = String(book?.author || "Reader Hub").trim() || "Reader Hub";
  const palettes = [
    ["#5b2f1a", "#c56d3c", "#f8e6cf"],
    ["#1f3a5c", "#4c84b6", "#edf5ff"],
    ["#3d2b57", "#8d69c6", "#f3eaff"],
    ["#1d4b44", "#4b9a8f", "#e8faf7"],
    ["#6c2d3a", "#d16f7f", "#fff0f2"],
    ["#4b3520", "#bd9158", "#fbf0dc"],
  ];
  const [deep, accent, light] = palettes[hashString(`${title}-${author}`) % palettes.length];
  const initials = title.replace(/\s+/g, "").slice(0, variant === "compact" ? 2 : 4) || "书籍";
  const authorText = author.length > 12 ? `${author.slice(0, 12)}...` : author;
  const titleText = title.length > 18 ? `${title.slice(0, 18)}...` : title;
  const width = variant === "compact" ? 300 : 600;
  const height = variant === "compact" ? 420 : 840;
  const largeSize = variant === "compact" ? 108 : 168;
  const titleSize = variant === "compact" ? 24 : 40;
  const metaSize = variant === "compact" ? 16 : 22;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${deep}" />
          <stop offset="58%" stop-color="${accent}" />
          <stop offset="100%" stop-color="${light}" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" rx="34" fill="url(#bg)" />
      <circle cx="${width - 72}" cy="74" r="88" fill="rgba(255,255,255,0.10)" />
      <circle cx="48" cy="${height - 48}" r="120" fill="rgba(255,255,255,0.08)" />
      <text x="44" y="84" fill="rgba(255,255,255,0.82)" font-size="${metaSize}" font-family="PingFang SC, Noto Sans SC, sans-serif" letter-spacing="4">READER HUB</text>
      <text x="44" y="${variant === "compact" ? 208 : 294}" fill="rgba(255,255,255,0.94)" font-size="${largeSize}" font-weight="800" font-family="PingFang SC, Noto Sans SC, sans-serif">${escapeSvgText(initials)}</text>
      <text x="44" y="${variant === "compact" ? 284 : 404}" fill="#ffffff" font-size="${titleSize}" font-weight="700" font-family="PingFang SC, Noto Sans SC, sans-serif">${escapeSvgText(titleText)}</text>
      <text x="44" y="${variant === "compact" ? 324 : 452}" fill="rgba(255,255,255,0.9)" font-size="${metaSize}" font-family="PingFang SC, Noto Sans SC, sans-serif">作者：${escapeSvgText(authorText)}</text>
      <rect x="44" y="${height - (variant === "compact" ? 102 : 128)}" width="${variant === "compact" ? 110 : 148}" height="${variant === "compact" ? 34 : 42}" rx="17" fill="rgba(255,255,255,0.16)" />
      <text x="${variant === "compact" ? 99 : 118}" y="${height - (variant === "compact" ? 80 : 99)}" text-anchor="middle" fill="#ffffff" font-size="${metaSize}" font-weight="700" font-family="PingFang SC, Noto Sans SC, sans-serif">暂无封面</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function applyBookCoverImage(imageElement, book, variant = "default") {
  if (!imageElement) return;
  const src = String(book?.cover || "").trim() || buildBookPlaceholderDataUrl(book, variant);
  imageElement.src = src;
  imageElement.style.display = "block";
  imageElement.classList.toggle("cover-placeholder", !String(book?.cover || "").trim());
}

function setShelfUploadProgress(percent, text = "等待选择文件") {
  const normalized = Math.max(0, Math.min(100, Number(percent) || 0));
  if (elements.shelfUploadProgressBar) {
    elements.shelfUploadProgressBar.style.width = `${normalized}%`;
  }
  if (elements.shelfUploadProgressText) {
    elements.shelfUploadProgressText.textContent = text;
  }
}

function getUploadRelativePath(file) {
  return file.readerHubRelativePath || file.webkitRelativePath || file.name;
}

function getUploadFileKey(file) {
  return [getUploadRelativePath(file), file.size, file.lastModified].join("::");
}

function isSupportedUploadFile(file) {
  const extension = String(file.name || "")
    .split(".")
    .pop()
    ?.toLowerCase();
  return Boolean(extension && SUPPORTED_UPLOAD_EXTENSIONS.has(extension));
}

function renderPendingUploadFiles() {
  const files = state.ui.pendingUploadFiles;
  elements.shelfUploadBtn.disabled = !files.length;
  elements.shelfUploadClearBtn.disabled = !files.length;

  if (!files.length) {
    elements.shelfUploadSelection.className = "shelf-upload-selection empty";
    elements.shelfUploadSelection.textContent =
      "还没有选择文件。你可以点“选择整个目录”，也可以直接拖动文件到上面的区域。";
    return;
  }

  const totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0);
  const roots = new Set(
    files
      .map((file) => getUploadRelativePath(file).split("/")[0])
      .filter(Boolean),
  );

  elements.shelfUploadSelection.className = "shelf-upload-selection";
  elements.shelfUploadSelection.innerHTML = `
    <div class="shelf-upload-selection-head">
      <strong>已选 ${files.length} 个文件</strong>
      <span class="muted">来自 ${roots.size} 个目录或来源 · ${formatFileSize(totalSize)}</span>
    </div>
  `;

  const list = document.createElement("div");
  list.className = "shelf-upload-file-list";
  files.forEach((file) => {
    const item = document.createElement("div");
    item.className = "shelf-upload-file-item";
    item.innerHTML = `
      <strong>${file.name}</strong>
      <span class="muted">${getUploadRelativePath(file)}</span>
      <span class="badge">${formatFileSize(file.size || 0)}</span>
    `;
    list.appendChild(item);
  });
  elements.shelfUploadSelection.appendChild(list);
}

function mergePendingUploadFiles(files) {
  const accepted = [];
  let ignoredCount = 0;

  files.forEach((file) => {
    if (isSupportedUploadFile(file)) {
      accepted.push(file);
    } else {
      ignoredCount += 1;
    }
  });

  const fileMap = new Map(
    state.ui.pendingUploadFiles.map((file) => [getUploadFileKey(file), file]),
  );
  accepted.forEach((file) => {
    fileMap.set(getUploadFileKey(file), file);
  });
  state.ui.pendingUploadFiles = Array.from(fileMap.values()).sort((left, right) =>
    getUploadRelativePath(left).localeCompare(getUploadRelativePath(right), "zh-CN"),
  );
  renderPendingUploadFiles();

  if (accepted.length) {
    setStatus(`已加入 ${accepted.length} 个待上传文件`, "idle");
  }
  if (ignoredCount) {
    setStatus(`已忽略 ${ignoredCount} 个不支持的文件`, "error");
  }
}

function clearPendingUploadFiles() {
  state.ui.pendingUploadFiles = [];
  elements.shelfUploadFile.value = "";
  elements.shelfUploadDirectory.value = "";
  renderPendingUploadFiles();
  setShelfUploadProgress(0, "等待选择文件");
}

async function readDirectoryEntry(entry, pathPrefix = "") {
  if (!entry) return [];
  if (entry.isFile) {
    return new Promise((resolve) => {
      entry.file((file) => {
        file.readerHubRelativePath = `${pathPrefix}${file.name}`;
        resolve([file]);
      });
    });
  }

  if (!entry.isDirectory) return [];

  const reader = entry.createReader();
  const entries = [];
  while (true) {
    const batch = await new Promise((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (!batch.length) break;
    entries.push(...batch);
  }

  const nestedFiles = await Promise.all(
    entries.map((child) => readDirectoryEntry(child, `${pathPrefix}${entry.name}/`)),
  );
  return nestedFiles.flat();
}

async function extractDroppedUploadFiles(dataTransfer) {
  const items = Array.from(dataTransfer.items || []);
  if (items.length && items.some((item) => typeof item.webkitGetAsEntry === "function")) {
    const files = await Promise.all(
      items
        .filter((item) => item.kind === "file")
        .map((item) => readDirectoryEntry(item.webkitGetAsEntry())),
    );
    return files.flat();
  }
  return Array.from(dataTransfer.files || []);
}

async function readDirectoryHandle(directoryHandle, pathPrefix = "") {
  const files = [];
  for await (const [name, handle] of directoryHandle.entries()) {
    const nextPath = `${pathPrefix}${name}`;
    if (handle.kind === "file") {
      const file = await handle.getFile();
      file.readerHubRelativePath = nextPath;
      files.push(file);
      continue;
    }
    if (handle.kind === "directory") {
      const nested = await readDirectoryHandle(handle, `${nextPath}/`);
      files.push(...nested);
    }
  }
  return files;
}

async function openBrowserFilePicker() {
  if (typeof window.showOpenFilePicker === "function") {
    try {
      const handles = await window.showOpenFilePicker({
        multiple: true,
        types: [
          {
            description: "书籍文件",
            accept: {
              "text/plain": [".txt", ".md"],
              "application/epub+zip": [".epub"],
            },
          },
        ],
      });
      const files = await Promise.all(
        handles.map(async (handle) => {
          const file = await handle.getFile();
          file.readerHubRelativePath = file.name;
          return file;
        }),
      );
      mergePendingUploadFiles(files);
    } catch (error) {
      if (error?.name !== "AbortError") {
        setStatus("浏览器文件选择失败，请重试", "error");
      }
    }
    return;
  }
  elements.shelfUploadFile.click();
}

async function openBrowserDirectoryPicker() {
  if (typeof window.showDirectoryPicker === "function") {
    try {
      const handle = await window.showDirectoryPicker();
      const files = await readDirectoryHandle(handle);
      mergePendingUploadFiles(files);
    } catch (error) {
      if (error?.name !== "AbortError") {
        setStatus("浏览器目录选择失败，请重试", "error");
      }
    }
    return;
  }
  elements.shelfUploadDirectory.click();
}

function sendMultipartUpload(url, formData, { onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", url);
    request.responseType = "json";
    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable || typeof onProgress !== "function") return;
      const percent = Math.round((event.loaded / event.total) * 100);
      onProgress(percent, event);
    });
    request.addEventListener("load", () => {
      const payload = request.response || {};
      if (request.status >= 200 && request.status < 300) {
        resolve(payload);
        return;
      }
      reject(new Error(payload.detail || request.statusText || "上传失败"));
    });
    request.addEventListener("error", () => reject(new Error("上传失败，请检查网络连接")));
    request.send(formData);
  });
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

function loadReadingHistory() {
  try {
    const raw = window.localStorage.getItem(READING_HISTORY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    state.ui.readingHistory = Array.isArray(parsed) ? parsed.filter(Boolean).slice(0, 10) : [];
  } catch {
    state.ui.readingHistory = [];
  }
}

function persistRecentSearches() {
  window.localStorage.setItem(
    RECENT_SEARCH_STORAGE_KEY,
    JSON.stringify(state.ui.recentSearches.slice(0, 8)),
  );
}

function persistReadingHistory() {
  window.localStorage.setItem(
    READING_HISTORY_STORAGE_KEY,
    JSON.stringify(state.ui.readingHistory.slice(0, 10)),
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

function rememberReadingBook(book, chapterTitle = "") {
  const normalizedBook = withBookSourceContext(book);
  if (!normalizedBook?.book_key) return;
  const item = {
    book_key: normalizedBook.book_key,
    title: normalizedBook.title || "未命名书籍",
    author: normalizedBook.author || "",
    source_id: normalizedBook.source_id || state.reader.sourceId || 0,
    source_name: normalizedBook.source_name || state.reader.sourceName || "",
    latest_chapter: chapterTitle || "",
    at: new Date().toISOString(),
    book: normalizedBook,
  };
  state.ui.readingHistory = [
    item,
    ...state.ui.readingHistory.filter((entry) => entry.book_key !== item.book_key),
  ].slice(0, 10);
  persistReadingHistory();
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
  renderProfile();
}

function currentReaderBook() {
  return state.reader.book;
}

function withBookSourceContext(book) {
  if (!book) return null;
  if (book.source_id) return book;
  if (state.reader.book?.book_key && state.reader.book.book_key === book.book_key) {
    return {
      ...book,
      source_id: state.reader.sourceId,
      source_name: book.source_name || state.reader.sourceName,
    };
  }
  return book;
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
    elements.readerToolbarProgress.textContent = "第 0 / 0 章";
    return;
  }

  const current = active >= 0 ? active + 1 : 0;
  const percent = current > 0 ? Math.round((current / total) * 100) : 0;
  elements.readerSessionLabel.textContent = state.reader.book.title || "沉浸阅读";
  elements.readerProgressText.textContent =
    current > 0 ? `已读到第 ${current} / ${total} 章` : `共 ${total} 章，选择章节开始阅读`;
  elements.readerProgressBadge.textContent = `${percent}%`;
  elements.readerProgressBar.style.width = `${percent}%`;
  elements.readerToolbarProgress.textContent = `第 ${Math.max(current, 0)} / ${total} 章`;
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

function setReaderMenuOpen(enabled) {
  state.ui.readerMenuOpen = Boolean(enabled);
  elements.readerMenuPanel.classList.toggle("hidden", !state.ui.readerMenuOpen);
  elements.readerMenuBtn.textContent = state.ui.readerMenuOpen ? "收起" : "更多";
  elements.readerMenuBtn.setAttribute("aria-expanded", String(state.ui.readerMenuOpen));
}

function setReaderDrawerOpen(enabled) {
  state.ui.readerDrawerOpen = Boolean(enabled);
  elements.readerDrawer.classList.toggle("hidden", !state.ui.readerDrawerOpen);
  elements.readerDrawerOverlay.classList.toggle("hidden", !state.ui.readerDrawerOpen);
  elements.readerDrawerBtn.textContent = state.ui.readerDrawerOpen ? "关闭目录" : "目录抽屉";
  if (state.ui.readerDrawerOpen) {
    setReaderMenuOpen(false);
  }
}

function setReaderToolbarHidden(enabled) {
  state.ui.readerToolbarHidden = Boolean(enabled);
  elements.pageShell.classList.toggle("reader-toolbar-hidden", state.ui.readerToolbarHidden);
}

function setReaderChapterListExpanded(enabled) {
  state.ui.readerChapterListExpanded = Boolean(enabled);
  elements.chapterList.classList.toggle("collapsed", !state.ui.readerChapterListExpanded);
  elements.chapterListToggleBtn.textContent = state.ui.readerChapterListExpanded ? "收起目录" : "展开目录";
}

function getScrollContainer() {
  return elements.workspace || window;
}

function scrollReaderToTop() {
  const target = getScrollContainer();
  if (target === window) {
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  target.scrollTo({ top: 0, behavior: "smooth" });
}

function updateReaderScrollTopButton() {
  if (!elements.readerScrollTopBtn) return;
  const target = getScrollContainer();
  const currentTop = target === window ? window.scrollY : target.scrollTop;
  const shouldShow = state.ui.activePage === "reader" && currentTop > 280;
  elements.readerScrollTopBtn.classList.toggle("hidden", !shouldShow);
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

function renderProfile() {
  const user = currentUser();
  if (!user) {
    elements.profileUsername.textContent = "未登录";
    elements.profileRoleBadge.textContent = "访客";
    elements.profileRolePill.textContent = "访客";
    elements.profileDescription.textContent = "登录后可以在这里看到当前身份、可用功能和阅读习惯。";
    elements.profileSourceCount.textContent = "0";
    elements.profileShelfCount.textContent = "0";
    elements.profileReadingCount.textContent = "0";
  } else {
    const roleLabel = userIsAdmin() ? "管理员" : "读者用户";
    elements.profileUsername.textContent = user.username;
    elements.profileRoleBadge.textContent = roleLabel;
    elements.profileRolePill.textContent = roleLabel;
    elements.profileDescription.textContent = userIsAdmin()
      ? "你当前拥有完整后台权限，可以管理书源、用户和数据，同时也能从前台像普通读者一样搜书和阅读。"
      : "你现在使用的是前台读者界面，可以搜书、收藏到书架、继续阅读和调整阅读设置。";
    elements.profileSourceCount.textContent = String(state.summary.source_count || state.sources.length || 0);
    elements.profileShelfCount.textContent = String(state.shelfBooks.length || 0);
    elements.profileReadingCount.textContent = String(
      state.shelfBooks.filter((book) => book.last_chapter_index >= 0 || book.last_read_at).length,
    );
  }

  elements.profileThemeValue.textContent = themeLabelMap[state.preferences.theme] || "暖纸";
  elements.profileFontSizeValue.textContent = `${state.preferences.font_size}px`;
  elements.profileWidthValue.textContent = `${state.preferences.content_width}px`;
  elements.profileLineHeightValue.textContent = Number(state.preferences.line_height).toFixed(1);
  elements.profileGoShelfBtn.disabled = !currentUser();
  elements.profileGoReaderBtn.disabled = !(state.reader.book || state.ui.readingHistory.length);

  const recentReadingItems = state.ui.readingHistory.slice(0, 6).map((item) => ({
    title: item.title,
    subtitle: item.author ? `作者：${item.author}` : item.source_name || "最近打开",
    meta: item.latest_chapter || "点击继续阅读",
    onClick: () => openBook(item.book, { autoRead: true }),
  }));
  renderInteractiveBookList(
    elements.profileRecentReading,
    recentReadingItems,
    "打开过的书会出现在这里，方便从个人中心直接回到最近阅读位置。",
  );

  const searchHistoryItems = state.ui.recentSearches.slice(0, 10).map((keyword) => ({
    label: keyword,
    value: keyword,
  }));
  renderHistoryChips(
    elements.profileSearchHistory,
    searchHistoryItems,
    (value) => {
      setActivePage("search");
      runQuickSearch(value);
    },
    "你的最近搜索会显示在这里，方便一键重新开始。",
  );
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

function getCurrentDetailBook() {
  return (
    state.results.find((item) => item.book_key === state.ui.detailBookKey) ||
    state.shelfBooks.find((item) => item.book_key === state.ui.detailBookKey)?.book ||
    null
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
    elements.homeSpotlightPrimary.textContent = "开始搜索";
    elements.homeSpotlightSecondary.textContent = "个人中心";
    elements.homeSpotlightPrimary.addEventListener("click", () => setActivePage("search"));
    elements.homeSpotlightSecondary.addEventListener("click", () => {
      setActivePage("profile");
    });
    return;
  }

  if (payload.kind === "reading") {
    elements.homeSpotlightPrimary.textContent = "继续阅读";
    elements.homeSpotlightSecondary.textContent = "书籍详情";
    elements.homeSpotlightPrimary.addEventListener("click", () => {
      setActivePage("reader");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    elements.homeSpotlightSecondary.addEventListener("click", () => showBookDetail(payload.book));
    return;
  }

  if (payload.kind === "shelf" && payload.shelfBook) {
    elements.homeSpotlightPrimary.textContent = "继续阅读";
    elements.homeSpotlightSecondary.textContent = "书籍详情";
    elements.homeSpotlightPrimary.addEventListener("click", () => continueShelfBook(payload.shelfBook));
    elements.homeSpotlightSecondary.addEventListener("click", () => showBookDetail(payload.shelfBook.book));
    return;
  }

  elements.homeSpotlightPrimary.textContent = isReadableSource(payload.book.source_id) ? "打开阅读" : "加入书架";
  elements.homeSpotlightSecondary.textContent = "书籍详情";
  elements.homeSpotlightPrimary.addEventListener("click", () => {
    if (isReadableSource(payload.book.source_id)) {
      openBook(payload.book);
    } else {
      toggleShelfBook(payload.book);
    }
  });
  elements.homeSpotlightSecondary.addEventListener("click", () => showBookDetail(payload.book));
}

function renderHomeSpotlight() {
  const payload = getHomeSpotlightBook();
  if (!payload) {
    elements.homeSpotlightSource.textContent = "欢迎来到 Reader Hub";
    elements.homeSpotlightTitle.textContent = "先搜索一本你想看的书";
    elements.homeSpotlightAuthor.textContent = "首页会把当前最值得打开的一本书放在这里。";
    elements.homeSpotlightIntro.textContent =
      "你可以直接搜索“月”“凡人”或“诡秘”，这里会自动切换成搜索结果、最近在读或书架里的焦点书。";
    applyBookCoverImage(elements.homeSpotlightCover, { title: "Reader Hub", author: "书城首页" });
    bindHomeSpotlightButtons(null);
    return;
  }

  const book = payload.book;
  elements.homeSpotlightSource.textContent =
    payload.kind === "reading" ? `正在阅读 · ${payload.sourceName}` : payload.sourceName || "推荐书籍";
  elements.homeSpotlightTitle.textContent = book.title || "未命名书籍";
  elements.homeSpotlightAuthor.textContent = book.author ? `作者：${book.author}` : "作者信息待补充";
  elements.homeSpotlightIntro.textContent = book.intro || "这本书还没有简介，可以直接打开看看内容。";
  applyBookCoverImage(elements.homeSpotlightCover, book);
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

function renderHistoryChips(target, items, onSelect, emptyText) {
  if (!items.length) {
    target.className = "search-history-list empty";
    target.textContent = emptyText;
    return;
  }

  target.className = "search-history-list";
  target.innerHTML = "";
  items.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-chip";
    button.textContent = item.label;
    button.addEventListener("click", item.onClick || (() => onSelect(item.value)));
    target.appendChild(button);
  });
}

function renderHomeRankings() {
  const rankingItems = [...state.shelfBooks]
    .sort((left, right) => {
      const leftTime = new Date(left.last_read_at || left.added_at).getTime();
      const rightTime = new Date(right.last_read_at || right.added_at).getTime();
      return rightTime - leftTime;
    })
    .slice(0, 5)
    .map((book, index) => ({
      title: `${index + 1}. ${book.title || "未命名书籍"}`,
      subtitle: book.author ? `作者：${book.author}` : "书架收藏",
      meta: book.last_chapter_title || `来源：${book.source_name}`,
      onClick: () => continueShelfBook(book),
    }));

  renderInteractiveBookList(
    elements.homeRankingList,
    rankingItems,
    "书架里开始有阅读数据后，这里会优先展示最近最值得继续看的书。",
  );
}

function renderHomeCategories() {
  const categoryValues = new Set();
  state.shelfBooks.forEach((book) => {
    if (book.category) categoryValues.add(book.category);
    (book.tags || []).slice(0, 2).forEach((tag) => categoryValues.add(tag));
  });
  state.ui.recentSearches.slice(0, 4).forEach((keyword) => categoryValues.add(keyword));

  const items = Array.from(categoryValues)
    .filter(Boolean)
    .slice(0, 12)
    .map((value) => ({
      label: value,
      value,
    }));

  renderHistoryChips(
    elements.homeCategoryList,
    items,
    (value) => {
      runQuickSearch(value);
    },
    "书架分类、标签和近期搜索会整理成可点选入口，方便更快开始找书。",
  );
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
    elements.resultDetailSecondary.textContent = "个人中心";
    elements.resultDetailPrimary.addEventListener("click", () => {
      elements.keywordInput.focus();
      setActivePage("search");
    });
    elements.resultDetailSecondary.addEventListener("click", () => setActivePage("profile"));
    return;
  }

  const readable = isReadableSource(book.source_id);
  elements.resultDetailPrimary.textContent = readable ? "立即阅读" : "加入书架";
  elements.resultDetailSecondary.textContent = "书籍详情";
  elements.resultDetailPrimary.addEventListener("click", () => {
    if (readable) {
      openBook(book);
    } else {
      toggleShelfBook(book);
    }
  });
  elements.resultDetailSecondary.addEventListener("click", () => {
    showBookDetail(book);
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
    applyBookCoverImage(elements.resultDetailCover, { title: "书籍详情", author: "Reader Hub" });
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
    ...(book.import_channel_label ? [{ label: "导入方式", value: book.import_channel_label }] : []),
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

  applyBookCoverImage(elements.resultDetailCover, book);

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

function bindBookDetailActions(book, readable) {
  elements.bookDetailPrimaryBtn.replaceWith(elements.bookDetailPrimaryBtn.cloneNode(true));
  elements.bookDetailSecondaryBtn.replaceWith(elements.bookDetailSecondaryBtn.cloneNode(true));
  elements.bookDetailPrimaryBtn = document.querySelector("#book-detail-primary-btn");
  elements.bookDetailSecondaryBtn = document.querySelector("#book-detail-secondary-btn");

  if (!book) {
    elements.bookDetailPrimaryBtn.textContent = "返回书城";
    elements.bookDetailSecondaryBtn.textContent = "个人中心";
    elements.bookDetailPrimaryBtn.addEventListener("click", () => setActivePage("search"));
    elements.bookDetailSecondaryBtn.addEventListener("click", () => setActivePage("profile"));
    return;
  }

  elements.bookDetailPrimaryBtn.textContent = readable ? "开始阅读" : "加入书架";
  elements.bookDetailSecondaryBtn.textContent = isBookInShelf(book) ? "前往书架" : "收藏到书架";
  elements.bookDetailPrimaryBtn.addEventListener("click", () => {
    if (readable) {
      openBook(book);
    } else {
      toggleShelfBook(book);
    }
  });
  elements.bookDetailSecondaryBtn.addEventListener("click", () => {
    if (isBookInShelf(book)) {
      setActivePage("shelf");
    } else {
      toggleShelfBook(book);
    }
  });
}

async function showBookDetail(book) {
  book = withBookSourceContext(book);
  state.ui.detailBookKey = book?.book_key || null;
  setActivePage("book");

  if (!book) {
    elements.bookDetailPageTitle.textContent = "先从首页挑一本书";
    elements.bookDetailSource.textContent = "书籍详情";
    elements.bookDetailTitle.textContent = "等待选择书籍";
    elements.bookDetailAuthor.textContent = "作者信息会显示在这里";
    elements.bookDetailMeta.textContent = "这里会显示来源、更新和阅读能力";
    elements.bookDetailIntro.textContent =
      "进入独立详情页后，你可以先看看这本书的简介、章节预览和相关推荐，再决定是否开始阅读。";
    elements.bookDetailFacts.innerHTML = "";
    elements.bookDetailTags.innerHTML = "";
    elements.bookDetailChapters.className = "discovery-list empty";
    elements.bookDetailChapters.textContent = "如果当前书源支持阅读，这里会显示前几章目录预览。";
    elements.bookDetailChapterCount.textContent = "0";
    elements.bookDetailRelated.className = "discovery-list empty";
    elements.bookDetailRelated.textContent = "选中一本书后，这里会补充同作者或同来源推荐。";
    applyBookCoverImage(elements.bookDetailCover, { title: "书籍详情", author: "Reader Hub" });
    bindBookDetailActions(null, false);
    return;
  }

  const readable = isReadableSource(book.source_id);
  elements.bookDetailPageTitle.textContent = book.title || "书籍详情";
  elements.bookDetailSource.textContent = book.source_name || "搜索结果";
  elements.bookDetailTitle.textContent = book.title || "未命名书籍";
  elements.bookDetailAuthor.textContent = book.author ? `作者：${book.author}` : "作者信息待补充";
  elements.bookDetailMeta.textContent = book.latest_chapter
    ? `最新章节：${book.latest_chapter}`
    : readable
      ? "支持直接阅读"
      : "当前书源仅支持搜索";
  elements.bookDetailIntro.textContent = book.intro || "这本书暂时没有简介，可以先看目录预览或直接开始阅读。";
  elements.bookDetailFacts.innerHTML = "";
  elements.bookDetailTags.innerHTML = "";

  [
    { label: "来源", value: book.source_name || "未知来源" },
    { label: "阅读能力", value: readable ? "支持直接阅读" : "当前仅支持搜索" },
    { label: "书架状态", value: isBookInShelf(book) ? "已收藏到书架" : "尚未加入书架" },
    { label: "最新章节", value: book.latest_chapter || "暂无最新章节" },
  ].forEach((item) => {
    const fact = document.createElement("div");
    fact.className = "detail-fact";
    fact.innerHTML = `<span>${item.label}</span><strong>${item.value}</strong>`;
    elements.bookDetailFacts.appendChild(fact);
  });

  [
    readable ? "可阅读" : "仅搜索",
    isBookInShelf(book) ? "已在书架" : "未收藏",
  ].forEach((tag) => {
    const chip = document.createElement("span");
    chip.className = "tag-chip";
    chip.textContent = tag;
    elements.bookDetailTags.appendChild(chip);
  });

  applyBookCoverImage(elements.bookDetailCover, book);

  const relatedBooks = getRelatedBooks(book, 6).map((item) => ({
    title: item.title || "未命名书籍",
    subtitle: item.author ? `作者：${item.author}` : item.source_name,
    meta: item.latest_chapter || item.source_name || "点击查看详情",
    onClick: () => showBookDetail(item),
  }));
  renderInteractiveBookList(
    elements.bookDetailRelated,
    relatedBooks,
    "暂时还没有更多同作者或同来源推荐。",
  );

  bindBookDetailActions(book, readable);

  if (!readable) {
    elements.bookDetailChapterCount.textContent = "0";
    elements.bookDetailChapters.className = "discovery-list empty";
    elements.bookDetailChapters.textContent = "当前书源暂时不支持目录预览。";
    return;
  }

  elements.bookDetailChapterCount.textContent = "...";
  elements.bookDetailChapters.className = "discovery-list empty";
  elements.bookDetailChapters.textContent = "正在加载目录预览...";
  try {
    const payload = await apiFetch("/api/books/open", {
      method: "POST",
      body: JSON.stringify({
        source_id: book.source_id,
        book,
      }),
    });
    const chapters = payload.chapters || [];
    elements.bookDetailChapterCount.textContent = String(chapters.length);
    const previewItems = chapters.slice(0, 10).map((chapter, index) => ({
      title: chapter.title || `第 ${index + 1} 章`,
      subtitle: `第 ${index + 1} 章`,
      meta: "点击进入阅读",
      onClick: async () => {
        await openBook(book, { autoRead: false });
        await readChapter(index);
      },
    }));
    renderInteractiveBookList(
      elements.bookDetailChapters,
      previewItems,
      "目录已加载，但当前没有可展示章节。",
    );
  } catch (error) {
    elements.bookDetailChapterCount.textContent = "0";
    elements.bookDetailChapters.className = "discovery-list empty";
    elements.bookDetailChapters.textContent = `目录预览失败：${error.message}`;
  }
}

function renderHomeSurface() {
  renderHomeSpotlight();
  renderHomeContinue();
  renderHomeRails();
  renderHomeRankings();
  renderHomeCategories();
  renderDiscoverySections();
}

function renderAppMeta() {
  elements.appTitle.textContent = state.appMeta.title;
  elements.appVersionBadge.textContent = `v${state.appMeta.version}`;
  elements.toolsVersionBadge.textContent = `v${state.appMeta.version}`;
  if (elements.uploadApiEndpoint) {
    elements.uploadApiEndpoint.textContent = `${window.location.origin}/api/library/uploads`;
  }
  if (elements.uploadPortalLink) {
    elements.uploadPortalLink.href = `${window.location.origin}/api/library/uploads`;
  }
  if (currentUser()) {
    elements.currentUserBadge.textContent = `${currentUser().username} · ${userIsAdmin() ? "管理员" : "用户"}`;
  }
  document.title = `${state.appMeta.title} v${state.appMeta.version}`;
  renderProfile();
}

function setActivePage(pageId) {
  state.ui.activePage = pageId;
  if (!["reader", "book"].includes(pageId)) {
    state.ui.lastBrowsePage = pageId;
    setReaderToolbarHidden(false);
    setReaderMenuOpen(false);
    setReaderDrawerOpen(false);
  }
  elements.menuButtons.forEach((button) => {
    const buttonPage = button.dataset.page;
    const isActive = buttonPage === pageId || (pageId === "book" && buttonPage === "search");
    button.classList.toggle("active", isActive);
  });
  elements.pagePanels.forEach((panel) => {
    panel.classList.toggle("hidden", panel.id !== `page-${pageId}`);
  });
  elements.pageShell.classList.toggle("reader-page-active", pageId === "reader");
  updateReaderScrollTopButton();
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (response.status === 401 && !options.allowUnauthorized) {
    setAuthState(null);
    applyRoleMode();
    resetReader("登录已失效，请重新登录。");
    throw new Error("请先登录");
  }

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
  elements.readerPageMeta.textContent = "当前章 · 选择章节后开始阅读";
  setReaderSidebarCollapsed(false);
  setReaderMenuOpen(false);
  setReaderDrawerOpen(false);
  setReaderToolbarHidden(false);
  setReaderFocusMode(false);
  setReaderChapterListExpanded(false);
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

function renderAdminUsers(users = []) {
  elements.adminUserCount.textContent = String(users.length);
  if (!users.length) {
    elements.adminUserList.className = "admin-user-list empty";
    elements.adminUserList.textContent = "还没有用户数据。";
    return;
  }

  elements.adminUserList.className = "admin-user-list";
  elements.adminUserList.innerHTML = "";
  users.forEach((user) => {
    const card = document.createElement("article");
    card.className = "admin-user-card";
    card.innerHTML = `
      <div class="admin-user-head">
        <div>
          <strong>${user.username}</strong>
          <p class="muted">创建于 ${formatTime(user.created_at)}</p>
        </div>
        <div class="admin-user-meta">
          <span class="badge">${user.role === "admin" ? "管理员" : "普通用户"}</span>
          <span class="badge">${user.enabled ? "已启用" : "已停用"}</span>
        </div>
      </div>
      <div class="meta-grid">
        <label class="setting-item">
          <span>角色</span>
          <select class="admin-user-role">
            <option value="user" ${user.role === "user" ? "selected" : ""}>普通用户</option>
            <option value="admin" ${user.role === "admin" ? "selected" : ""}>管理员</option>
          </select>
        </label>
        <label class="setting-item">
          <span>重置密码</span>
          <input class="admin-user-password" type="password" placeholder="留空则不修改" />
        </label>
      </div>
      <div class="admin-user-actions">
        <button class="ghost-btn admin-user-save" type="button">保存修改</button>
        <button class="ghost-btn admin-user-toggle" type="button">${user.enabled ? "停用账号" : "启用账号"}</button>
        <button class="delete-btn admin-user-delete" type="button">删除账号</button>
      </div>
    `;
    card.querySelector(".admin-user-save").addEventListener("click", async () => {
      try {
        await apiFetch(`/api/admin/users/${user.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            role: card.querySelector(".admin-user-role").value,
            password: card.querySelector(".admin-user-password").value,
          }),
        });
        setStatus(`已更新用户 ${user.username}`, "success");
        await refreshAdminUsers();
      } catch (error) {
        setStatus(error.message, "error");
      }
    });
    card.querySelector(".admin-user-toggle").addEventListener("click", async () => {
      try {
        await apiFetch(`/api/admin/users/${user.id}`, {
          method: "PATCH",
          body: JSON.stringify({ enabled: !user.enabled }),
        });
        setStatus(`已更新用户 ${user.username}`, "success");
        await refreshAdminUsers();
      } catch (error) {
        setStatus(error.message, "error");
      }
    });
    card.querySelector(".admin-user-delete").addEventListener("click", async () => {
      if (!window.confirm(`确认删除用户 ${user.username} 吗？`)) return;
      try {
        await apiFetch(`/api/admin/users/${user.id}`, { method: "DELETE", headers: {} });
        setStatus(`已删除用户 ${user.username}`, "success");
        await refreshAdminUsers();
      } catch (error) {
        setStatus(error.message, "error");
      }
    });
    elements.adminUserList.appendChild(card);
  });
}

async function refreshCurrentUser() {
  const payload = await apiFetch("/api/auth/me", {
    method: "GET",
    headers: {},
    allowUnauthorized: true,
  }).catch(() => null);
  state.auth.user = payload;
  setAuthState(payload);
  applyRoleMode();
  return payload;
}

async function refreshAdminUsers() {
  if (!userIsAdmin()) {
    renderAdminUsers([]);
    return;
  }
  const users = await apiFetch("/api/admin/users", { method: "GET", headers: {} });
  renderAdminUsers(users);
}

async function initializeAuthenticatedApp() {
  await refreshSources();
  await refreshShelf();
  await refreshPreferences();
  await refreshSummary();
  if (userIsAdmin()) {
    await refreshAdminUsers();
  } else {
    renderAdminUsers([]);
  }
  resetReader();
  renderProfile();
  setActivePage("search");
}

async function loginWithPassword(username, password) {
  const payload = await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  setAuthState(payload.user);
  applyRoleMode();
  await initializeAuthenticatedApp();
  setStatus(`欢迎回来，${payload.user.username}`, "success");
}

async function logoutCurrentUser() {
  try {
    await apiFetch("/api/auth/logout", { method: "POST", headers: {}, allowUnauthorized: true });
  } catch {
    // noop
  }
  state.sources = [];
  state.shelfBooks = [];
  state.results = [];
  resetReader("请登录后继续使用阅读器。");
  renderResults([]);
  renderSources();
  renderAdminUsers([]);
  setAuthState(null);
  applyRoleMode();
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
  elements.sourcePageSize.value = String(state.ui.sourcePageSize);
  renderSourceFilterOptions();
  syncSelectedSources();

  if (!state.sources.length) {
    elements.sourcePaginationInfo.textContent = "0 / 0";
    elements.sourcePrevPage.disabled = true;
    elements.sourceNextPage.disabled = true;
    elements.sourceSelectionInfo.textContent = "已选 0 个";
    elements.sourceSelectPageBtn.disabled = true;
    elements.sourceClearSelectionBtn.disabled = true;
    elements.sourceDeleteSelectedBtn.disabled = true;
    elements.sourceDeleteAllBtn.disabled = true;
    elements.sourceList.className = "source-list empty";
    elements.sourceList.textContent = "暂无书源，请先导入。";
    return;
  }

  const { totalPages, normalizedPage, startIndex, pageItems } = getSourcePaginationMeta();
  state.ui.sourcePage = normalizedPage;
  const selectedIds = new Set(getSelectedSourceIds());
  const deletableAllCount = state.sources.filter((source) => !isProtectedSource(source)).length;
  const selectedDeletableCount = state.sources.filter(
    (source) => selectedIds.has(source.id) && !isProtectedSource(source),
  ).length;
  elements.sourcePaginationInfo.textContent = `${state.ui.sourcePage} / ${totalPages}`;
  elements.sourcePrevPage.disabled = state.ui.sourcePage <= 1;
  elements.sourceNextPage.disabled = state.ui.sourcePage >= totalPages;
  elements.sourceSelectionInfo.textContent = `已选 ${selectedIds.size} 个`;
  elements.sourceSelectPageBtn.disabled = !pageItems.some((source) => !isProtectedSource(source));
  elements.sourceClearSelectionBtn.disabled = !selectedIds.size;
  elements.sourceDeleteSelectedBtn.disabled = !selectedDeletableCount;
  elements.sourceDeleteAllBtn.disabled = !deletableAllCount;

  elements.sourceList.className = "source-list";
  elements.sourceList.innerHTML = "";

  pageItems.forEach((source, index) => {
    const fragment = elements.sourceItemTemplate.content.cloneNode(true);
    const checkbox = fragment.querySelector(".source-checkbox");
    const checkWrap = fragment.querySelector(".source-check");
    const name = fragment.querySelector(".source-name");
    const description = fragment.querySelector(".source-description");
    const enabledTag = fragment.querySelector(".source-enabled");
    const toggleBtn = fragment.querySelector(".toggle-btn");
    const deleteBtn = fragment.querySelector(".delete-btn");
    const config = source.config || {};
    const summaryParts = [];
    if (config.private_site) {
      summaryParts.push("私有站点");
    }
    if (config.legacy && config.legacy.format !== "private_site") {
      summaryParts.push("旧格式兼容");
    }
    summaryParts.push(sourceSupportsReadingConfig(config) ? "支持阅读" : "仅搜索");

    name.textContent = `${String(startIndex + index + 1).padStart(2, "0")} · ${source.name}`;
    description.textContent = [source.description || "未填写说明", summaryParts.join(" · ")]
      .filter(Boolean)
      .join(" · ");
    description.title = description.textContent;
    enabledTag.textContent = source.enabled ? "已启用" : "已停用";
    enabledTag.className = `source-enabled ${source.enabled ? "enabled" : "disabled"}`;
    toggleBtn.textContent = source.enabled ? "停用" : "启用";
    checkbox.checked = selectedIds.has(source.id);
    checkbox.disabled = isProtectedSource(source);
    checkWrap.classList.toggle("disabled", checkbox.disabled);
    if (checkbox.disabled) {
      checkWrap.title = "系统内置书源不支持删除";
    }

    checkbox.addEventListener("change", () => {
      toggleSelectedSource(source.id, checkbox.checked);
      renderSources();
    });
    toggleBtn.addEventListener("click", () => toggleSource(source));
    deleteBtn.addEventListener("click", () => deleteSource(source));
    deleteBtn.disabled = isProtectedSource(source);
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
    if (book.import_channel_label) {
      const chip = document.createElement("span");
      chip.className = "tag-chip";
      chip.textContent = book.import_channel_label;
      tags.appendChild(chip);
    }
    (book.tags || []).forEach((tag) => {
      const chip = document.createElement("span");
      chip.className = "tag-chip";
      chip.textContent = tag;
      tags.appendChild(chip);
    });

    coverWrap.textContent = "";
    applyBookCoverImage(cover, book, "compact");

    resumeBtn.addEventListener("click", () => continueShelfBook(book));
    removeBtn.addEventListener("click", () => handleShelfRemoval(book));
    elements.shelfList.appendChild(fragment);
  });
}

function renderSourceStatus(items = []) {
  if (!items.length) {
    elements.sourceStatusSummary.textContent = state.sources.length
      ? `已连接 ${state.sources.length} 个书源。搜索后这里只保留关键摘要，详细来源信息会折叠起来。`
      : userIsAdmin() ? "导入书源后即可搜索。" : "当前还没有可用书源，请联系管理员配置。";
    elements.sourceStatus.className = "source-status muted";
    elements.sourceStatus.textContent = state.sources.length
      ? "书源已准备好，输入关键词开始搜索。"
      : userIsAdmin() ? "导入书源后即可搜索。" : "当前还没有可用书源，请联系管理员配置。";
    return;
  }

  const hitItems = items.filter((item) => item.success && item.count > 0);
  const zeroHitItems = items.filter((item) => item.success && item.count === 0);
  const failedItems = items.filter((item) => !item.success);
  const totalHits = hitItems.reduce((total, item) => total + item.count, 0);
  const topHitItems = [...hitItems].sort((left, right) => right.count - left.count).slice(0, 6);

  elements.sourceStatusSummary.textContent = [
    `本次共检查 ${items.length} 个书源`,
    hitItems.length ? `${hitItems.length} 个来源搜到结果` : "暂无来源命中",
    failedItems.length ? `${failedItems.length} 个来源报错` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  elements.sourceStatus.className = "source-status";
  elements.sourceStatus.innerHTML = "";

  const shell = document.createElement("section");
  shell.className = "source-status-shell";
  shell.innerHTML = `
    <div class="source-status-headline">
      <strong>${totalHits ? `这次一共搜到 ${totalHits} 本书` : "这次还没有搜到书"}</strong>
      <span>${failedItems.length ? "部分来源异常" : hitItems.length ? "结果已就绪" : "可以换个关键词再试试"}</span>
    </div>
    <div class="source-status-pills">
      <span class="source-stat-pill success">命中 ${hitItems.length}</span>
      <span class="source-stat-pill">${totalHits} 本结果</span>
      <span class="source-stat-pill ${failedItems.length ? "warning" : ""}">失败 ${failedItems.length}</span>
      <span class="source-stat-pill muted-pill">零命中 ${zeroHitItems.length}</span>
    </div>
  `;
  elements.sourceStatus.appendChild(shell);

  if (topHitItems.length) {
    const hitStrip = document.createElement("div");
    hitStrip.className = "source-hit-strip";
    const label = document.createElement("span");
    label.className = "source-hit-strip-label";
    label.textContent = "命中来源";
    hitStrip.appendChild(label);

    topHitItems.forEach((item) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "source-hit-chip";
      chip.textContent = `${item.source_name} · ${item.count}`;
      chip.addEventListener("click", () => {
        state.filters.sourceId = String(item.source_id);
        elements.sourceFilter.value = state.filters.sourceId;
        renderResults();
      });
      hitStrip.appendChild(chip);
    });

    if (hitItems.length > topHitItems.length) {
      const more = document.createElement("span");
      more.className = "source-hit-more";
      more.textContent = `另有 ${hitItems.length - topHitItems.length} 个来源有结果`;
      hitStrip.appendChild(more);
    }

    elements.sourceStatus.appendChild(hitStrip);
  }

  if (failedItems.length) {
    const collapse = document.createElement("details");
    collapse.className = "source-status-collapse";
    collapse.innerHTML = `<summary>查看 ${failedItems.length} 个异常来源</summary>`;
    const list = document.createElement("div");
    list.className = "source-status-list";
    failedItems.forEach((item) => {
      const div = document.createElement("div");
      div.className = "source-status-item failed";
      div.innerHTML = `
        <span class="source-status-name">${item.source_name}</span>
        <span class="source-status-detail">${item.error}</span>
      `;
      list.appendChild(div);
    });
    collapse.appendChild(list);
    elements.sourceStatus.appendChild(collapse);
  }

  if (zeroHitItems.length) {
    const collapse = document.createElement("details");
    collapse.className = "source-status-collapse subtle";
    collapse.innerHTML = `<summary>查看 ${zeroHitItems.length} 个零命中来源</summary>`;
    const list = document.createElement("div");
    list.className = "source-status-chip-list";
    zeroHitItems.forEach((item) => {
      const chip = document.createElement("span");
      chip.className = "source-zero-chip";
      chip.textContent = item.source_name;
      list.appendChild(chip);
    });
    collapse.appendChild(list);
    elements.sourceStatus.appendChild(collapse);
  }
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
    elements.resultsFocusBadge.textContent = state.results.length ? "筛选后为空" : "等待结果";
    elements.resultsHelper.textContent = state.results.length
      ? "当前筛选条件把结果过滤掉了，放宽来源、能力或书架条件后就会重新出现可选书单。"
      : state.sources.length
        ? "搜索后，结果书单会直接出现在这里；如果某个来源失败，顶部搜索状态会给出原因。"
        : userIsAdmin()
          ? "先导入至少一个可用书源，再回来搜索，结果区会直接变成可点选书单。"
          : "当前还没有可用书源，请联系管理员配置后再来搜索。";
    elements.results.className = "results empty";
    elements.results.textContent = state.results.length
      ? "当前筛选条件下没有结果，换个过滤条件试试。"
      : state.sources.length
        ? "还没有搜索结果，输入关键词开始搜索；如果某个来源失败，搜索状态里会显示具体原因。"
        : userIsAdmin()
          ? "还没有结果，先到“书源管理”导入书源，再回来搜索。"
          : "还没有可搜索结果，请联系管理员先配置书源。";
    renderHomeSpotlight();
    renderHomeRails();
    renderResultDetail(null);
    return;
  }

  elements.results.className = "results";
  elements.results.innerHTML = "";
  elements.resultsFocusBadge.textContent = selected ? `当前选中 · ${selected.title || "未命名书籍"}` : "结果书单";
  elements.resultsHelper.textContent = `已找到 ${state.results.length} 本书。左侧书单可直接切换，右侧详情会跟随当前选中书籍同步更新。`;

  visibleResults.forEach((item, index) => {
    const fragment = elements.resultItemTemplate.content.cloneNode(true);
    const rank = fragment.querySelector(".result-rank");
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

    rank.textContent = String(index + 1).padStart(2, "0");
    source.textContent = item.source_name;
    title.textContent = item.title || "未命名书籍";
    author.textContent = item.author ? `作者: ${item.author}` : "作者信息缺失";
    intro.textContent = item.intro || "暂无简介";
    meta.textContent = item.latest_chapter ? `最新章节: ${item.latest_chapter}` : "未提供最新章节信息";
    badge.textContent = readable ? "可阅读" : "仅搜索";
    badge.className = `result-badge ${readable ? "readable" : "external"}`;
    fragment.querySelector(".result-card").classList.toggle("active", item.book_key === state.ui.selectedResultKey);

    coverWrap.textContent = "";
    applyBookCoverImage(cover, item, "compact");

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

    collectBtn.classList.remove("hidden");
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
  setReaderMenuOpen(false);
  setReaderDrawerOpen(false);
  setReaderToolbarHidden(false);
  setReaderFocusMode(false);
  elements.readerPageTitle.textContent = book.title || "未命名书籍";
  elements.readerPageMeta.textContent = "当前章 · 选择章节后开始阅读";
  elements.readerDrawerTitle.textContent = book.title || "章节目录";
  elements.readerSourceName.textContent = sourceName;
  elements.readerBookTitle.textContent = book.title || "未命名书籍";
  elements.readerBookAuthor.textContent = book.author ? `作者: ${book.author}` : "作者信息缺失";
  const metaParts = [];
  if (book.status) metaParts.push(`状态: ${book.status}`);
  if (book.latest_chapter) metaParts.push(`最新: ${book.latest_chapter}`);
  elements.readerBookMeta.textContent = metaParts.join(" · ") || "暂无补充信息";
  elements.readerBookIntro.textContent = book.intro || "暂无简介";

  applyBookCoverImage(elements.readerBookCover, book);

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
  setReaderChapterListExpanded(state.ui.readerChapterListExpanded);
}

function updateReaderNav() {
  const { activeChapterIndex, chapters } = state.reader;
  const prevDisabled = activeChapterIndex <= 0;
  const nextDisabled = activeChapterIndex < 0 || activeChapterIndex >= chapters.length - 1;
  if (elements.prevChapterBtn) {
    elements.prevChapterBtn.disabled = prevDisabled;
  }
  if (elements.nextChapterBtn) {
    elements.nextChapterBtn.disabled = nextDisabled;
  }
  elements.readerBottomPrevBtn.disabled = prevDisabled;
  elements.readerBottomNextBtn.disabled = nextDisabled;
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
  const totalPages = Math.max(1, Math.ceil(state.sources.length / state.ui.sourcePageSize));
  state.ui.sourcePage = Math.min(state.ui.sourcePage, totalPages);
  renderSources();
  renderResults();
  if (userIsAdmin()) {
    await refreshSummary();
  }
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
  renderProfile();
}

async function refreshPreferences() {
  state.preferences = await apiFetch("/api/reader/preferences", { method: "GET", headers: {} });
  setReaderPreferenceVars();
}

async function refreshSummary() {
  state.summary = await apiFetch("/api/dashboard/summary", { method: "GET", headers: {} });
  renderSummary();
  renderProfile();
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

function loadPrivateSiteSample() {
  applyPrivateSitePreset("bqg_api_standard");
}

function fillPrivateSiteForm(site) {
  elements.privateSiteName.value = site.name || "";
  elements.privateSiteDescription.value = site.description || "";
  elements.privateSiteBaseUrl.value = site.base_url || "";
  elements.privateSiteHeaders.value = JSON.stringify(site.headers || {}, null, 2);
  elements.privateSiteSearchUrl.value = site.search_url || "";
  elements.privateSiteSearchList.value = site.search_list || "";
  elements.privateSiteSearchTitle.value = site.search_title || "";
  elements.privateSiteSearchAuthor.value = site.search_author || "";
  elements.privateSiteSearchCover.value = site.search_cover || "";
  elements.privateSiteSearchIntro.value = site.search_intro || "";
  elements.privateSiteSearchDetailUrl.value = site.search_detail_url || "";
  elements.privateSiteSearchLatest.value = site.search_latest_chapter || "";
  elements.privateSiteDetailTitle.value = site.detail_title || "";
  elements.privateSiteDetailAuthor.value = site.detail_author || "";
  elements.privateSiteDetailCover.value = site.detail_cover || "";
  elements.privateSiteDetailIntro.value = site.detail_intro || "";
  elements.privateSiteDetailStatus.value = site.detail_status || "";
  elements.privateSiteTocList.value = site.toc_list || "";
  elements.privateSiteTocTitle.value = site.toc_title || "";
  elements.privateSiteTocUrl.value = site.toc_url || "";
  elements.privateSiteTocNext.value = site.toc_next_url || "";
  elements.privateSiteContentBody.value = site.content_body || "";
  elements.privateSiteContentNext.value = site.content_next_url || "";
}

function applyPrivateSitePreset(presetKey) {
  const preset = PRIVATE_SITE_PRESETS[presetKey];
  if (!preset) return;

  const values = preset.values;
  fillPrivateSiteForm({
    name: values.name || "",
    description: values.description || "",
    base_url: values.base_url || "",
    headers: values.headers || {},
    search_url: values.search_url || "",
    search_list: values.search_list || "",
    search_title: values.search_title || "",
    search_author: values.search_author || "",
    search_cover: values.search_cover || "",
    search_intro: values.search_intro || "",
    search_detail_url: values.search_detail_url || "",
    search_latest_chapter: values.search_latest_chapter || "",
    detail_title: values.detail_title || "",
    detail_author: values.detail_author || "",
    detail_cover: values.detail_cover || "",
    detail_intro: values.detail_intro || "",
    detail_status: values.detail_status || "",
    toc_list: values.toc_list || "",
    toc_title: values.toc_title || "",
    toc_url: values.toc_url || "",
    toc_next_url: values.toc_next_url || "",
    content_body: values.content_body || "",
    content_next_url: values.content_next_url || "",
  });
  elements.privateSiteTestKeyword.value = values.test_keyword || "";
  elements.privateSitePreview.className = "private-site-preview empty";
  elements.privateSitePreview.textContent =
    `${preset.label} 模板已填好。你可以先点“测试搜索”，确认命中后再导入。`;
}

function parsePrivateSiteHeaders() {
  const raw = elements.privateSiteHeaders.value.trim();
  if (!raw) return {};
  try {
    const payload = JSON.parse(raw);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("请求头必须是 JSON 对象");
    }
    return Object.fromEntries(
      Object.entries(payload).map(([key, value]) => [String(key), String(value)]),
    );
  } catch (error) {
    throw new Error(`请求头 JSON 解析失败: ${error.message}`);
  }
}

function buildPrivateSitePayload() {
  return {
    name: elements.privateSiteName.value.trim(),
    description: elements.privateSiteDescription.value.trim(),
    enabled: true,
    base_url: elements.privateSiteBaseUrl.value.trim(),
    headers: parsePrivateSiteHeaders(),
    search_url: elements.privateSiteSearchUrl.value.trim(),
    search_list: elements.privateSiteSearchList.value.trim(),
    search_title: elements.privateSiteSearchTitle.value.trim(),
    search_author: elements.privateSiteSearchAuthor.value.trim(),
    search_cover: elements.privateSiteSearchCover.value.trim(),
    search_intro: elements.privateSiteSearchIntro.value.trim(),
    search_detail_url: elements.privateSiteSearchDetailUrl.value.trim(),
    search_latest_chapter: elements.privateSiteSearchLatest.value.trim(),
    detail_title: elements.privateSiteDetailTitle.value.trim(),
    detail_author: elements.privateSiteDetailAuthor.value.trim(),
    detail_cover: elements.privateSiteDetailCover.value.trim(),
    detail_intro: elements.privateSiteDetailIntro.value.trim(),
    detail_status: elements.privateSiteDetailStatus.value.trim(),
    toc_list: elements.privateSiteTocList.value.trim(),
    toc_title: elements.privateSiteTocTitle.value.trim(),
    toc_url: elements.privateSiteTocUrl.value.trim(),
    toc_next_url: elements.privateSiteTocNext.value.trim(),
    content_body: elements.privateSiteContentBody.value.trim(),
    content_next_url: elements.privateSiteContentNext.value.trim(),
  };
}

function renderPrivateSitePreview(payload) {
  const items = payload?.items || [];
  if (!items.length) {
    elements.privateSitePreview.className = "private-site-preview empty";
    elements.privateSitePreview.textContent =
      "测试完成，但当前关键词没有命中书籍。你可以换个关键词，或者检查搜索列表和书名规则。";
    return;
  }

  const supportText = payload.supports_reading ? "支持目录与正文抓取" : "当前仅验证了搜索规则";
  const sourcePayload = payload.source_payload || {};
  const legacyRaw = sourcePayload?.legacy?.raw || {};
  const hasDetailConfig = Boolean(sourcePayload?.detail || legacyRaw?.ruleBookInfo);
  const hasTocNext =
    Boolean(sourcePayload?.chapters?.transforms?.next_toc_url) || Boolean(legacyRaw?.ruleToc?.nextTocUrl);
  const hasContentNext =
    Boolean(sourcePayload?.content?.transforms?.next_content_url) || Boolean(legacyRaw?.ruleContent?.nextContentUrl);
  const flowTags = [
    hasDetailConfig ? "详情元数据已配置" : "详情元数据未配置",
    hasTocNext ? "目录支持翻页" : "目录单页",
    hasContentNext ? "正文支持翻页" : "正文单页",
  ];
  const itemsHtml = items
    .map(
      (item) => `
        <article class="private-site-preview-item">
          <strong>${item.title || "未命名书籍"}</strong>
          <span>${item.author || "作者待补充"}</span>
          <span>${item.latest_chapter || "暂无最新章节"}</span>
        </article>
      `,
    )
    .join("");

  elements.privateSitePreview.className = "private-site-preview";
  elements.privateSitePreview.innerHTML = `
    <div class="private-site-preview-head">
      <span class="badge">命中 ${payload.count} 本</span>
      <span class="badge">${supportText}</span>
    </div>
    <div class="private-site-preview-tags">
      ${flowTags.map((tag) => `<span class="badge">${tag}</span>`).join("")}
    </div>
    <div class="private-site-preview-list">${itemsHtml}</div>
  `;
}

async function autodetectPrivateSite() {
  const url = elements.privateSiteAutodetectUrl.value.trim();
  if (!url) {
    setStatus("请先粘贴一个小说网址", "error");
    return;
  }

  elements.privateSiteAutodetectBtn.disabled = true;
  setStatus("正在自动识别站点规则", "loading");
  try {
    const payload = await apiFetch("/api/sources/private-site/autodetect", {
      method: "POST",
      body: JSON.stringify({ url }),
    });
    fillPrivateSiteForm(payload.site);
    const notes = payload.notes || [];
    elements.privateSitePreview.className = "private-site-preview";
    elements.privateSitePreview.innerHTML = `
      <div class="private-site-preview-head">
        <span class="badge">已按 ${payload.detected_preset || "常见模板"} 自动回填</span>
        <span class="badge">建议再点一次测试搜索</span>
      </div>
      <div class="private-site-preview-list">
        ${notes.map((note) => `<article class="private-site-preview-item"><span>${note}</span></article>`).join("")}
      </div>
    `;
    setStatus("自动识别完成，规则已回填到表单", "success");
  } catch (error) {
    elements.privateSitePreview.className = "private-site-preview empty";
    elements.privateSitePreview.textContent = error.message;
    setStatus(error.message, "error");
  } finally {
    elements.privateSiteAutodetectBtn.disabled = false;
  }
}

async function testPrivateSite() {
  const keyword = elements.privateSiteTestKeyword.value.trim();
  if (!keyword) {
    setStatus("请先填写测试关键词", "error");
    return;
  }

  elements.privateSiteTestBtn.disabled = true;
  setStatus("正在测试私有站点规则", "loading");
  try {
    const payload = await apiFetch("/api/sources/private-site/test", {
      method: "POST",
      body: JSON.stringify({
        site: buildPrivateSitePayload(),
        keyword,
        limit: 5,
      }),
    });
    renderPrivateSitePreview(payload);
    setStatus(
      payload.count
        ? `测试成功，命中 ${payload.count} 本书`
        : "测试完成，但当前关键词没有命中结果",
      payload.count ? "success" : "idle",
    );
  } catch (error) {
    elements.privateSitePreview.className = "private-site-preview empty";
    elements.privateSitePreview.textContent = error.message;
    setStatus(error.message, "error");
  } finally {
    elements.privateSiteTestBtn.disabled = false;
  }
}

async function generatePrivateSiteJson() {
  elements.privateSiteGenerateBtn.disabled = true;
  setStatus("正在生成私有站点书源 JSON", "loading");
  try {
    const payload = await apiFetch("/api/sources/private-site/preview", {
      method: "POST",
      body: JSON.stringify(buildPrivateSitePayload()),
    });
    elements.sourceJson.value = JSON.stringify([payload], null, 2);
    setStatus("已生成标准书源 JSON，你也可以再手动微调", "success");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    elements.privateSiteGenerateBtn.disabled = false;
  }
}

async function importPrivateSite() {
  elements.privateSiteImportBtn.disabled = true;
  setStatus("正在导入私有站点", "loading");
  try {
    await apiFetch("/api/sources/private-site", {
      method: "POST",
      body: JSON.stringify(buildPrivateSitePayload()),
    });
    await refreshSources();
    setActivePage("search");
    renderSourceStatus([]);
    setStatus("私有站点已导入，现在可以直接搜索", "success");
    elements.keywordInput.focus();
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    elements.privateSiteImportBtn.disabled = false;
  }
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
    setActivePage("search");
    renderSourceStatus([]);
    setStatus("书源导入成功，已经可以开始搜索", "success");
    elements.keywordInput.focus();
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    elements.importBtn.disabled = false;
  }
}

async function uploadBooksToShelf() {
  const files = state.ui.pendingUploadFiles;
  if (!files.length) {
    setStatus("请先选择 TXT、MD 或 EPUB 文件", "error");
    return;
  }

  const formData = new FormData();
  files.forEach((file) => {
    formData.append("files", file);
  });
  formData.append("category", elements.shelfUploadCategory.value.trim());
  formData.append("tags", elements.shelfUploadTags.value.trim());
  formData.append("import_channel", "current_device");

  elements.shelfUploadBtn.disabled = true;
  elements.shelfUploadFilesTrigger.classList.add("is-disabled");
  elements.shelfUploadDirectoryTrigger.classList.add("is-disabled");
  elements.shelfUploadClearBtn.disabled = true;
  setShelfUploadProgress(0, `准备上传 ${files.length} 个文件`);
  setStatus("正在导入本地书籍", "loading");

  try {
    const payload = await sendMultipartUpload("/api/library/uploads", formData, {
      onProgress: (percent) => {
        setShelfUploadProgress(percent, `当前设备上传中 ${percent}%`);
      },
    });
    setShelfUploadProgress(100, "上传完成，正在刷新书架");
    await Promise.all([refreshSources(), refreshShelf(), refreshSummary()]);
    setActivePage("shelf");
    const lead = payload.items[0];
    setStatus(
      payload.imported_count > 1
        ? `已导入 ${payload.imported_count} 本书到书架`
        : `已导入《${lead?.title || files[0].name}》到书架`,
      "success",
    );
    clearPendingUploadFiles();
  } catch (error) {
    setShelfUploadProgress(0, error.message);
    setStatus(error.message, "error");
  } finally {
    elements.shelfUploadBtn.disabled = false;
    elements.shelfUploadFilesTrigger.classList.remove("is-disabled");
    elements.shelfUploadDirectoryTrigger.classList.remove("is-disabled");
    elements.shelfUploadClearBtn.disabled = !state.ui.pendingUploadFiles.length;
    renderPendingUploadFiles();
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

async function refreshResultsForActiveView() {
  const keyword = elements.keywordInput.value.trim();
  if (!keyword || !state.results.length) {
    renderResults();
    renderSourceStatus([]);
    return;
  }

  const payload = await apiFetch("/api/search", {
    method: "POST",
    body: JSON.stringify({
      keyword,
      limit_per_source: 10,
    }),
  });
  renderResults(payload.items);
  renderSourceStatus(payload.sources);
}

function selectCurrentSourcePage() {
  if (!state.sources.length) return;
  const { pageItems } = getSourcePaginationMeta();
  const selected = new Set(getSelectedSourceIds());
  pageItems.forEach((source) => {
    if (!isProtectedSource(source)) {
      selected.add(source.id);
    }
  });
  state.ui.selectedSourceIds = Array.from(selected);
  renderSources();
}

function clearSelectedSources() {
  state.ui.selectedSourceIds = [];
  renderSources();
}

async function bulkDeleteSources(payload, statusText) {
  await apiFetch("/api/sources/bulk-delete", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  await refreshSources();
  await refreshResultsForActiveView();
  clearSelectedSources();
  setStatus(statusText, "success");
}

async function deleteSelectedSources() {
  const selectedIds = getSelectedSourceIds();
  const selectedSources = state.sources.filter((source) => selectedIds.includes(source.id));
  const deletableSources = selectedSources.filter((source) => !isProtectedSource(source));

  if (!deletableSources.length) {
    setStatus("请先选择至少一个可删除的书源", "error");
    return;
  }

  const confirmed = window.confirm(
    `确认删除所选 ${deletableSources.length} 个书源吗？此操作不可恢复。`,
  );
  if (!confirmed) return;

  setStatus("正在删除所选书源", "loading");
  try {
    await bulkDeleteSources(
      { source_ids: deletableSources.map((source) => source.id), delete_all: false },
      `已删除 ${deletableSources.length} 个书源`,
    );
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function deleteAllSources() {
  const deletableCount = state.sources.filter((source) => !isProtectedSource(source)).length;
  if (!deletableCount) {
    setStatus("当前没有可删除的书源", "error");
    return;
  }

  const confirmText =
    deletableCount === state.sources.length
      ? `确认删除全部 ${deletableCount} 个书源吗？此操作不可恢复。`
      : `确认删除全部 ${deletableCount} 个可删除书源吗？系统内置书源会自动保留。`;
  const confirmed = window.confirm(confirmText);
  if (!confirmed) return;

  setStatus("正在删除全部书源", "loading");
  try {
    await bulkDeleteSources({ source_ids: [], delete_all: true }, `已删除 ${deletableCount} 个书源`);
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
    elements.resultsSection?.scrollIntoView({ behavior: "smooth", block: "start" });
    const failedCount = payload.sources.filter((item) => !item.success).length;
    if (payload.total > 0) {
      setStatus(
        failedCount
          ? `搜索完成，共 ${payload.total} 本，另有 ${failedCount} 个来源失败`
          : `搜索完成，共 ${payload.total} 本`,
        failedCount ? "idle" : "success",
      );
    } else if (failedCount === payload.sources.length) {
      setStatus(`没有搜到结果，且 ${failedCount} 个来源都返回了错误`, "error");
    } else {
      setStatus("搜索完成，但暂时没有命中结果", "idle");
    }
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
    rememberReadingBook(payload.book, options.resumeChapter?.title || "");
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
  elements.readerPageMeta.textContent = `当前章 · ${chapter.title || "正在加载章节"}`;
  elements.readerStatus.textContent = "正在加载正文...";
  elements.readerContent.className = "reader-content empty";
  elements.readerContent.textContent = "正在请求正文内容。";
  setReaderMenuOpen(false);
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
    elements.readerPageMeta.textContent = `当前章 · ${payload.chapter_title || chapter.title || "当前章节"}`;
    elements.readerStatus.textContent = payload.cached
      ? `正在阅读 ${payload.chapter_title || chapter.title} · 来自本地缓存`
      : `正在阅读 ${payload.chapter_title || chapter.title} · 已写入缓存`;
    elements.readerContent.className = "reader-content";
    elements.readerContent.textContent = payload.content;
    setReaderToolbarHidden(false);
    setStatus(payload.cached ? "正文已从缓存加载" : "正文加载完成并已缓存", "success");
    rememberReadingBook(state.reader.book, payload.chapter_title || chapter.title || "");
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

function handleShelfUploadDragState(active) {
  elements.shelfUploadDropzone.classList.toggle("drag-active", Boolean(active));
}

async function handleDroppedUploadFiles(event) {
  event.preventDefault();
  handleShelfUploadDragState(false);
  const files = await extractDroppedUploadFiles(event.dataTransfer);
  mergePendingUploadFiles(files);
}

loadRecentSearches();
loadReadingHistory();
renderPendingUploadFiles();
elements.importBtn.addEventListener("click", importSources);
elements.privateSiteAutodetectBtn.addEventListener("click", autodetectPrivateSite);
elements.privateSiteSampleBtn.addEventListener("click", loadPrivateSiteSample);
elements.privateSitePresetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    applyPrivateSitePreset(button.dataset.privateSitePreset);
  });
});
elements.privateSiteTestBtn.addEventListener("click", testPrivateSite);
elements.privateSiteImportBtn.addEventListener("click", importPrivateSite);
elements.privateSiteGenerateBtn.addEventListener("click", generatePrivateSiteJson);
elements.shelfUploadBtn.addEventListener("click", uploadBooksToShelf);
elements.shelfUploadClearBtn.addEventListener("click", () => {
  clearPendingUploadFiles();
  setStatus("已清空待上传文件", "idle");
});
elements.copyUploadLinkBtn?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(`${window.location.origin}/api/library/uploads`);
    setStatus("局域网上传页链接已复制", "success");
  } catch {
    setStatus("复制失败，请手动复制链接", "error");
  }
});
elements.loadSampleBtn.addEventListener("click", loadSampleJson);
elements.backupExportBtn.addEventListener("click", exportBackup);
elements.backupImportBtn.addEventListener("click", importBackup);
elements.searchForm.addEventListener("submit", searchBooks);
elements.prevChapterBtn?.addEventListener("click", () => {
  if (state.reader.activeChapterIndex > 0) {
    readChapter(state.reader.activeChapterIndex - 1);
  }
});
elements.nextChapterBtn?.addEventListener("click", () => {
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
elements.readerMenuBtn.addEventListener("click", () => {
  if (!state.reader.book) {
    setStatus("请先打开一本书再使用更多功能", "error");
    return;
  }
  setReaderMenuOpen(!state.ui.readerMenuOpen);
});
elements.readerDrawerCloseBtn.addEventListener("click", () => {
  setReaderDrawerOpen(false);
});
elements.readerDrawerOverlay.addEventListener("click", () => {
  setReaderDrawerOpen(false);
});
elements.readerSidebarBtn.addEventListener("click", () => {
  setReaderMenuOpen(false);
  setReaderSidebarCollapsed(!state.ui.readerSidebarCollapsed);
});
elements.chapterListToggleBtn.addEventListener("click", () => {
  setReaderChapterListExpanded(!state.ui.readerChapterListExpanded);
});
elements.readerFocusBtn.addEventListener("click", () => {
  if (!state.reader.book) {
    setStatus("请先打开一本书再进入沉浸模式", "error");
    return;
  }
  setReaderMenuOpen(false);
  setReaderFocusMode(!state.ui.readerFocusMode);
});
elements.readerBackBtn.addEventListener("click", () => {
  setActivePage(state.ui.lastBrowsePage || "search");
  scrollReaderToTop();
});
elements.readerShelfBtn.addEventListener("click", () => {
  setReaderMenuOpen(false);
  setActivePage("shelf");
  scrollReaderToTop();
});
elements.toggleShelfBtn.addEventListener("click", () => {
  const book = currentReaderBook();
  if (book) {
    setReaderMenuOpen(false);
    toggleShelfBook(book, state.reader.sourceId);
  }
});
elements.cacheBookBtn.addEventListener("click", () => {
  setReaderMenuOpen(false);
  cacheCurrentBook();
});
elements.clearCacheBtn.addEventListener("click", () => {
  setReaderMenuOpen(false);
  clearCurrentBookCache();
});
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
elements.shelfUploadFile.addEventListener("change", async (event) => {
  await Promise.resolve();
  mergePendingUploadFiles(Array.from(event.target.files || []));
  event.target.value = "";
});
elements.shelfUploadDirectory.addEventListener("change", async (event) => {
  await Promise.resolve();
  mergePendingUploadFiles(Array.from(event.target.files || []));
  event.target.value = "";
});
elements.shelfUploadDropzone.addEventListener("click", (event) => {
  if (event.target.closest("button")) return;
  openBrowserFilePicker();
});
elements.shelfUploadDropzone.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  openBrowserFilePicker();
});
["dragenter", "dragover"].forEach((eventName) => {
  elements.shelfUploadDropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    handleShelfUploadDragState(true);
  });
});
elements.shelfUploadDropzone.addEventListener("dragleave", (event) => {
  if (!elements.shelfUploadDropzone.contains(event.relatedTarget)) {
    handleShelfUploadDragState(false);
  }
});
elements.shelfUploadDropzone.addEventListener("dragend", () => {
  handleShelfUploadDragState(false);
});
elements.shelfUploadDropzone.addEventListener("drop", (event) => {
  handleDroppedUploadFiles(event).catch((error) => {
    handleShelfUploadDragState(false);
    setStatus(error.message || "拖动文件读取失败", "error");
  });
});
window.addEventListener("dragover", (event) => {
  if (!event.dataTransfer?.types?.includes("Files")) return;
  event.preventDefault();
});
window.addEventListener("drop", (event) => {
  if (!event.dataTransfer?.types?.includes("Files")) return;
  if (elements.shelfUploadDropzone.contains(event.target)) return;
  event.preventDefault();
  handleShelfUploadDragState(false);
  setStatus("请把文件拖到书架页的上传区域里", "idle");
});
elements.sourcePageSize.addEventListener("change", () => {
  state.ui.sourcePageSize = Number(elements.sourcePageSize.value) || 12;
  state.ui.sourcePage = 1;
  renderSources();
});
elements.sourceSelectPageBtn.addEventListener("click", () => {
  selectCurrentSourcePage();
});
elements.sourceClearSelectionBtn.addEventListener("click", () => {
  clearSelectedSources();
});
elements.sourceDeleteSelectedBtn.addEventListener("click", () => {
  deleteSelectedSources();
});
elements.sourceDeleteAllBtn.addEventListener("click", () => {
  deleteAllSources();
});
elements.sourcePrevPage.addEventListener("click", () => {
  if (state.ui.sourcePage <= 1) return;
  state.ui.sourcePage -= 1;
  renderSources();
});
elements.sourceNextPage.addEventListener("click", () => {
  const totalPages = Math.max(1, Math.ceil(state.sources.length / state.ui.sourcePageSize));
  if (state.ui.sourcePage >= totalPages) return;
  state.ui.sourcePage += 1;
  renderSources();
});
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
elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = elements.loginUsername.value.trim();
  const password = elements.loginPassword.value;
  if (!username || !password) {
    elements.loginStatus.textContent = "请输入用户名和密码";
    return;
  }
  elements.loginStatus.textContent = "正在登录...";
  try {
    await loginWithPassword(username, password);
    elements.loginPassword.value = "";
    elements.loginStatus.textContent = `已登录为 ${username}`;
  } catch (error) {
    elements.loginStatus.textContent = error.message || "登录失败";
  }
});
elements.logoutBtn.addEventListener("click", async () => {
  await logoutCurrentUser();
  elements.loginStatus.textContent = "你已退出登录";
});
elements.adminCreateUserBtn?.addEventListener("click", async () => {
  try {
    await apiFetch("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({
        username: elements.adminNewUsername.value.trim(),
        password: elements.adminNewPassword.value,
        role: elements.adminNewRole.value,
      }),
    });
    elements.adminNewUsername.value = "";
    elements.adminNewPassword.value = "";
    elements.adminNewRole.value = "user";
    await refreshAdminUsers();
    setStatus("用户已创建", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
});
elements.menuButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setActivePage(button.dataset.page);
  });
});
elements.readerScrollTopBtn?.addEventListener("click", () => {
  scrollReaderToTop();
});
elements.keywordChips.forEach((button) => {
  button.addEventListener("click", () => {
    runQuickSearch(button.dataset.keyword || "");
  });
});
elements.profileGoSearchBtn?.addEventListener("click", () => {
  setActivePage("search");
  elements.keywordInput.focus();
});
elements.profileGoShelfBtn?.addEventListener("click", () => {
  setActivePage("shelf");
});
elements.profileGoReaderBtn?.addEventListener("click", () => {
  if (state.reader.book) {
    setActivePage("reader");
    return;
  }
  if (state.ui.readingHistory.length) {
    openBook(state.ui.readingHistory[0].book, { autoRead: true });
  }
});
elements.bookDetailBackBtn?.addEventListener("click", () => {
  setActivePage("search");
});
getScrollContainer().addEventListener(
  "scroll",
  () => {
    const target = getScrollContainer();
    const currentY = target === window ? window.scrollY : target.scrollTop;
    updateReaderScrollTopButton();
    if (state.ui.activePage !== "reader" || !state.reader.book || state.ui.readerDrawerOpen) {
      setReaderToolbarHidden(false);
      previousWindowScrollY = currentY;
      return;
    }
    setReaderToolbarHidden(currentY > 88);
    if (state.ui.readerMenuOpen && currentY > 24) {
      setReaderMenuOpen(false);
    }
    previousWindowScrollY = currentY;
  },
  { passive: true },
);

document.addEventListener("click", (event) => {
  if (!state.ui.readerMenuOpen) return;
  if (
    elements.readerMenuPanel.contains(event.target) ||
    elements.readerMenuBtn.contains(event.target)
  ) {
    return;
  }
  setReaderMenuOpen(false);
});

(async () => {
  try {
    await refreshAppMeta();
    await refreshCurrentUser();
    if (currentUser()) {
      await initializeAuthenticatedApp();
    } else {
      resetReader("请先登录后继续使用 Reader Hub。");
      setStatus("请先登录", "idle");
    }
    renderAppMeta();
  } catch (error) {
    setStatus(error.message, "error");
    resetReader("初始化失败，请检查接口是否正常。");
  }
})();
