const fetch = require("node-fetch");

// ──────────────────────────────
// API 키 & URL 설정
// ──────────────────────────────
const STDICT_KEY = "65CED42C4060FCCF99B9740E2D500BBC";
const OPENDICT_KEY = "C5C54EC59709F8F7D6026BC2DB48D8FF";

const STDICT_SEARCH_URL = "https://stdict.korean.go.kr/api/search.do";
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
// 표준국어대사전 검색
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
// 우리말샘 검색 (part=word)
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
// 우리말샘 view API에 target_code 직접 전달
// → sense_info → example_info → example 경로
// ──────────────────────────────
async function fetchExamples(targetCode) {
  // target_code 없으면 바로 종료
  if (!targetCode) return [];

  const url =
    `${OPENDICT_VIEW_URL}?key=${OPENDICT_KEY}` +
    `&method=target_code` +   // target_code로 직접 조회
    `&req_type=json` +
    `&q=${targetCode}`;       // target_code 값을 q에 전달

  const res = await fetch(url);
  if (!res.ok) return [];

  const data = await safeJson(res);
  if (!data) return [];

  // sense_info 배열 꺼내기
  const senseRaw = data?.channel?.item?.sense_info;
  const senseList = Array.isArray(senseRaw)
    ? senseRaw
    : senseRaw ? [senseRaw] : [];

  const examples = [];

  for (const sense of senseList) {
    // sense 하단 example_info 배열 꺼내기
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
    let results = null;
    let targetCode = null;

    // ① 표준국어대사전 먼저 시도
    results = await searchStdict(word);

    if (results) {
      // 표준국어대사전에서 찾은 경우
      // 예문은 우리말샘 view API 기준 → 우리말샘 target_code 별도로 가져옴
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

    // ④ target_code로 view API 직접 조회 → 예문 추출
    const examples = await fetchExamples(targetCode);

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
