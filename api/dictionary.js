const fetch = require("node-fetch");

const OPENDICT_KEY = "C5C54EC59709F8F7D6026BC2DB48D8FF";
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
        word: item.word ?? word,
        definition: sense?.definition ?? "",
        target_code: sense?.target_code ?? null,
      });
      if (results.length >= 5) break;
    }
    if (results.length >= 5) break;
  }

  return results.length > 0 ? results : null;
}

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
      if (examples.length >= 3) return examples;
    }
  }

  return examples;
}

function cleanText(str) {
  return (str || "")
    .replace(/[{}]/g, "")
    .replace(/"/g, "'")
    .replace(/\n/g, " ")
    .replace(/\r/g, "");
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const word = req.query.q;
  const plain = req.query.plain === "true";

  if (!word) {
    return res.status(400).json({ error: "검색어(q)가 없습니다." });
  }

  try {
    const results = await searchOpendict(word);

    if (!results) {
      if (plain) return res.status(200).send("검색 결과 없음");
      return res.status(200).json({ found: false, word, definitions: [] });
    }

    const definitionsWithExamples = await Promise.all(
      results.map(async (def) => {
        const examples = await fetchExamplesByCode(def.target_code);
        return { word: def.word, definition: def.definition, examples };
      })
    );

    if (plain) {
      const lines = definitionsWithExamples.map((def, i) => {
        const cleanDef = cleanText(def.definition);
        const cleanExamples = (def.examples || [])
          .map(cleanText)
          .join(" / ");
        return `뜻${i + 1}: ${cleanDef} | 예문: ${cleanExamples}`;
      });

      return res.status(200).send(lines.join(" || "));
    }

    return res.status(200).json({
      found: true,
      word,
      source: "우리말샘",
      definitions: definitionsWithExamples,
    });

  } catch (err) {
    return res.status(502).json({
      error: "api_error",
      message: err.message,
    });
  }
};
