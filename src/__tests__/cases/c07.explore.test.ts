import { it } from "vitest";
import { generateWorld, exportWorld, openCaseDatabase } from "@/engine/world/generate";

it("explore", async () => {
  const w = await generateWorld();
  const bytes = exportWorld(w);
  const db = await openCaseDatabase(bytes, { clock: "2026-12-21 17:40:00", patches: ["p0.player", { id: "c07.admission", params: { clock: "2026-12-21 17:31:00" } }] });
  const q = (sql: string) => {
    const r = db.exec(sql);
    console.log("\n>>> " + sql + "\n" + (r[0] ? [r[0].columns.join(" | "), ...r[0].values.slice(0, 30).map((v) => v.join(" | "))].join("\n") + `\n(${r[0].values.length} rows)` : "(0 rows)"));
  };
  q("SELECT * FROM properties WHERE grantor_company_id = 18 ORDER BY id");
  q("SELECT COUNT(*) FROM properties WHERE grantor_company_id = 18 AND acquired_at BETWEEN '2015-03-01' AND '2015-12-31'");
  q("SELECT COUNT(*) FROM properties WHERE basis = 'передача от работодателя' AND acquired_at LIKE '2015%'");
  q("SELECT * FROM properties WHERE address_text LIKE 'Северная%' ORDER BY address_text");
  q("SELECT * FROM employment WHERE company_id = 18 AND person_id IS NULL");
  q("SELECT COUNT(*) FROM employment WHERE company_id = 18");
  q("SELECT * FROM accounts WHERE holder_person_id IN (1104, 1602, 1530)");
  q("SELECT t.account_id, t.amount, t.purpose, COUNT(*), MIN(ts), MAX(ts) FROM transactions t WHERE counterparty = 'Фонд «Тёплый берег»' GROUP BY 1,2,3 ORDER BY 4 DESC LIMIT 12");
  q("SELECT id, ts, amount, purpose FROM transactions WHERE account_id = 'ACC-41104' AND ts LIKE '2016-1%' ORDER BY ts");
  q("SELECT * FROM hospital_admissions ORDER BY admitted_at DESC LIMIT 3");
  q("SELECT * FROM persons WHERE id < 100 LIMIT 5");
  q("SELECT * FROM registrations WHERE person_id IN (1104, 1105, 1602)");
  q("SELECT COUNT(*) FROM persons p WHERE NOT EXISTS (SELECT 1 FROM registrations r WHERE r.person_id = p.id) AND NOT EXISTS (SELECT 1 FROM phones f WHERE f.person_id = p.id) AND NOT EXISTS (SELECT 1 FROM employment e WHERE e.person_id = p.id)");
  q("SELECT * FROM companies WHERE name LIKE '%Глубина%'");
  q("SELECT * FROM persons WHERE last_name LIKE 'Ратников%'");
}, 60000);
