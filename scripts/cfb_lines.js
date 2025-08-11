// scripts/cfb_lines.js
// Run examples:
//   mac/linux:  CFB_KEY="YOUR_KEY" node scripts/cfb_lines.js 2025 1 consensus
//   windows pwsh:  $env:CFB_KEY="YOUR_KEY"; node scripts/cfb_lines.js 2025 1 consensus

(async () => {
  try {
    const KEY = process.env.CFB_KEY;
    if (!KEY) {
      console.error("Missing CFB_KEY env var. Set it before running.");
      process.exit(1);
    }

    // Allow CLI overrides: node scripts/cfb_lines.js <year> <week> <book>
    const [, , argYear, argWeek, argBook] = process.argv;
    const year = Number(argYear) || 2025;
    const week = Number(argWeek) || 1;          // try 0/1/2 depending what’s posted
    const book = argBook || "consensus";        // 'consensus','Caesars','DraftKings','FanDuel',...
    const seasonType = "regular";

    const url = `https://api.collegefootballdata.com/lines?year=${year}&week=${week}&seasonType=${seasonType}&book=${book}`;

    const res = await fetch(url, { headers: { Authorization: `Bearer ${KEY}` } });
    if (!res.ok) {
      console.error("HTTP", res.status, res.statusText);
      console.error(await res.text());
      process.exit(1);
    }

    const data = await res.json();
    console.log(`Games returned: ${data.length} (year=${year}, week=${week}, book=${book})\n`);

    for (const g of data.slice(0, 20)) {
      const l = (g.lines || [])[0];             // first provider entry
      const spread = l?.spread ?? "n/a";
      const total = l?.overUnder ?? "n/a";
      console.log(`${g.awayTeam} @ ${g.homeTeam} | spread: ${spread} | total: ${total}`);
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
