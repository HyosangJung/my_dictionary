const fetch = require("node-fetch");

// ──────────────────────────────
// API 키 설정
// ──────────────────────────────
const STDICT_KEY = "65CED42C4060FCCF99B9740E2D500BBC";
const OPENDICT_KEY = "C5C54EC59709F8F7D6026BC2DB48D8FF";

const STDICT_SEARCH_URL = "https://stdict.korean.go.kr/api/search.do";
const STDICT_VIEW_URL = "https://stdict.korean.go.kr/api/view.do";
const OPENDICT_SEARCH_URL = "https://opendict.korean.go.kr/api/search";
const OPENDICT_VIEW_URL = "https://opendict.korean.go.kr/api/view";

// ──────────────────────────────
// 안전한 JSON 파싱 (빈 응답·XML 에러 대비)
// ──────────────────────────────
async function safeJson(res) {
  const text = await res.text();
  if (!text || text.trim() === "") return null;
  try {
    return JSON.parse(text);
  } catch {
    return null; // XML 등 JSON이 아닌 응답이면 null 처리
  }
}

// ──────────────────────────────
// 표준국어대사전 검색
// num=10 으로 수정 (최솟값 10)
// ──────────────────────────────
async function searchStdict(word) {
  const url =
    `${STDICT_SEARCH_URL}` +
    `?key=${STDICT_KEY}` +
    `&q=${encodeURIComponent(word)}` +
    `&req_type=json` +
    `&num=10`;  // ← 수정: 1 → 10

  const res = await fetch(url);
  if (!res.ok) throw new Error("stdict_http_error");

  const data = await safeJson(res);
  if (!data) return null;

  const channel = data?.channel;

  // total이 문자열로 올 수도 있어서 숫자로 변환
  const total = Number(channel?.total ?? 0);
  if (total === 0) return null;

  // item이 배열일 수도, 객체일 수도 있음
  const item = Array.isArray(channel?.item)
    ? channel.item[0]
    : channel?.item;
  if (!item) return null;

  // sense도 동일하게 처리
  const sense = Array.isArray(item.sense)
    ? item.sense[0]
    : item.sense;

  return {
    source: "표준국어대사전",
    word: item.word ?? word,
    pos: sense?.pos ?? "",
    definition: sense?.definition ?? "",
    target_code: item.target_code ?? null,
  };
}

// ──────────────────────────────
// 우리말샘 검색
// num=10 으로 수정 (최솟값 10)
// ──────────────────────────────
async function searchOpendict(word) {
  const url =
    `${OPENDICT_SEARCH_URL}` +
    `?key=${OPENDICT_KEY}` +
    `&q=${encodeURIComponent(word)}` +
    `&req_type=json` +
    `&num=10`;  // ← 수정: 1 → 10

  const res = await fetch(url);
  if (!res.ok) throw new Error("opendict_http_error");

  const data = await safeJson(res);
  if (!data) return null;

  const channel = data?.channel;

  const total = Number(channel?.total ?? 0);
  if (total === 0) return null;

  const item = Array.isArray(channel?.item)
    ? channel.item[0]
    : channel?.item;
  if (!item) return null;

  const sense = Array.isArray(item.sense)
    ? item.sense[0]
    : item.sense;

  return {
    source: "우리말샘",
    word: item.word ?? word,
    pos: sense?.pos ?? "",
    definition: sense?.definition ?? "",
    target_code: item.target_code ?? null,
  };
}

// ──────────────────────────────
// 표준국어대사전 예문 가져오기
// ──────────────────────────────
async function fetchStdictExamples(targetCode) {
  const url =
    `${STDICT_VIEW_URL}` +
    `?key=${STDICT_KEY}` +
    `&method=target_code` +
    `&req_type=json` +
    `&q=${targetCode}`;

  const res = await fetch(url);
  if (!res.ok) return [];

  const data = await safeJson(res);
  if (!data) return [];

  const examples = [];
  const posInfoRaw = data?.channel?.item?.word_info?.pos_info;

  // pos_info가 배열인지 객체인지 통일
  const posInfoList = Array.isArray(posInfoRaw)
    ? posInfoRaw
    : posInfoRaw ? [posInfoRaw] : [];

  for (const posInfo of posInfoList) {
    const commRaw = posInfo?.comm_pattern_info;
    const commList = Array.isArray(commRaw)
      ? commRaw
      : commRaw ? [commRaw] : [];

    for (const comm of commList) {
      const senseRaw = comm?.sense_info;
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
    }
  }

  return examples;
}

// ──────────────────────────────
// 우리말샘 예문 가져오기
// ──────────────────────────────
async function fetchOpendictExamples(targetCode) {
  const url =
    `${OPENDICT_VIEW_URL}` +
    `?key=${OPENDICT_KEY}` +
    `&method=target_code` +
    `&req_type=json` +
    `&q=${targetCode}`;

  const res = await fetch(url);
  if (!res.ok) return [];

  const data = await safeJson(res);
  if (!data) return [];

  const examples = [];
  const senseRaw = data?.channel?.item?.sense_info;
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
    let result = null;
    let examples = [];

    // ① 표준국어대사전 먼저 시도
    result = await searchStdict(word);

    if (result?.target_code) {
      examples = await fetchStdictExamples(result.target_code);
    } else if (!result) {
      // ② 없으면 우리말샘 시도
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
      examples: examples,
    });

  } catch (err) {
    return res.status(502).json({
      error: "api_error",
      message: err.message,
    });
  }
};
