const fetch = require("node-fetch");

const OPENDICT_KEY = "C5C54EC59709F8F7D6026BC2DB48D8FF";
const OPENDICT_VIEW_URL = "https://opendict.korean.go.kr/api/view";

async function safeJson(res) {
  const text = await res.text();
  if (!text || text.trim() === "") return { _raw: "(빈 응답)" };
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text }; // XML 등 원문 그대로
  }
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  // target_code를 URL에서 받음
  // 예: /api/debug?code=435977
  const code = req.query.code;

  if (!code) {
    return res.status(400).json({ error: "code 파라미터가 없습니다." });
  }

  const url =
    `${OPENDICT_VIEW_URL}?key=${OPENDICT_KEY}` +
    `&method=target_code` +
    `&req_type=json` +
    `&q=${code}`;

  const viewRes = await fetch(url);
  const viewData = await safeJson(viewRes);

  // 응답 원문 그대로 반환
  return res.status(200).json({
    요청URL: url,
    응답: viewData,
  });
};
