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
// sense 배열에서 최대 3개 추출
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
        target_code: sense?.target_code ?? null,
      });
      if (results.length >= 3) break;
    }
    if (results.length >= 3) break;
  }

  return results.length > 0 ? results : null;
}

// ──────────────────────────────
// 특정 target_code의 예문 가져오기
// view API → senseInfo.example_info[].example
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
    let opendictResults = null;

    // ① 표준국어대사전 먼저 시도
    results = await searchStdict(word);

    // 표준국어대사전/우리말샘 모두 우리말샘 target_code 필요
    // → 항상 우리말샘 검색 결과도 가져옴
    opendictResults = await searchOpendict(word);

    if (!results) {
      // ② 표준국어대사전에 없으면 우리말샘 결과를 메인으로
      results = opendictResults;
    }

    // ③ 둘 다 없음
    if (!results) {
      return res.status(200).json({
        found: false,
        word: word,
        definitions: [],
      });
    }

    // ④ 각 definition의 target_code로 예문 개별 조회
    // Promise.all로 동시에 호출 (속도 개선)
    const definitionsWithExamples = await Promise.all(
      results.map(async (def) => {
        // 우리말샘 results에서 동일한 뜻에 해당하는 target_code 찾기
        const matchedOpendict = opendictResults?.find(
          (o) => o.definition === def.definition
        );
        const targetCode =
          matchedOpendict?.target_code ?? def.target_code ?? null;

        // 해당 target_code로 예문 조회
        const examples = await fetchExamplesByCode(targetCode);

        return {
          source: def.source,
          word: def.word,
          pos: def.pos,
          definition: def.definition,
          examples: examples, // 각 뜻마다 예문 포함
        };
      })
    );

    // ⑤ 정상 반환
    return res.status(200).json({
      found: true,
      word: word,
      source: results[0].source,
      definitions: definitionsWithExamples,
    });

  } catch (err) {
    return res.status(502).json({
      error: "api_error",
      message: err.message,
    });
  }
};
