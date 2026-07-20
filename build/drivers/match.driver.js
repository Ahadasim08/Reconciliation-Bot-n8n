// Driver for the "Match" Code node. Appended after src/matcher.js.
const { payments, deals } = $input.first().json;
return [{ json: { matchResult: match(payments, deals, {}) } }];
