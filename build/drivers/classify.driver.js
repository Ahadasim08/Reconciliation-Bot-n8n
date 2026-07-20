// Driver for the "Classify" Code node. Appended after src/classify.js.
// Output feeds two branches: Split Out(exceptions) -> Postgres, and
// Format -> Slack/Sheets. Both need matchResult kept alongside exceptions.
const { matchResult } = $input.first().json;
const exceptions = classify(matchResult, {});
return [{ json: { matchResult, exceptions } }];
