const fetch = require("node-fetch");

// ──────────────────────────────
// API 키 설정
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
// pos는 item 바로 아래에 있음 (수정)
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

  // item은 배열로 옴
  const item = Array.isArray(channel?.item) ? channel.item[0] : channel?.item;
  if (!item) return null;

  // sense는 객체로 옴 (배열 아님)
  const sense = item.sense;

  return {
    source: "표준국어대사전",
    word: item.word ?? word,
    pos: item.pos ?? "",            // ← 수정: item 바로 아래에서 읽기
    definition: sense?.definition ?? "",
    target_code: item.target_code ?? null,
  };
}

// ──────────────────────────────
// 우리말샘 검색
// ──────────────────────────────
async function searchOpendict(word) {
  const url =
    `${OPENDICT_SEARCH_URL}?key=${OPENDICT_KEY}` +
    `&q=${encodeURIComponent(word)}&req_type=json&num=10`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("opendict_http_error");

  const data = await safeJson(res);
  if (!data) return null;

  const channel = data?.channel;
  if (Number(channel?.total ?? 0) === 0) return null;

  const item = Array.isArray(channel?.item) ? channel.item[0] : channel?.item;
  if (!item) return null;

  const sense = Array.isArray(item.sense) ? item.sense[0] : item.sense;

  return {
    source: "우리말샘",
    word: item.word ?? word,
    pos: sense?.pos ?? item?.pos ?? "",
    definition: sense?.definition ?? "",
    target_code: item.target_code ?? null,
  };
}

// ──────────────────────────────
// 우리말샘 예문 가져오기 (view API)
// 표준국어대사전 view API는 JSON 응답 불안정 → 우리말샘만 사용
// ──────────────────────────────
async function fetchOpendictExamples(targetCode) {
  const url =
    `${OPENDICT_VIEW_URL}?key=${OPENDICT_KEY}` +
    `&method=target_code&req_type=json&q=${targetCode}`;

  const res = await fetch(url);
  if (!res.ok) return [];

  const data = await safeJson(res);
  if (!data) return [];

  const examples = [];

  // sense_info가 배열인지 객체인지 통일
  const senseRaw = data?.channel?.item?.sense_info;
  const senseList = Array.isArray(senseRaw) ? senseRaw : senseRaw ? [senseRaw] : [];

  for (const sense of senseList) {
    const exRaw = sense?.example_info;
    const exList = Array.isArray(exRaw) ? exRaw : exRaw ? [exRaw] : [];

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
    let result = null;
    let examples = [];

    // ① 표준국어대사전 먼저 시도
    result = await searchStdict(word);

    if (result) {
      // 표준국어대사전에서 찾았어도 예문은 우리말샘 view API로 시도
      // (표준국어대사전 view API JSON 응답 불안정)
      const opendictForExample = await searchOpendict(word);
      if (opendictForExample?.target_code) {
        examples = await fetchOpendictExamples(opendictForExample.target_code);
      }
    } else {
      // ② 표준국어대사전에 없으면 우리말샘 시도
      result = await searchOpendict(word);
      if (result?.target_code) {
        examples = await fetchOpendictExamples(result.target_code);
      }
    }

    // ③ 둘 다 없음
    if (!result) {
      return res.status(200).json({
        found: false,
        word: word,
        source: null,
        definition: null,
        examples: [],
      });
    }

    // ④ 정상 반환
    return res.status(200).json({
      found: true,
      word: result.word,
      pos: result.pos,
      source: result.source,
      definition: result.definition,
      examples: examples,       // 우리말샘 view API에서 가져온 예문
    });

  } catch (err) {
    return res.status(502).json({
      error: "api_error",
      message: err.message,
    });
  }
};
