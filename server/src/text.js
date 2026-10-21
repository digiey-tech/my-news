// Text features shared by grouping and background lookup.

const STOPWORDS = new Set(`a about above after again against all also am an and any are as at be because been before being
below between both but by can could did do does doing down during each few for from further had has have having he her
here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on
once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves
then there these they this those through to too under until up very was we were what when where which while who whom why
will with would you your yours yourself yourselves says said say new news live latest update updates watch video report
reports reported year years day days week weeks time first last one two three four five six seven eight nine ten many
amid after over us u.s more than people could would may might will can get gets got make makes made take takes took
back still told tell tells according since including want wants show shows shown former near via per its it's what's
here's there's he's she's they're we're you're don't doesn't didn't won't can't isn't aren't wasn't weren't`.split(/\s+/));

// Capitalized words that begin sentences or headlines and carry no entity meaning.
const CAPITAL_NOISE = new Set(`the a an in on at as after before how why what who when where this that these those it its
he she they we you i his her their our new more most first last watch live breaking exclusive opinion analysis
monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september
october november december but and or if is are was were has have will would can could should not no yes there here
some many all one two three four five six seven eight nine ten`.split(/\s+/));

// Capitalized words that are titles or generic place parts, not identifying
// names: "Lane County" and "Ventura County" should not share an entity.
const GENERIC_ENTITY = new Set(`county city state states river lake mount north south east west central northern southern
eastern western president senator minister prime governor mayor king queen prince princess department ministry council
court house party university police army republic federal national international street road`.split(/\s+/));

export function stem(word) {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us") && !word.endsWith("is")) return word.slice(0, -1);
  return word;
}

export function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[’']s\b/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word) && !/^\d{1,2}$/.test(word))
    .map(stem);
}

export function isGenericWord(token) {
  return GENERIC_ENTITY.has(token) || STOPWORDS.has(token);
}

// Capitalized words (names, places, organizations) as normalized tokens.
// A capital letter only signals a name when it is not explained by position:
// the first word of a sentence ("Wildfire forces...", "Firefighters said...")
// and words in Title Case Headlines count only if the same word is also
// capitalized somewhere in the middle of an ordinary sentence.
export function entityTokens(text) {
  const sentences = String(text || "").split(/(?<=[.!?:;])\s+|\s+[-|–—]\s+/).filter(Boolean);
  const midSentence = new Set();
  const candidates = [];
  for (const sentence of sentences) {
    const words = sentence.split(/\s+/).map((raw) => raw.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "")).filter(Boolean);
    const longWords = words.filter((w) => w.length > 3);
    const titleCase = longWords.length >= 3 && longWords.filter((w) => /^[A-Z]/.test(w)).length / longWords.length >= 0.7;
    words.forEach((raw, position) => {
      if (!/^[A-Z]/.test(raw)) return;
      const word = raw.toLowerCase().replace(/[’']s$/, "").replace(/[^a-z0-9]/g, "");
      if (word.length < 2 || CAPITAL_NOISE.has(word) || isGenericWord(word)) return;
      const acronym = /^[A-Z]{2,}$/.test(raw);
      const positional = position === 0 || titleCase;
      if (!positional || acronym) midSentence.add(word);
      candidates.push({ word, positional: positional && !acronym });
    });
  }
  const result = new Set();
  for (const { word, positional } of candidates) {
    if (!positional || midSentence.has(word)) result.add(stem(word));
  }
  return result;
}

// Multi-word capitalized phrases, used as candidate background-lookup terms.
export function entityPhrases(text) {
  const phrases = [];
  const matches = String(text || "").match(/\b[A-Z][A-Za-z'’.-]+(?:\s+(?:of|de|al|bin|the)?\s*[A-Z][A-Za-z'’.-]+)*/g) ?? [];
  for (const phrase of matches) {
    const words = phrase.split(/\s+/).filter(Boolean);
    // Drop leading noise ("The", "After"), but keep place names like "New Jersey".
    while (words.length && CAPITAL_NOISE.has(words[0].toLowerCase()) && !(words[0] === "New" && words.length > 1)) words.shift();
    const cleaned = words.join(" ").replace(/[’']s$/, "").replace(/[.,]$/, "").trim();
    if (cleaned.length >= 3 && !CAPITAL_NOISE.has(cleaned.toLowerCase())) phrases.push(cleaned);
  }
  return phrases;
}
