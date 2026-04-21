const fetch = require("node-fetch");

// ──────────────────────────────
// API 키 & URL 설정
// ──────────────────────────────
const STDICT_KEY = "65CED42C4060FCCF99B9740E2D500BBC";
const OPENDICT_KEY = "C5C54EC59709F8F7D6026BC2DB48D8FF";

const STDICT_SEARCH_URL = "https://stdict.korean.go.kr/api/search.do";
const OPENDICT_SEARCH_URL = "https://opendict.korean.go.kr/api/search";

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
// 표준국어대사전 — 최대 3개 반환
// ──────────────────────────────
async function searchStdict(word) {
  const url =
    `${STDICT_SEARCH_URL}?key=${STDICT_KEY}` +
    `&q=${encodeURIComponent(word)}&req_type=json&num=10`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("stdict_http_error");

  const data = await safeJson(res);
  if (!data) return null;

  const channel = data?.channel;
  if (Number(channel?.total ?? 0) === 0) return null;

  // 전체 item 배열 확보
  const items = Array.isArray(channel?.item)
    ? channel.item
    : channel?.item ? [channel.item] : [];

  if (items.length === 0) return null;

  // 최대 3개까지 추출
  const results = items.slice(0, 3).map((item) => ({
    source: "표준국어대사전",
    word: item.word ?? word,
    pos: item.pos ?? "",
    definition: item.sense?.definition ?? "",
  }));

  return results;
}

// ──────────────────────────────
// 우리말샘 — 최대 3개 반환
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

  // 최대 3개까지 추출
  const results = items.slice(0, 3).map((item) => {
    const sense = Array.isArray(item.sense) ? item.sense[0] : item.sense;
    return {
      source: "우리말샘",
      word: item.word ?? word,
      pos: sense?.pos ?? item?.pos ?? "",
      definition: sense?.definition ?? "",
    };
  });

  return results;
}

// ──────────────────────────────
// 우리말샘 — 용례(예문) 검색 (part=exam)
// ──────────────────────────────
async function fetchExamples(word) {
  const url =
    `${OPENDICT_SEARCH_URL}?key=${OPENDICT_KEY}` +
    `&q=${encodeURIComponent(word)}` +
    `&req_type=json&num=10&part=exam`;

  const res = await fetch(url);
  if (!res.ok) return [];

  const data = await safeJson(res);
  if (!data) return [];

  const channel = data?.channel;
  if (Number(channel?.total ?? 0) === 0) return [];

  const items = Array.isArray(channel?.item)
    ? channel.item
    : channel?.item ? [channel.item] : [];

  const examples = [];
  for (const item of items) {
    if (item?.example) examples.push(item.example);
    if (examples.length >= 3) break; // 최대 3개
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
    let results = null;

    // ① 표준국어대사전 먼저 시도
    results = await searchStdict(word);

    // ② 없으면 우리말샘 시도
    if (!results) {
      results = await searchOpendict(word);
    }

    // ③ 둘 다 없음
    if (!results) {
      return res.status(200).json({
        found: false,
        word: word,
        definitions: [],  // 빈 배열
        examples: [],
      });
    }

    // ④ 예문은 우리말샘 part=exam 으로 가져옴
    const examples = await fetchExamples(word);

    // ⑤ 정상 반환
    return res.status(200).json({
      found: true,
      word: word,
      source: results[0].source,    // 어느 사전 출처인지
      definitions: results,         // 최대 3개 배열
      examples: examples,
    });

  } catch (err) {
    return res.status(502).json({
      error: "api_error",
      message: err.message,
    });
  }
};
