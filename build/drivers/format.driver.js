// Driver for the "Format" Code node. Appended after src/format.js.
// Produces both outputs format.js owns: Slack blocks and Sheet rows.
// Split Out(sheetRows) downstream feeds the Sheets append node; `blocks`
// goes straight to the Slack HTTP Request node.
const { matchResult, exceptions } = $input.first().json;
const slack = formatSlackMessage(matchResult, exceptions, {});
const sheetRows = formatSheetRows(exceptions);
return [{ json: { blocks: slack.blocks, sheetRows } }];
