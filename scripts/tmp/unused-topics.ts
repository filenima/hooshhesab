import { Database } from "bun:sqlite";
const db = new Database("db/custom.db", { readonly: true });
const used = new Set((db.query("SELECT slug FROM BlogPost").all() as any[]).map(r => r.slug));
const { TOPIC_BANK } = await import("../../lib/seo/topic-bank");
console.log("BANK SIZE:", TOPIC_BANK.length);
const unused = TOPIC_BANK.filter(t => !used.has(t.slug));
console.log("UNUSED:", unused.length);
const byCluster: Record<string, number> = {};
for (const t of unused) byCluster[t.cluster] = (byCluster[t.cluster] || 0) + 1;
console.log("BY CLUSTER:", JSON.stringify(byCluster));
// print unused industry topics first with details
const show = (c: string) => unused.filter(t => t.cluster === c).forEach(t => console.log(`${t.cluster} | ${t.slug} | ${t.title} | KW:${t.focusKeyword} | CAT:${t.category} | IMG:${t.coverImage}`));
(["industry","accounting","tax","moadian","payroll","tools","education","comparison","news"].forEach(show));
// raw storage types check
const raw = db.query("SELECT typeof(createdAt) as t1, createdAt, typeof(scheduledPublishAt) as t2, scheduledPublishAt, typeof(publishedAt) as t3, publishedAt, ogImage, metaTitle, metaDescription FROM BlogPost WHERE status='PUBLISHED' LIMIT 2").all() as any[];
console.log("PUBLISHED RAW:", JSON.stringify(raw, null, 1));
const raw2 = db.query("SELECT typeof(createdAt) as t1, createdAt, ogImage, canonicalUrl FROM BlogPost WHERE status='DRAFT' LIMIT 2").all() as any[];
console.log("DRAFT RAW:", JSON.stringify(raw2, null, 1));
const og = db.query("SELECT COUNT(*) as c FROM BlogPost WHERE ogImage IS NOT NULL").get() as any;
const can = db.query("SELECT COUNT(*) as c FROM BlogPost WHERE canonicalUrl IS NOT NULL").get() as any;
console.log("ogImage NOT NULL:", og.c, "| canonicalUrl NOT NULL:", can.c);
