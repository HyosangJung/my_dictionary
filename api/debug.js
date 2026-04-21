const fetch = require("node-fetch");

const OPENDICT_KEY = "C5C54EC59709F8F7D6026BC2DB48D8FF";
const OPENDICT_SEARCH_URL = "https://opendict.korean.go.kr/api/search";
const OPENDICT_VIEW_URL = "https://opendict.korean.go.kr/api/view";

async function safeJson(res) {
  const text = await res.text();
  if (!text || text.trim() === "") return { _raw: "(빈 응답)" };
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text };
  }
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const word = req.query.q;
  const code = req.query.code;

  if (word && !code) {
    const url =
      `${OPENDICT_SEARCH_URL}?key=${OPENDICT_KEY}` +
      `&q=${encodeURIComponent(word)}` +
      `&req_type=json&num=10&part=word`;

    const searchRes = await fetch(url);
    const searchData = await safeJson(searchRes);

    const items = searchData?.channel?.item;
    const itemList = Array.isArray(items) ? items : items ? [items] : [];

    return res.status(200).json({
      total: searchData?.channel?.total,
      // item 전체 원문 그대로 반환 (필드명 확인용)
      first_item_raw: itemList[0] ?? null,
    });
  }

  if (code) {
    const url =
      `${OPENDICT_VIEW_URL}?key=${OPENDICT_KEY}` +
      `&method=target_code&req_type=json&q=${code}`;

    const viewRes = await fetch(url);
    const viewData = await safeJson(viewRes);

    return res.status(200).json({
      요청URL: url,
      item: viewData?.channel?.item ?? null,
    });
  }

  return res.status(400).json({ error: "q 또는 code 파라미터가 필요합니다." });
};
