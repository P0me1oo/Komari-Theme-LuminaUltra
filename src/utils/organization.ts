// 仅清理名称末尾的公司法律形式，不替换名称中间的文字。
const limited = String.raw`(?:l[.．\s]*t[.．\s]*d|limited)`;
const suffix = String.raw`(?:(?:co[.．]?|company)[\s,，.．]*${limited}|${limited}|i[.．\s]*n[.．\s]*c(?:orporated)?|l[.．\s]*l[.．\s]*c|corp(?:oration)?)`;
const separator = String.raw`[\s,，;；:：\-–—]`;
const punctuation = String.raw`[\s,.，．;；]*`;
const ending = new RegExp(
  String.raw`(?:${separator}+${suffix}${punctuation}|${separator}*\(${suffix}${punctuation}\)${punctuation}|${separator}*（${suffix}${punctuation}）${punctuation})$`,
  "i",
);

export function organizationLabel(value: string): string {
  const original = value.trim();
  let name = original;
  while (name) {
    const shortened = name.replace(ending, "").trimEnd();
    if (shortened === name) break;
    if (!shortened) return original;
    name = shortened;
  }
  return name;
}
