const fetch = require("node-fetch");

const OPENDICT_KEY = "C5C54EC59709F8F7D6026BC2DB48D8FF";
const OPENDICT_SEARCH_URL = "https://opendict.korean.go.kr/api/search";
const OPENDICT_VIEW_URL = "https://opendict.korean.go.kr/api/view";

async function safeJson(res) {
  const text = await res.text();
  if (!text || text.trim() === "") return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ──────────────────────────────
// 우리말샘 검색 — 최대 5개, pos 제거
// ──────────────────────────────
async function searchOpendict(word) {
  const url =
    `${OPENDICT_SEARCH_URL}?key=${OPENDICT_KEY}` +
    `&q=${encodeURIComponent(word)}` +
    `&req_type=json&num=10&part=word`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("opendict_http_error");

  const data = await safeJson(res);
  if (!data) return null;

  const channel = data?.channel;
  if (Number(channel?.total ?? 0) === 0) return null;

  const items = Array.isArray(channel?.item)
    ? channel.item
    : channel?.item ? [channel.item] : [];

  if (items.length === 0) return null;

  const results = [];

  for (const item of items) {
    const senseList = Array.isArray(item.sense)
      ? item.sense
      : item.sense ? [item.sense] : [];

    for (const sense of senseList) {
      results.push({
        word: item.word ?? word,
        definition: sense?.definition ?? "",
        target_code: sense?.target_code ?? null, // 예문 조회용 (반환 안 함)
      });
      if (results.length >= 5) break; // ← 5개로 확장
    }
    if (results.length >= 5) break;   // ← 5개로 확장
  }

  return results.length > 0 ? results : null;
}

// ──────────────────────────────
// 예문 가져오기
// ──────────────────────────────
async function fetchExamplesByCode(targetCode) {
  if (!targetCode) return [];

  const url =
    `${OPENDICT_VIEW_URL}?key=${OPENDICT_KEY}` +
    `&method=target_code` +
    `&req_type=json` +
    `&q=${targetCode}`;

  const res = await fetch(url);
  if (!res.ok) return [];

  const data = await safeJson(res);
  if (!data) return [];

  const examples = [];

  const senseRaw = data?.channel?.item?.senseInfo;
  const senseList = Array.isArray(senseRaw)
    ? senseRaw
    : senseRaw ? [senseRaw] : [];

  for (const sense of senseList) {
    const exRaw = sense?.example_info;
    const exList = Array.isArray(exRaw)
      ? exRaw
      : exRaw ? [exRaw] : [];

    for (const ex of exList) {
      if (ex?.example) examples.push(ex.example);
      if (examples.length >= 3) return examples;
    }
  }

  return examples;
}

// ──────────────────────────────
// 메인 함수
// ──────────────────────────────
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const word = req.query.q;

  if (!word) {
    return res.status(400).json({ error: "검색어(q)가 없습니다." });
  }

  try {
    const results = await searchOpendict(word);

    if (!results) {
      return res.status(200).json({
        found: false,
        word: word,
        definitions: [],
      });
    }

    const definitionsWithExamples = await Promise.all(
      results.map(async (def) => {
        const examples = await fetchExamplesByCode(def.target_code);
        return {
          word: def.word,
          definition: def.definition, // pos 제거
          examples: examples,
        };
      })
    );

    return res.status(200).json({
      found: true,
      word: word,
      source: "우리말샘",
      definitions: definitionsWithExamples,
    });

  } catch (err) {
    return res.status(502).json({
      error: "api_error",
      message: err.message,
    });
  }
};
