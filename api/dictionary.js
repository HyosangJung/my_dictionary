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
// target_code는 sense 배열 안에 있음 (수정)
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

  // sense 배열의 첫 번째 항목에서 뜻/품사/target_code 모두 꺼냄
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
        target_code: sense?.target_code ?? null, // ← sense 안에서 꺼냄
      });
      if (results.length >= 3) break; // 최대 3개
    }
    if (results.length >= 3) break;
  }

  return results.length > 0 ? results : null;
}

// ──────────────────────────────
// 예문 가져오기
// sense[0].target_code → view API → senseInfo.example_info[].example
// ──────────────────────────────
async function fetchExamples(targetCode) {
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
    let results = null;
    let opendictTargetCode = null;

    // ① 표준국어대사전 먼저 시도
    results = await searchStdict(word);

    if (results) {
      // 표준국어대사전에서 찾은 경우
      // 예문용 target_code는 우리말샘에서 별도 확보
      const opendictResults = await searchOpendict(word);
      opendictTargetCode = opendictResults?.[0]?.target_code ?? null;
    } else {
      // ② 우리말샘 시도
      results = await searchOpendict(word);
      opendictTargetCode = results?.[0]?.target_code ?? null;
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

    // ④ 우리말샘 sense target_code로 예문 조회
    const examples = await fetchExamples(opendictTargetCode);

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
