/**
 * AI safety pipeline primitives. Pure functions so they can be exhaustively unit tested.
 *
 * These are defence-in-depth heuristics layered around strict system prompts; they are not a substitute
 * for clinician review, which is mandatory for every clinical draft.
 */

// ───────── Emergency detection ─────────

const EMERGENCY_PATTERNS: RegExp[] = [
  // English
  /chest\s+pain/i,
  /(can'?t|cannot|unable to|difficulty|trouble)\s+breath/i,
  /not\s+breathing/i,
  /stopped\s+breathing/i,
  /unconscious|unresponsive|passed\s+out|fainted/i,
  /severe\s+bleeding|bleeding\s+(heavily|a lot|won'?t stop)/i,
  /suicid|kill\s+(myself|himself|herself)|end\s+my\s+life|self[-\s]?harm/i,
  /overdos/i,
  /seizure|convuls/i,
  /stroke|face\s+(is\s+)?drooping|slurred\s+speech/i,
  /poison(ed|ing)/i,
  /heart\s+attack/i,
  /snake\s*bite/i,
  /(baby|child|infant).{0,30}(not\s+moving|blue|limp)/i,
  /(pregnan|labou?r).{0,40}(bleeding|severe\s+pain|seizure)/i,
  // Amharic (common phrasings)
  /የደረት\s*ህመም/, // chest pain
  /መተንፈስ\s*(አልችልም|አቃተ|ከበደ)/, // can't breathe / breathing difficult
  /ራሱን\s*ስቷል|ራሷን\s*ስታለች|ራሴን\s*ሳትኩ/, // unconscious
  /ብዙ\s*ደም|ደም\s*እየፈሰሰ/, // heavy bleeding
  /ራሴን\s*(ማጥፋት|ልገድል)|ራስን\s*ማጥፋት/, // suicide
  /የሚጥል\s*በሽታ|መንቀጥቀጥ/, // seizure / convulsion
  /መርዝ/, // poison
];

export function detectEmergency(text: string): boolean {
  return EMERGENCY_PATTERNS.some((p) => p.test(text));
}

/**
 * Emergency guidance. Numbers are Ethiopian national short codes and MUST be re-verified by each pilot clinic
 * (see docs/ai-safety.md) — clinics can add their own emergency contact in the UI copy.
 */
export const EMERGENCY_GUIDANCE: Record<'en' | 'am', string> = {
  en:
    'This may be a medical emergency. Please seek emergency care immediately: go to the nearest hospital emergency ' +
    'department or call an ambulance (Ethiopia: 907). If someone is at risk of harming themselves, stay with them ' +
    'and get urgent help. AfyaLink AI cannot assess emergencies.',
  am:
    'ይህ የአስቸኳይ ጊዜ የጤና ችግር ሊሆን ይችላል። እባክዎ ወዲያውኑ በአቅራቢያዎ ወዳለ ሆስፒታል የድንገተኛ ክፍል ይሂዱ ወይም አምቡላንስ ይጥሩ ' +
    '(ኢትዮጵያ: 907)። አፍያሊንክ AI የአስቸኳይ ሁኔታዎችን መገምገም አይችልም።',
};

// ───────── PII redaction ─────────

export interface RedactionResult {
  text: string;
  count: number;
}

const PII_PATTERNS: [RegExp, string][] = [
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]'],
  [/(?:\+?251|0)[\s-]?[79]\d(?:[\s-]?\d){7}/g, '[PHONE]'],
  [/\+\d[\d\s-]{7,16}\d/g, '[PHONE]'],
  [/\bMRN-\d{3,}\b/gi, '[MRN]'],
  [/\b\d{4}-\d{2}-\d{2}\b/g, '[DATE]'],
  [/\b\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\b/g, '[DATE]'],
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Removes direct identifiers. `names` are known identifiers for this patient (first/last/middle name). */
export function redactPII(text: string, names: string[] = []): RedactionResult {
  let count = 0;
  let out = text;
  for (const [re, label] of PII_PATTERNS) {
    out = out.replace(re, () => {
      count++;
      return label;
    });
  }
  for (const name of names.filter((n) => n && n.trim().length >= 2)) {
    const re = new RegExp(`(?<![\\p{L}])${escapeRegExp(name.trim())}(?![\\p{L}])`, 'giu');
    out = out.replace(re, () => {
      count++;
      return '[PATIENT]';
    });
  }
  return { text: out, count };
}

// ───────── Output validation ─────────

const UNSAFE_OUTPUT_PATTERNS: [RegExp, string][] = [
  [/\b\d+(\.\d+)?\s?(mg|mcg|µg|ml|g|iu|units?)\b.{0,40}\b(daily|twice|times|every|per day|bd|tds|qid|od)\b/i, 'DOSAGE_INSTRUCTION'],
  [/\b(take|start|stop|increase|decrease)\s+(taking\s+)?(\d+|your|the|a)\b.{0,40}\b(tablet|pill|capsule|dose|medication|medicine)/i, 'MEDICATION_INSTRUCTION'],
  [/\byou\s+(have|are suffering from|probably have|likely have|might have|may have)\s+(a\s+|an\s+)?(\w+\s){0,3}(infection|disease|disorder|cancer|syndrome|diabetes|hypertension|malaria|tuberculosis|pneumonia)/i, 'DIAGNOSIS'],
  [/\b(your|the)\s+diagnosis\s+is\b/i, 'DIAGNOSIS'],
  [/\bI\s+(would\s+)?(prescribe|diagnose)\b/i, 'PRESCRIBE_OR_DIAGNOSE'],
];

export function findUnsafeOutput(text: string): string[] {
  return [...new Set(UNSAFE_OUTPUT_PATTERNS.filter(([re]) => re.test(text)).map(([, flag]) => flag))];
}

/**
 * Flags numeric values (vitals, lab values, doses) in a generated draft that do not appear in the clinician's
 * input — a guard against invented results. Returns the unsupported numbers.
 */
export function findUnsupportedNumbers(source: string, generated: string): string[] {
  // Ignore digits that are part of identifiers like "SpO2" or "B12".
  const NUM = /(?<![\p{L}\d.])\d+(\.\d+)?/gu;
  const norm = (s: string) => s.replace(/(\d),(\d)/g, '$1$2');
  const sourceNums = new Set((norm(source).match(NUM) ?? []).map(Number));
  const genNums = norm(generated).match(NUM) ?? [];
  return [...new Set(genNums.filter((n) => !sourceNums.has(Number(n))))];
}

export const AI_DRAFT_LABEL = 'AI-generated draft — not reviewed. A clinician must review, edit and sign before this becomes part of the record.';

export const HEALTH_INFO_DISCLAIMER: Record<'en' | 'am', string> = {
  en: 'This is general health information, not medical advice or a diagnosis. Please consult a qualified health professional about your situation.',
  am: 'ይህ አጠቃላይ የጤና መረጃ ነው፤ የህክምና ምክር ወይም ምርመራ አይደለም። ስለ ሁኔታዎ እባክዎ ብቁ የጤና ባለሙያ ያማክሩ።',
};

export const SAFE_FALLBACK: Record<'en' | 'am', string> = {
  en: "I can't provide that information safely. For questions about symptoms, diagnosis or medication, please speak with a doctor, nurse or pharmacist.",
  am: 'ይህንን መረጃ በደህንነት ማቅረብ አልችልም። ስለ ምልክቶች፣ ምርመራ ወይም መድሃኒት ጥያቄዎች እባክዎ ሐኪም፣ ነርስ ወይም ፋርማሲስት ያነጋግሩ።',
};

export const NO_SOURCES_MESSAGE: Record<'en' | 'am', string> = {
  en: "I don't have approved information on that topic yet. Please ask your clinic or a qualified health professional.",
  am: 'በዚህ ርዕስ ላይ የጸደቀ መረጃ እስካሁን የለኝም። እባክዎ ክሊኒክዎን ወይም ብቁ የጤና ባለሙያ ይጠይቁ።',
};
