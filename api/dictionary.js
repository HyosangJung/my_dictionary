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

  return items.slice(0, 3).map((item) => ({
    source: "표준국어대사전",
    word: item.word ?? word,
    pos: item.pos ?? "",
    definition: item.sense?.definition ?? "",
  }));
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

async function fetchExamples(word) {
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

  const targetCode = items[0]?.target_code;
  if (!targetCode) return [];

  const viewUrl =
    `${OPENDICT_VIEW_URL}?key=${OPENDICT_KEY}` +
    `&method=target_code&req_type=json&q=${targetCode}`;

  const viewRes = await fetch(viewUrl);
  if (!viewRes.ok) return [];

  const viewData = await safeJson(viewRes);
  if (!viewData) return [];

  const examples = [];

  const senseRaw = viewData?.channel?.item?.sense_info;
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

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const word = req.query.q;
  const debug = req.query.debug;

  if (!word) {
    return res.status(400).json({ error: "검색어(q)가 없습니다." });
  }

  // ──────────────────────────────
  // 디버그: 우리말샘 search → target_code → view 원문 확인
  // ?q=사랑&debug=view
  // ──────────────────────────────
  if (debug === "view") {
    // ① target_code 가져오기
    const searchUrl =
      `${OPENDICT_SEARCH_URL}?key=${OPENDICT_KEY}` +
      `&q=${encodeURIComponent(word)}` +
      `&req_type=json&num=10&part=word`;

    const searchRes = await fetch(searchUrl);
    const searchData = await safeJson(searchRes);

    const items = Array.isArray(searchData?.channel?.item)
      ? searchData.channel.item
      : searchData?.channel?.item ? [searchData.channel.item] : [];

    const targetCode = items[0]?.target_code;

    if (!targetCode) {
      return res.status(200).json({
        error: "target_code 없음",
        searchData: searchData?.channel,
      });
    }

    // ② view API 원문 그대로 반환
    const viewUrl =
      `${OPENDICT_VIEW_URL}?key=${OPENDICT_KEY}` +
      `&method=target_code&req_type=json&q=${targetCode}`;

    const viewRes = await fetch(viewUrl);
    const viewData = await safeJson(viewRes);

    return res.status(200).json({
      targetCode,
      viewUrl,
      // channel.item 전체를 그대로 반환해서 구조 파악
      item: viewData?.channel?.item ?? null,
    });
  }

  try {
    let results = null;

    results = await searchStdict(word);
    if (!results) results = await searchOpendict(word);

    if (!results) {
      return res.status(200).json({
        found: false,
        word: word,
        definitions: [],
        examples: [],
      });
    }

    const examples = await fetchExamples(word);

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
