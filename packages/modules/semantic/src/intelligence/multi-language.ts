// ── Multi-Language Support ───────────────────────────────────────
// Pure functions for language detection, prompt localization, and
// query normalization. No DB access, no LLM calls. These utilities
// enable the semantic pipeline to handle non-English input by:
//   1. Detecting the user's language via Unicode analysis + keyword matching
//   2. Wrapping system prompts to instruct the LLM to respond in that language
//   3. Normalizing common business terms to English for the intent resolver
//
// Supported languages: English, Spanish, French, Portuguese, German,
// Italian, Chinese (Simplified), Japanese, Korean, Arabic.

// ── Types ──────────────────────────────────────────────────────────

/** The result of detecting a user's language from their input text. */
export interface LanguageDetection {
  /** ISO-like language identifier (e.g., 'en', 'es', 'zh'). */
  language: string;
  /** Confidence score (0-1) in the detection. */
  confidence: number;
  /** Convenience flag: true if detected language is English. */
  isEnglish: boolean;
}

/** The result of normalizing a non-English query to English. */
export interface NormalizedQuery {
  /** The query text with common business terms translated to English. */
  normalizedText: string;
  /** The detected source language. */
  originalLanguage: string;
}

// ── Supported Languages ────────────────────────────────────────────

/** Supported language codes and their display names. */
export const SUPPORTED_LANGUAGES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  pt: 'Portuguese',
  de: 'German',
  it: 'Italian',
  zh: 'Chinese (Simplified)',
  ja: 'Japanese',
  ko: 'Korean',
  ar: 'Arabic',
};

// ── Unicode Script Detection ───────────────────────────────────────

/**
 * Detects language from Unicode script ranges.
 * Returns null if the script is Latin (ambiguous between many languages).
 */
function detectFromUnicode(text: string): string | null {
  // CJK Unified Ideographs (Chinese)
  const cjkCount = (text.match(/[\u4E00-\u9FFF]/g) ?? []).length;
  // Hiragana + Katakana (Japanese)
  const jpCount = (text.match(/[\u3040-\u309F\u30A0-\u30FF]/g) ?? []).length;
  // Hangul (Korean)
  const koCount = (text.match(/[\uAC00-\uD7AF\u1100-\u11FF]/g) ?? []).length;
  // Arabic script
  const arCount = (text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g) ?? []).length;

  const totalChars = text.replace(/\s/g, '').length;
  if (totalChars === 0) return null;

  // Japanese has both CJK and kana — if kana present, it's Japanese
  if (jpCount > 0 && (jpCount + cjkCount) / totalChars > 0.2) return 'ja';

  // Pure CJK without kana = Chinese
  if (cjkCount / totalChars > 0.2) return 'zh';

  // Korean
  if (koCount / totalChars > 0.2) return 'ko';

  // Arabic
  if (arCount / totalChars > 0.2) return 'ar';

  return null;
}

// ── Language-Specific Keyword Patterns ──────────────────────────────

interface LanguagePattern {
  code: string;
  /** Common words unique or strongly associated with this language. */
  keywords: string[];
  /** Regex patterns for language-specific character combinations. */
  patterns?: RegExp[];
}

const LANGUAGE_PATTERNS: LanguagePattern[] = [
  {
    code: 'es',
    keywords: [
      'cuánto', 'cuanto', 'cuántas', 'cuantas', 'ventas', 'mostrar', 'por favor',
      'ingresos', 'clientes', 'pedidos', 'productos', 'ganancias',
      'hoy', 'ayer', 'semana', 'mes', 'año', 'cuáles', 'cuales',
      'cómo', 'como', 'dónde', 'donde', 'quién', 'quien',
      'promedio', 'total', 'comparar', 'tendencia',
    ],
    patterns: [/¿/, /¡/],
  },
  {
    code: 'fr',
    keywords: [
      'combien', 'ventes', 'montrer', "s'il", 'vous', 'plaît', 'recettes',
      'clients', 'commandes', 'produits', 'bénéfices',
      "aujourd'hui", 'hier', 'semaine', 'mois', 'année',
      'quels', 'quel', 'quelle', 'quelles', 'comment',
      'moyenne', 'tendance', 'comparer',
    ],
    patterns: [/\bqu['']/, /\bje\b/, /\bce\b/, /\bles\b/, /\bdes\b/, /\bune?\b/],
  },
  {
    code: 'pt',
    keywords: [
      'quanto', 'quantas', 'quantos', 'vendas', 'mostrar', 'receitas',
      'clientes', 'pedidos', 'produtos', 'lucros', 'ganhos',
      'hoje', 'ontem', 'semana', 'mês', 'ano',
      'quais', 'como', 'onde', 'quem',
      'média', 'comparar', 'tendência',
    ],
    patterns: [/\bção\b/, /ão\b/],
  },
  {
    code: 'de',
    keywords: [
      'wie viel', 'wieviel', 'verkäufe', 'umsatz', 'zeigen', 'bitte',
      'einnahmen', 'kunden', 'bestellungen', 'produkte', 'gewinn',
      'heute', 'gestern', 'woche', 'monat', 'jahr',
      'welche', 'warum', 'durchschnitt',
      'vergleichen', 'trend',
    ],
    patterns: [/ä|ö|ü|ß/],
  },
  {
    code: 'it',
    keywords: [
      'quanto', 'quante', 'quanti', 'vendite', 'mostrare', 'ricavi',
      'clienti', 'ordini', 'prodotti', 'profitti', 'guadagni',
      'oggi', 'ieri', 'settimana', 'mese', 'anno',
      'quali', 'come', 'dove', 'chi',
      'media', 'confrontare', 'tendenza',
    ],
    patterns: [/\bgli\b/, /\bdelle?\b/],
  },
];

// ── Business Term Translation Maps ─────────────────────────────────

/**
 * Maps common ERP business terms in each language to their English
 * equivalents. Used by normalizeQueryForEnglish() to help the intent
 * resolver match metrics even when the user writes in another language.
 */
const BUSINESS_TERMS: Record<string, Record<string, string>> = {
  es: {
    ventas: 'sales',
    ingresos: 'revenue',
    clientes: 'customers',
    pedidos: 'orders',
    productos: 'products',
    artículos: 'items',
    articulos: 'items',
    ganancias: 'profits',
    descuentos: 'discounts',
    impuestos: 'taxes',
    inventario: 'inventory',
    existencias: 'stock',
    proveedores: 'vendors',
    facturas: 'invoices',
    pagos: 'payments',
    promedio: 'average',
    total: 'total',
    hoy: 'today',
    ayer: 'yesterday',
    semana: 'week',
    mes: 'month',
  },
  fr: {
    ventes: 'sales',
    recettes: 'revenue',
    clients: 'customers',
    commandes: 'orders',
    produits: 'products',
    articles: 'items',
    bénéfices: 'profits',
    remises: 'discounts',
    taxes: 'taxes',
    inventaire: 'inventory',
    stock: 'stock',
    fournisseurs: 'vendors',
    factures: 'invoices',
    paiements: 'payments',
    moyenne: 'average',
    total: 'total',
    "aujourd'hui": 'today',
    hier: 'yesterday',
    semaine: 'week',
    mois: 'month',
  },
  pt: {
    vendas: 'sales',
    receitas: 'revenue',
    clientes: 'customers',
    pedidos: 'orders',
    produtos: 'products',
    itens: 'items',
    lucros: 'profits',
    descontos: 'discounts',
    impostos: 'taxes',
    inventário: 'inventory',
    estoque: 'stock',
    fornecedores: 'vendors',
    faturas: 'invoices',
    pagamentos: 'payments',
    média: 'average',
    total: 'total',
    hoje: 'today',
    ontem: 'yesterday',
    semana: 'week',
    mês: 'month',
  },
  de: {
    verkäufe: 'sales',
    umsatz: 'revenue',
    kunden: 'customers',
    bestellungen: 'orders',
    produkte: 'products',
    artikel: 'items',
    gewinn: 'profits',
    rabatte: 'discounts',
    steuern: 'taxes',
    inventar: 'inventory',
    bestand: 'stock',
    lieferanten: 'vendors',
    rechnungen: 'invoices',
    zahlungen: 'payments',
    durchschnitt: 'average',
    gesamt: 'total',
    heute: 'today',
    gestern: 'yesterday',
    woche: 'week',
    monat: 'month',
  },
  it: {
    vendite: 'sales',
    ricavi: 'revenue',
    clienti: 'customers',
    ordini: 'orders',
    prodotti: 'products',
    articoli: 'items',
    profitti: 'profits',
    sconti: 'discounts',
    tasse: 'taxes',
    inventario: 'inventory',
    scorte: 'stock',
    fornitori: 'vendors',
    fatture: 'invoices',
    pagamenti: 'payments',
    media: 'average',
    totale: 'total',
    oggi: 'today',
    ieri: 'yesterday',
    settimana: 'week',
    mese: 'month',
  },
  zh: {
    '\u9500\u552E': 'sales',       // 销售
    '\u6536\u5165': 'revenue',     // 收入
    '\u5BA2\u6237': 'customers',   // 客户
    '\u8BA2\u5355': 'orders',      // 订单
    '\u4EA7\u54C1': 'products',    // 产品
    '\u5546\u54C1': 'items',       // 商品
    '\u5229\u6DA6': 'profits',     // 利润
    '\u6298\u6263': 'discounts',   // 折扣
    '\u7A0E': 'taxes',             // 税
    '\u5E93\u5B58': 'inventory',   // 库存
    '\u4F9B\u5E94\u5546': 'vendors', // 供应商
    '\u53D1\u7968': 'invoices',    // 发票
    '\u4ED8\u6B3E': 'payments',    // 付款
    '\u5E73\u5747': 'average',     // 平均
    '\u603B\u8BA1': 'total',       // 总计
    '\u4ECA\u5929': 'today',       // 今天
    '\u6628\u5929': 'yesterday',   // 昨天
    '\u5468': 'week',              // 周
    '\u6708': 'month',             // 月
  },
  ja: {
    '\u58F2\u4E0A': 'sales',       // 売上
    '\u53CE\u76CA': 'revenue',     // 収益
    '\u9867\u5BA2': 'customers',   // 顧客
    '\u6CE8\u6587': 'orders',      // 注文
    '\u88FD\u54C1': 'products',    // 製品
    '\u5546\u54C1': 'items',       // 商品
    '\u5229\u76CA': 'profits',     // 利益
    '\u5272\u5F15': 'discounts',   // 割引
    '\u7A0E\u91D1': 'taxes',       // 税金
    '\u5728\u5EAB': 'inventory',   // 在庫
    '\u4ED5\u5165\u5148': 'vendors', // 仕入先
    '\u8ACB\u6C42\u66F8': 'invoices', // 請求書
    '\u652F\u6255': 'payments',    // 支払
    '\u5E73\u5747': 'average',     // 平均
    '\u5408\u8A08': 'total',       // 合計
    '\u4ECA\u65E5': 'today',       // 今日
    '\u6628\u65E5': 'yesterday',   // 昨日
    '\u9031': 'week',              // 週
    '\u6708': 'month',             // 月
  },
  ko: {
    '\uD310\uB9E4': 'sales',       // 판매
    '\uC218\uC775': 'revenue',     // 수익
    '\uACE0\uAC1D': 'customers',   // 고객
    '\uC8FC\uBB38': 'orders',      // 주문
    '\uC81C\uD488': 'products',    // 제품
    '\uC0C1\uD488': 'items',       // 상품
    '\uC774\uC775': 'profits',     // 이익
    '\uD560\uC778': 'discounts',   // 할인
    '\uC138\uAE08': 'taxes',       // 세금
    '\uC7AC\uACE0': 'inventory',   // 재고
    '\uACF5\uAE09\uC5C5\uCCB4': 'vendors', // 공급업체
    '\uCCAD\uAD6C\uC11C': 'invoices', // 청구서
    '\uACB0\uC81C': 'payments',    // 결제
    '\uD3C9\uADE0': 'average',     // 평균
    '\uCD1D\uACC4': 'total',       // 총계
    '\uC624\uB298': 'today',       // 오늘
    '\uC5B4\uC81C': 'yesterday',   // 어제
    '\uC8FC': 'week',              // 주
    '\uC6D4': 'month',             // 월
  },
  ar: {
    '\u0645\u0628\u064A\u0639\u0627\u062A': 'sales',      // مبيعات
    '\u0625\u064A\u0631\u0627\u062F\u0627\u062A': 'revenue', // إيرادات
    '\u0639\u0645\u0644\u0627\u0621': 'customers',          // عملاء
    '\u0637\u0644\u0628\u0627\u062A': 'orders',             // طلبات
    '\u0645\u0646\u062A\u062C\u0627\u062A': 'products',     // منتجات
    '\u0623\u0635\u0646\u0627\u0641': 'items',              // أصناف
    '\u0623\u0631\u0628\u0627\u062D': 'profits',            // أرباح
    '\u062E\u0635\u0648\u0645\u0627\u062A': 'discounts',    // خصومات
    '\u0636\u0631\u0627\u0626\u0628': 'taxes',              // ضرائب
    '\u0645\u062E\u0632\u0648\u0646': 'inventory',          // مخزون
    '\u0645\u0648\u0631\u062F\u064A\u0646': 'vendors',      // موردين
    '\u0641\u0648\u0627\u062A\u064A\u0631': 'invoices',     // فواتير
    '\u0645\u062F\u0641\u0648\u0639\u0627\u062A': 'payments', // مدفوعات
    '\u0645\u062A\u0648\u0633\u0637': 'average',            // متوسط
    '\u0625\u062C\u0645\u0627\u0644\u064A': 'total',        // إجمالي
    '\u0627\u0644\u064A\u0648\u0645': 'today',              // اليوم
    '\u0623\u0645\u0633': 'yesterday',                       // أمس
    '\u0623\u0633\u0628\u0648\u0639': 'week',               // أسبوع
    '\u0634\u0647\u0631': 'month',                           // شهر
  },
};

// ── Language Detection ─────────────────────────────────────────────

/**
 * Detects the language of the input text using a combination of
 * Unicode script analysis and common word/pattern detection.
 *
 * Detection strategy:
 * 1. Check Unicode ranges for CJK, Japanese, Korean, and Arabic scripts
 * 2. For Latin-script text, check for language-specific keywords and patterns
 * 3. Default to English if no strong signal is found
 *
 * @param text - The input text to analyze
 * @returns LanguageDetection with language code, confidence, and isEnglish flag
 */
export function detectLanguage(text: string): LanguageDetection {
  if (!text || text.trim().length === 0) {
    return { language: 'en', confidence: 0.5, isEnglish: true };
  }

  const normalized = text.trim().toLowerCase();

  // Step 1: Check Unicode script ranges (high confidence for non-Latin scripts)
  const unicodeDetection = detectFromUnicode(normalized);
  if (unicodeDetection) {
    return {
      language: unicodeDetection,
      confidence: 0.95,
      isEnglish: false,
    };
  }

  // Step 2: For Latin scripts, score each language by keyword/pattern matches
  let bestLang = 'en';
  let bestScore = 0;
  const wordCount = normalized.split(/\s+/).length;

  for (const pattern of LANGUAGE_PATTERNS) {
    let score = 0;

    // Count keyword matches
    for (const keyword of pattern.keywords) {
      // Use word boundary-aware matching for multi-word keywords
      const regex = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'gi');
      const matches = normalized.match(regex);
      if (matches) {
        score += matches.length;
      }
    }

    // Check regex patterns
    if (pattern.patterns) {
      for (const p of pattern.patterns) {
        if (p.test(normalized)) {
          score += 0.5;
        }
      }
    }

    // Normalize score by word count for fair comparison
    const normalizedScore = wordCount > 0 ? score / Math.sqrt(wordCount) : 0;

    if (normalizedScore > bestScore) {
      bestScore = normalizedScore;
      bestLang = pattern.code;
    }
  }

  // Confidence mapping based on normalized score
  // A score above 1.0 is a strong signal; below 0.3 is weak
  if (bestScore < 0.3) {
    // No strong signal — default to English
    return { language: 'en', confidence: 0.7, isEnglish: true };
  }

  const confidence = Math.min(0.95, 0.5 + bestScore * 0.3);

  return {
    language: bestLang,
    confidence: Math.round(confidence * 100) / 100,
    isEnglish: bestLang === 'en',
  };
}

// ── Prompt Wrapping ────────────────────────────────────────────────

/**
 * Appends a language instruction to the system prompt, instructing the
 * LLM to respond in the user's detected language while keeping
 * technical terms (metric names, SQL keywords) in English.
 *
 * @param systemPrompt - The original system prompt
 * @param targetLanguage - The language code to respond in (e.g., 'es')
 * @returns The wrapped system prompt with the language instruction appended
 */
export function wrapPromptForLanguage(
  systemPrompt: string,
  targetLanguage: string,
): string {
  if (targetLanguage === 'en') {
    return systemPrompt;
  }

  const languageName = SUPPORTED_LANGUAGES[targetLanguage] ?? targetLanguage;

  return `${systemPrompt}

IMPORTANT: The user is writing in ${languageName}. Respond entirely in ${languageName}. Keep all technical terms (metric names, SQL column names, chart types) in English but explain everything else in ${languageName}.`;
}

// ── Query Normalization ────────────────────────────────────────────

/**
 * Normalizes a non-English query by replacing common business terms
 * with their English equivalents. This helps the intent resolver
 * match metrics even when the user writes in another language.
 *
 * The replacement is case-insensitive and preserves the rest of the
 * query structure. Non-business words are left as-is — the LLM intent
 * resolver handles grammar and context.
 *
 * @param text - The original query text
 * @param detectedLang - The detected language code (e.g., 'es', 'fr')
 * @returns NormalizedQuery with the English-normalized text and original language
 */
export function normalizeQueryForEnglish(
  text: string,
  detectedLang: string,
): NormalizedQuery {
  if (detectedLang === 'en' || !BUSINESS_TERMS[detectedLang]) {
    return { normalizedText: text, originalLanguage: detectedLang };
  }

  const terms = BUSINESS_TERMS[detectedLang]!;
  let normalized = text;

  // Sort terms by length (longest first) to prevent partial replacements
  const sortedEntries = Object.entries(terms).sort(
    ([a], [b]) => b.length - a.length,
  );

  for (const [foreign, english] of sortedEntries) {
    // For CJK/Arabic scripts, don't use word boundaries (no spaces between words)
    const isCjkOrArabic = ['zh', 'ja', 'ko', 'ar'].includes(detectedLang);

    const pattern = isCjkOrArabic
      ? new RegExp(escapeRegex(foreign), 'gi')
      : new RegExp(`\\b${escapeRegex(foreign)}\\b`, 'gi');

    normalized = normalized.replace(pattern, english);
  }

  return {
    normalizedText: normalized,
    originalLanguage: detectedLang,
  };
}

// ── Helpers ────────────────────────────────────────────────────────

/** Escapes special regex characters in a string. */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
