// ============================================================================
// Prompt-injection guard for user-supplied documentation instructions.
//
// The text this scans is stored on Repo and later concatenated into the prompts
// we send to the LLM, so it is a direct injection surface. The scan is fully
// deterministic (no LLM call) and runs in layers, cheapest first:
//
//   1. normalize   - fold away the obfuscation tricks BEFORE any matching
//   2. shape       - length/token/URL limits
//   3. structural  - our own framing tokens and chat-role markers
//   4. intent      - override / exfiltration / tool-abuse phrasing
//   5. allowlist   - the surviving text must be plain prose
//
// Rejection is the default posture: a legitimate value reads like "Focus on the
// payments flow and call out retry semantics", which trips none of these.
// ============================================================================

export interface PromptScanResult {
    ok: boolean;
    sanitized: string;      // normalized text — this is what gets stored
    rejections: string[];   // non-empty => reject the request
    flags: string[];        // suspicious but allowed; recorded for audit
}

export const MAX_PROMPT_CHARS = 2_000;
export const MAX_PROMPT_LINES = 40;

// ---------------------------------------------------------------------------
// Layer 1: normalization
// ---------------------------------------------------------------------------

// NFKC folds fullwidth ("ｉｇｎｏｒｅ"), ligatures and superscripts down to plain
// ASCII, so obfuscated variants hit the same rules as the literal spelling.
const ZERO_WIDTH = /[\u200B-\u200F\u2060-\u2064\uFEFF]/gu;
const UNICODE_TAGS = /[\u{E0000}-\u{E007F}]/gu;      // invisible ASCII smuggling
const BIDI_OVERRIDES = /[\u202A-\u202E\u2066-\u2069]/gu;
const DISALLOWED_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;

const normalize = (raw: string): string => {
    return raw
        .normalize("NFKC")
        .replace(ZERO_WIDTH, "")
        .replace(UNICODE_TAGS, "")
        .replace(BIDI_OVERRIDES, "")
        .replace(/\r\n?/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
};

// Stripping these is enough to make the text safe, so we accept the cleaned
// version rather than rejecting — but their presence is never accidental, so it
// gets flagged for the audit trail.
const hasInvisibles = (raw: string): boolean => {
    return new RegExp(ZERO_WIDTH.source, "u").test(raw)
        || new RegExp(UNICODE_TAGS.source, "u").test(raw)
        || new RegExp(BIDI_OVERRIDES.source, "u").test(raw);
};

// ---------------------------------------------------------------------------
// Layer 2: shape limits
// ---------------------------------------------------------------------------

const LONG_TOKEN = /\S{201,}/u;
const BASE64_BLOB = /[A-Za-z0-9+/]{80,}={0,2}/u;

// A documentation preference never needs to point the model at a network
// resource, so blocking every URL closes both remote-instruction loading and
// the exfiltration channel in one rule.
const URL_LIKE = /(?:https?:\/\/|ftps?:\/\/|file:\/\/|data:|javascript:|\/\/[a-z0-9-]+\.[a-z]{2,})/iu;

// ---------------------------------------------------------------------------
// Layer 3: structural markers
// ---------------------------------------------------------------------------

// Our own prompt framing. If any of this appears in user text it can forge a
// section boundary or escape the untrusted-input wrapper.
const FRAMING_TOKENS = [
    "<<<BEGIN_USER_INSTRUCTIONS>>>",
    "<<<END_USER_INSTRUCTIONS>>>",
    "<<<begin",
    "<<<end",
    "<<module:",
    "=====",
    "# project context",
    "# module documentation",
    "# measured module edges",
    "# source files",
];

const ROLE_MARKERS = [
    "<|im_start|>",
    "<|im_end|>",
    "<|endoftext|>",
    "[inst]",
    "[/inst]",
    "<system>",
    "</system>",
    "<human>",
    "<assistant>",
    "human:",
    "assistant:",
];

const LINE_ROLE_MARKER = /^\s*(system|assistant|user)\s*:/imu;
const CODE_FENCE = /```|~~~/u;
const HTML_COMMENT = /<!--/u;

// ---------------------------------------------------------------------------
// Layer 4: intent heuristics
// ---------------------------------------------------------------------------

interface Rule {
    name: string;
    pattern: RegExp;
}

// One hit is enough to reject. These phrasings have no place in a request about
// documentation style.
const HARD_RULES: Rule[] = [
    // Instruction override
    { name: "override:ignore", pattern: /ignore\s+(?:all\s+|any\s+)?(?:the\s+)?(?:previous|prior|above|preceding|earlier|foregoing)/iu },
    { name: "override:disregard", pattern: /\bdisregard\b/iu },
    { name: "override:forget", pattern: /forget\s+(?:everything|all|the\s+above|your\s+)/iu },
    { name: "override:explicit", pattern: /\boverride\s+(?:the\s+)?(?:system|rules|instructions|prompt|schema)/iu },
    { name: "override:new-instructions", pattern: /\bnew\s+instructions\b/iu },
    { name: "override:from-now-on", pattern: /\bfrom\s+now\s+on\b/iu },
    { name: "override:you-are-now", pattern: /\byou\s+are\s+now\b/iu },
    { name: "override:act-as", pattern: /\b(?:act|behave)\s+as\s+(?:a|an|if|though)\b/iu },
    { name: "override:pretend", pattern: /\bpretend\s+(?:to\s+be|that|you)\b/iu },
    { name: "override:roleplay", pattern: /\brole[\s-]?play\s+as\b/iu },
    { name: "override:jailbreak", pattern: /\b(?:jailbreak|developer\s+mode|god\s+mode|DAN\s+mode)\b/iu },

    // System / schema attack
    { name: "system:prompt", pattern: /\bsystem\s+(?:prompt|message|instructions)\b/iu },
    { name: "system:reveal", pattern: /\b(?:reveal|print|repeat|output|show|echo|dump|recite)\b[^.\n]{0,40}\byour\s+(?:instructions|prompt|rules|system)/iu },
    { name: "system:verbatim", pattern: /\bverbatim\b/iu },
    { name: "system:stop-following", pattern: /\b(?:stop|cease|quit)\s+following\b/iu },
    { name: "system:do-not-follow", pattern: /\bdo\s+not\s+follow\s+(?:the\s+)?(?:above|previous|system|any)/iu },
    { name: "system:schema", pattern: /\bignore\s+(?:the\s+)?(?:schema|format|structure|json)/iu },
    { name: "system:only-output", pattern: /\b(?:output|respond|reply|answer|return)\s+only\b/iu },
    { name: "system:end-response", pattern: /\bend\s+(?:your\s+)?(?:response|output|turn)\b/iu },

    // Exfiltration
    { name: "exfil:key", pattern: /\bapi[\s_-]?keys?\b/iu },
    { name: "exfil:secret", pattern: /\b(?:secrets?|credentials?|passwords?|private\s+key)\b/iu },
    { name: "exfil:env", pattern: /(?:\.env\b|\benv(?:ironment)?\s+variables?\b)/iu },
    { name: "exfil:send", pattern: /\b(?:send|post|upload|transmit|exfiltrate)\b[^.\n]{0,30}\bto\s+(?:this|the\s+following|http)/iu },
    { name: "exfil:curl", pattern: /\b(?:curl|wget|fetch\s*\(|XMLHttpRequest|axios)\b/iu },

    // Repo / tool abuse
    { name: "abuse:workflows", pattern: /\.github\/workflows/iu },
    { name: "abuse:manifest", pattern: /\b(?:package\.json|postinstall|preinstall)\b/iu },
    { name: "abuse:code-exec", pattern: /\b(?:eval\s*\(|require\s*\(|child_process|exec(?:Sync)?\s*\(|import\s*\()/iu },
    { name: "abuse:write-file", pattern: /\b(?:create|write|add|modify|delete|edit)\s+(?:a\s+|the\s+|new\s+)?(?:files?|scripts?|workflows?)\b/iu },
];

// Individually defensible in a real instruction, collectively a strong signal.
// Two or more => reject; a single hit is stored with a flag.
const SOFT_RULES: Rule[] = [
    { name: "soft:never-mention", pattern: /\bnever\s+mention\b/iu },
    { name: "soft:do-not-include", pattern: /\bdo\s+not\s+(?:include|mention|write|document)\b/iu },
    { name: "soft:always-output", pattern: /\balways\s+(?:output|respond|say|write|begin|start)\b/iu },
    { name: "soft:instead-of", pattern: /\binstead\s+of\b/iu },
    { name: "soft:shouting", pattern: /[A-Z][A-Z\s]{19,}/u },
    { name: "soft:emphasis", pattern: /!{3,}/u },
];

const SOFT_REJECT_SCORE = 2;

// ---------------------------------------------------------------------------
// Layer 5: positive shape
// ---------------------------------------------------------------------------

// Whatever survives layers 1-4 must be plain prose. This inverts the burden:
// an attacker has to express the injection in ordinary English that also gets
// past the intent rules above.
const ALLOWED_CHARS = /^[A-Za-z0-9\s.,;:'"()\-/?!&%#+*=]*$/u;

// ---------------------------------------------------------------------------
// The scan
// ---------------------------------------------------------------------------

export const scanCustomPrompt = (raw: string): PromptScanResult => {

    const rejections: string[] = [];
    const flags: string[] = [];

    const sanitized = normalize(raw);

    const reject = (reason: string) => rejections.push(reason);

    // --- Layer 1 ------------------------------------------------------------
    if (hasInvisibles(raw)) {
        flags.push("normalize:invisible-characters-stripped");
    }

    if (DISALLOWED_CONTROL.test(sanitized)) {
        reject("contains control characters");
    }

    // --- Layer 2: shape ------------------------------------------------------
    if (sanitized.length === 0) {
        reject("is empty after normalization");
    }

    if (sanitized.length > MAX_PROMPT_CHARS) {
        reject(`exceeds ${MAX_PROMPT_CHARS} characters`);
    }

    if (sanitized.split("\n").length > MAX_PROMPT_LINES) {
        reject(`exceeds ${MAX_PROMPT_LINES} lines`);
    }

    if (LONG_TOKEN.test(sanitized)) {
        reject("contains an implausibly long unbroken token");
    }

    if (BASE64_BLOB.test(sanitized)) {
        reject("contains an encoded payload");
    }

    if (URL_LIKE.test(sanitized)) {
        reject("contains a URL — links are not allowed in custom instructions");
    }

    // --- Layer 3: structural -------------------------------------------------
    const lowered = sanitized.toLowerCase();

    for (const token of FRAMING_TOKENS) {
        if (lowered.includes(token.toLowerCase())) {
            reject(`contains a reserved prompt delimiter (${token})`);
        }
    }

    for (const marker of ROLE_MARKERS) {
        if (lowered.includes(marker)) {
            reject(`contains a conversation role marker (${marker})`);
        }
    }

    if (LINE_ROLE_MARKER.test(sanitized)) {
        reject("contains a conversation role marker");
    }

    if (CODE_FENCE.test(sanitized)) {
        reject("contains a code fence");
    }

    if (HTML_COMMENT.test(sanitized)) {
        reject("contains an HTML comment");
    }

    // --- Layer 4: intent -----------------------------------------------------
    for (const rule of HARD_RULES) {
        if (rule.pattern.test(sanitized)) {
            reject(`matched a prompt-injection pattern (${rule.name})`);
        }
    }

    const softHits: string[] = [];

    for (const rule of SOFT_RULES) {
        if (rule.pattern.test(sanitized)) {
            softHits.push(rule.name);
            flags.push(rule.name);
        }
    }

    if (softHits.length >= SOFT_REJECT_SCORE) {
        reject(`matched ${softHits.length} suspicious instruction patterns (${softHits.join(", ")})`);
    }

    // --- Layer 5: allowlist --------------------------------------------------
    if (!ALLOWED_CHARS.test(sanitized)) {
        reject("contains characters outside plain prose");
    }

    return {
        ok: rejections.length === 0,
        sanitized,
        rejections,
        flags,
    };
};
