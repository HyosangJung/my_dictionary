const fetch = require("node-fetch");

// ──────────────────────────────
// API 키 & 기본 URL 설정
// ──────────────────────────────
const STDICT_KEY = "65CED42C4060FCCF99B9740E2D500BBC";
const OPENDICT_KEY = "C5C54EC59709F8F7D6026BC2DB48D8FF";

const STDICT_SEARCH_URL = "https://stdict.korean.go.kr/api/search.do";
const STDICT_VIEW_URL = "https://stdict.korean.go.kr/api/view.do";
const OPENDICT_SEARCH_URL = "https://opendict.korean.go.kr/api/search";
const OPENDICT_VIEW_URL = "https://opendict.korean.go.kr/api/view";

// ──────────────────────────────
// 안전한 JSON 파싱 함수 (핵심 수정 부분)
// 빈 응답이나 잘린 응답이 와도 터지지 않음
// ──────────────────────────────
async function safeJson(res) {
  const text = await res.text(); // JSON 말고 텍스트로 먼저 받기
  if (!text || text.trim() === "") return null; // 빈 응답이면 null
  try {
    return JSON.parse(text); // JSON으로 변환 시도
  } catch {
    return null; // 변환 실패해도 null로 처리 (터지지 않음)
  }
}

// ──────────────────────────────
// 표준국어대사전 검색
// ──────────────────────────────
async function searchStdict(word) {
  const url =
    `${STDICT_SEARCH_URL}` +
    `?key=${STDICT_KEY}` +
    `&q=${encodeURIComponent(word)}` +
    `&req_type=json` +
    `&num=1`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("stdict_http_error");

  // 수정: 안전한 파싱 사용
  const data = await safeJson(res);
  if (!data) return null;

  const channel = data?.channel;
  if (!channel?.total || channel.total === 0) return null;

  const item = Array.isArray(channel.item) ? channel.item[0] : channel.item;
  if (!item) return null;

  const sense = Array.isArray(item.sense) ? item.sense[0] : item.sense;

  return {
    source: "표준국어대사전",
    word: item.word,
    pos: sense?.pos ?? "",
    definition: sense?.definition ?? "",
    target_code: item.target_code ?? null,
  };
}

// ──────────────────────────────
// 우리말샘 검색
// ──────────────────────────────
async function searchOpendict(word) {
  const url =
    `${OPENDICT_SEARCH_URL}` +
    `?key=${OPENDICT_KEY}` +
    `&q=${encodeURIComponent(word)}` +
    `&req_type=json` +
    `&num=1`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("opendict_http_error");

  // 수정: 안전한 파싱 사용
  const data = await safeJson(res);
  if (!data) return null;

  const channel = data?.channel;
  if (!channel?.total || channel.total === 0) return null;

  const item = Array.isArray(channel.item) ? channel.item[0] : channel.item;
  if (!item) return null;

  const sense = Array.isArray(item.sense) ? item.sense[0] : item.sense;

  return {
    source: "우리말샘",
    word: item.word,
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

  // 수정: 안전한 파싱 사용
  const data = await safeJson(res);
  if (!data) return [];

  const examples = [];
  const posInfoList = data?.channel?.item?.word_info?.pos_info;
  if (!Array.isArray(posInfoList)) return [];

  for (const posInfo of posInfoList) {
    const commList = Array.isArray(posInfo?.comm_pattern_info)
      ? posInfo.comm_pattern_info
      : [posInfo?.comm_pattern_info];

    for (const comm of commList) {
      const senseList = Array.isArray(comm?.sense_info)
        ? comm.sense_info
        : [comm?.sense_info];

      for (const sense of senseList) {
        const exList = Array.isArray(sense?.example_info)
          ? sense.example_info
          : [];
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

  // 수정: 안전한 파싱 사용
  const data = await safeJson(res);
  if (!data) return [];

  const examples = [];
  const senseList = data?.channel?.item?.sense_info;
  if (!Array.isArray(senseList)) return [];

  for (const sense of senseList) {
    const exList = Array.isArray(sense?.example_info) ? sense.example_info : [];
    for (const ex of exList) {
      if (ex?.example) examples.push(ex.example);
      if (examples.length >= 3) return examples;
    }
  }

  return examples;
}

// ──────────────────────────────
// 메인 함수 (단축어에서 호출)
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
      if (result.target_code) {
        examples = await fetchStdictExamples(result.target_code);
      }
    } else {
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
