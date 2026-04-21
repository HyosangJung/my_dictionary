const fetch = require("node-fetch");

// ──────────────────────────────
// API 키 & URL 설정
// ──────────────────────────────
const OPENDICT_KEY = "C5C54EC59709F8F7D6026BC2DB48D8FF";
const OPENDICT_SEARCH_URL = "https://opendict.korean.go.kr/api/search";
const OPENDICT_VIEW_URL = "https://opendict.korean.go.kr/api/view";

// ──────────────────────────────
// 안전한 JSON 파싱
// ──────────────────────────────
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
// 우리말샘 검색 (part=word)
// sense[] 안에 target_code, pos, definition 있음
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
        source: "우리말샘",
        word: item.word ?? word,
        pos: sense?.pos ?? "",
        definition: sense?.definition ?? "",
        target_code: sense?.target_code ?? null, // 예문 조회에 사용
      });
      if (results.length >= 3) break;
    }
    if (results.length >= 3) break;
  }

  return results.length > 0 ? results : null;
}

// ──────────────────────────────
// 특정 target_code의 예문 가져오기
// view API → channel.item.senseInfo.example_info[].example
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

  // senseInfo (카멜케이스) 경로
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
      if (examples.length >= 3) return examples; // 최대 3개
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
    // ① 우리말샘 검색
    const results = await searchOpendict(word);

    // ② 단어 없음
    if (!results) {
      return res.status(200).json({
        found: false,
        word: word,
        definitions: [],
      });
    }

    // ③ 각 뜻의 target_code로 예문 개별 조회 (동시 호출)
    const definitionsWithExamples = await Promise.all(
      results.map(async (def) => {
        const examples = await fetchExamplesByCode(def.target_code);
        return {
          word: def.word,
          pos: def.pos,
          definition: def.definition,
          examples: examples, // 각 뜻마다 예문
        };
      })
    );

    // ④ 정상 반환
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
