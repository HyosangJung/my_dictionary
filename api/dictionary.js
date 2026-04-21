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

  const items = Array.isArray(channel?.item)
    ? channel.item
    : channel?.item ? [channel.item] : [];

  if (items.length === 0) return null;

  return items.slice(0, 3).map((item) => ({
    source: "표준국어대사전",
    word: item.word ?? word,
    pos: item.pos ?? "",
    definition: item.sense?.definition ?? "",
    target_code: item.target_code ?? null,
  }));
}

// ──────────────────────────────
// 우리말샘 — 최대 3개 반환 (part=word)
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

  return items.slice(0, 3).map((item) => {
    const sense = Array.isArray(item.sense) ? item.sense[0] : item.sense;
    return {
      source: "우리말샘",
      word: item.word ?? word,
      pos: sense?.pos ?? item?.pos ?? "",
      definition: sense?.definition ?? "",
      target_code: item.target_code ?? null,
    };
  });
}

// ──────────────────────────────
// 예문 가져오기
// 1. part=exam 으로 해당 단어 예문 검색
// 2. part=word 에서 받은 target_code 와 일치하는 것만 필터링
// ──────────────────────────────
async function fetchExamples(word, targetCode) {
  const url =
    `${OPENDICT_SEARCH_URL}?key=${OPENDICT_KEY}` +
    `&q=${encodeURIComponent(word)}` +
    `&req_type=json&num=100&part=exam`; // 넉넉하게 100개 받아서 필터링

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
    // target_code가 일치하는 예문만 선택
    if (String(item?.target_code) === String(targetCode) && item?.example) {
      examples.push(item.example);
    }
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
    let targetCode = null;

    // ① 표준국어대사전 먼저 시도
    results = await searchStdict(word);

    if (results) {
      // 표준국어대사전에서 찾은 경우
      // 예문은 우리말샘 기준이라 우리말샘 target_code 별도로 가져옴
      const opendictResults = await searchOpendict(word);
      targetCode = opendictResults?.[0]?.target_code ?? null;
    } else {
      // ② 우리말샘 시도
      results = await searchOpendict(word);
      targetCode = results?.[0]?.target_code ?? null;
    }

    // ③ 둘 다 없음
    if (!results) {
      return res.status(200).json({
        found: false,
        word: word,
        definitions: [],
        examples: [],
      });
    }

    // ④ target_code 일치하는 예문만 가져오기
    const examples = targetCode
      ? await fetchExamples(word, targetCode)
      : [];

    // ⑤ 정상 반환
    return res.status(200).json({
      found: true,
      word: word,
      source: results[0].source,
      definitions: results,
      examples: examples,
    });

  } catch (err) {
    return res.status(502).json({
      error: "api_error",
      message: err.message,
    });
  }
};
