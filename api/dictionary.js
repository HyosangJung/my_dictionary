const fetch = require("node-fetch");

const STDICT_KEY = "65CED42C4060FCCF99B9740E2D500BBC";
const OPENDICT_KEY = "C5C54EC59709F8F7D6026BC2DB48D8FF";

const STDICT_SEARCH_URL = "https://stdict.korean.go.kr/api/search.do";
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

  const results = items.slice(0, 3).map((item) => ({
    source: "표준국어대사전",
    word: item.word ?? word,
    pos: item.pos ?? "",
    definition: item.sense?.definition ?? "",
  }));

  return results;
}

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

  const results = items.slice(0, 3).map((item) => {
    const sense = Array.isArray(item.sense) ? item.sense[0] : item.sense;
    return {
      source: "우리말샘",
      word: item.word ?? word,
      pos: sense?.pos ?? item?.pos ?? "",
      definition: sense?.definition ?? "",
      target_code: item.target_code ?? null,
    };
  });

  return results;
}

// ──────────────────────────────
// 예문 가져오기
// 우리말샘 view API → channel.item.sense_info[].example_info[].example 경로
// ──────────────────────────────
async function fetchExamples(word) {
  // ① 먼저 우리말샘 search로 target_code 확보
  const searchUrl =
    `${OPENDICT_SEARCH_URL}?key=${OPENDICT_KEY}` +
    `&q=${encodeURIComponent(word)}` +
    `&req_type=json&num=10&part=word`;

  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) return [];

  const searchData = await safeJson(searchRes);
  if (!searchData) return [];

  const items = Array.isArray(searchData?.channel?.item)
    ? searchData.channel.item
    : searchData?.channel?.item ? [searchData.channel.item] : [];

  if (items.length === 0) return [];

  // target_code는 첫 번째 item에서 가져옴
  const targetCode = items[0]?.target_code;
  if (!targetCode) return [];

  // ② view API 호출 → sense_info 하단의 example_info 탐색
  const viewUrl =
    `${OPENDICT_VIEW_URL}?key=${OPENDICT_KEY}` +
    `&method=target_code&req_type=json&q=${targetCode}`;

  const viewRes = await fetch(viewUrl);
  if (!viewRes.ok) return [];

  const viewData = await safeJson(viewRes);
  if (!viewData) return [];

  const examples = [];

  // channel.item.sense_info 경로
  const senseRaw = viewData?.channel?.item?.sense_info;
  const senseList = Array.isArray(senseRaw)
    ? senseRaw
    : senseRaw ? [senseRaw] : [];

  for (const sense of senseList) {
    // sense 하단의 example_info 경로
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

    // ① 표준국어대사전 먼저
    results = await searchStdict(word);

    // ② 없으면 우리말샘
    if (!results) {
      results = await searchOpendict(word);
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

    // ④ 예문: channel.item.sense_info → example_info → example 경로
    const examples = await fetchExamples(word);

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
