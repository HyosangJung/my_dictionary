const fetch = require("node-fetch");

const STDICT_KEY = "65CED42C4060FCCF99B9740E2D500BBC";
const OPENDICT_KEY = "C5C54EC59709F8F7D6026BC2DB48D8FF";

const STDICT_SEARCH_URL = "https://stdict.korean.go.kr/api/search.do";
const STDICT_VIEW_URL = "https://stdict.korean.go.kr/api/view.do";
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

  const item = Array.isArray(channel?.item) ? channel.item[0] : channel?.item;
  if (!item) return null;

  const sense = Array.isArray(item.sense) ? item.sense[0] : item.sense;

  return {
    source: "표준국어대사전",
    word: item.word ?? word,
    // pos가 sense 안에 없을 경우 item 직접에서도 시도
    pos: sense?.pos ?? item?.pos ?? "",
    definition: sense?.definition ?? "",
    target_code: item.target_code ?? null,
  };
}

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

async function fetchStdictExamples(targetCode) {
  const url =
    `${STDICT_VIEW_URL}?key=${STDICT_KEY}` +
    `&method=target_code&req_type=json&q=${targetCode}`;

  const res = await fetch(url);
  if (!res.ok) return [];

  const data = await safeJson(res);
  if (!data) return [];

  const examples = [];
  const posInfoRaw = data?.channel?.item?.word_info?.pos_info;
  const posInfoList = Array.isArray(posInfoRaw) ? posInfoRaw : posInfoRaw ? [posInfoRaw] : [];

  for (const posInfo of posInfoList) {
    const commRaw = posInfo?.comm_pattern_info;
    const commList = Array.isArray(commRaw) ? commRaw : commRaw ? [commRaw] : [];

    for (const comm of commList) {
      const senseRaw = comm?.sense_info;
      const senseList = Array.isArray(senseRaw) ? senseRaw : senseRaw ? [senseRaw] : [];

      for (const sense of senseList) {
        const exRaw = sense?.example_info;
        const exList = Array.isArray(exRaw) ? exRaw : exRaw ? [exRaw] : [];

        for (const ex of exList) {
          if (ex?.example) examples.push(ex.example);
          if (examples.length >= 3) return examples;
        }
      }
    }
  }

  return examples;
}

async function fetchOpendictExamples(targetCode) {
  const url =
    `${OPENDICT_VIEW_URL}?key=${OPENDICT_KEY}` +
    `&method=target_code&req_type=json&q=${targetCode}`;

  const res = await fetch(url);
  if (!res.ok) return [];

  const data = await safeJson(res);
  if (!data) return [];

  const examples = [];
  const senseRaw = data?.channel?.item?.sense_info;
  const senseList = Array.isArray(senseRaw) ? senseRaw : senseRaw ? [senseRaw] : [];

  for (const sense of senseList) {
    const exRaw = sense?.example_info;
    const exList = Array.isArray(exRaw) ? exRaw : exRaw ? [exRaw] : [];

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
  // 디버그: view API 원문 확인용
  // ?q=사랑&debug=view_stdict  → 표준국어대사전 view 원문
  // ?q=사랑&debug=view_opendict → 우리말샘 view 원문
  // ?q=사랑&debug=search_stdict → 표준국어대사전 search 원문
  // ──────────────────────────────
  if (debug === "view_stdict") {
    // 먼저 search로 target_code 가져오기
    const searchRes = await fetch(
      `${STDICT_SEARCH_URL}?key=${STDICT_KEY}&q=${encodeURIComponent(word)}&req_type=json&num=10`
    );
    const searchData = await safeJson(searchRes);
    const item = Array.isArray(searchData?.channel?.item)
      ? searchData.channel.item[0]
      : searchData?.channel?.item;
    const targetCode = item?.target_code;

    if (!targetCode) {
      return res.status(200).json({ error: "target_code 없음", searchData });
    }

    const viewRes = await fetch(
      `${STDICT_VIEW_URL}?key=${STDICT_KEY}&method=target_code&req_type=json&q=${targetCode}`
    );
    const viewData = await safeJson(viewRes);
    return res.status(200).json({ targetCode, viewData });
  }

  if (debug === "search_stdict") {
    const searchRes = await fetch(
      `${STDICT_SEARCH_URL}?key=${STDICT_KEY}&q=${encodeURIComponent(word)}&req_type=json&num=10`
    );
    const searchData = await safeJson(searchRes);
    return res.status(200).json({ searchData });
  }

  try {
    let result = null;
    let examples = [];

    result = await searchStdict(word);

    if (result?.target_code) {
      examples = await fetchStdictExamples(result.target_code);
    } else if (!result) {
      result = await searchOpendict(word);
      if (result?.target_code) {
        examples = await fetchOpendictExamples(result.target_code);
      }
    }

    if (!result) {
      return res.status(200).json({
        found: false,
        word: word,
        source: null,
        definition: null,
        examples: [],
      });
    }

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
