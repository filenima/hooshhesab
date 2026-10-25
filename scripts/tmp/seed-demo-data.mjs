// Seed demo data for QA/video user via public APIs
const BASE = "http://127.0.0.1:3000";
const TOKEN = (await Bun.file("/tmp/qa-token.txt").text()).trim();

async function api(path, body, method = "POST") {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  return { status: res.status, j };
}

const parties = [
  { code: "C-1001", name: "رستوران فردوسی", type: "CUSTOMER", city: "تهران", province: "تهران", mobile: "09121112233", creditLimit: 200000000 },
  { code: "C-1002", name: "پخش نوین برتر", type: "CUSTOMER", city: "اصفهان", province: "اصفهان", mobile: "09131112244", creditLimit: 350000000 },
  { code: "C-1003", name: "صنایع غذایی آرین", type: "BOTH", city: "شیراز", province: "فارس", mobile: "09171112255", creditLimit: 500000000 },
  { code: "C-1004", name: "فروشگاه زنجیره‌ای مهر", type: "CUSTOMER", city: "مشهد", province: "خراسان رضوی", mobile: "09151112266", creditLimit: 800000000 },
  { code: "C-1005", name: "داروخانه دکتر رحیمی", type: "CUSTOMER", city: "تهران", province: "تهران", mobile: "09121113377", creditLimit: 120000000 },
  { code: "S-2001", name: "تأمین پلاستیک کارون", type: "SUPPLIER", city: "اهواز", province: "خوزستان", mobile: "09161114488" },
  { code: "S-2002", name: "بسته‌بندی سبز پارس", type: "SUPPLIER", city: "قم", province: "قم", mobile: "09121115599" },
  { code: "S-2003", name: "کارخانه قند شیروان", type: "SUPPLIER", city: "شیروان", province: "خراسان شمالی", mobile: "09151116600" },
];

const products = [
  { name: "روغن سرخ‌کردنی ۱.۸ لیتری (بسته ۱۲عدی)", unit: "کارتن", purchasePrice: 1450000, salePrice: 1780000, minStock: 20, maxStock: 500 },
  { name: "برنج هاشمی درجه‌یک ۵ کیلویی", unit: "کیسه", purchasePrice: 620000, salePrice: 780000, minStock: 50, maxStock: 1000 },
  { name: "رب گوجه فرنگی ۸۰۰ گرمی", unit: "قوطی", purchasePrice: 85000, salePrice: 118000, minStock: 100, maxStock: 2000 },
  { name: "چای کیسه‌ای ممتاز (بسته ۱۰۰عدی)", unit: "بسته", purchasePrice: 240000, salePrice: 315000, minStock: 60, maxStock: 800 },
  { name: "ماکارونی فرمی ۵۰۰ گرمی", unit: "بسته", purchasePrice: 28000, salePrice: 42000, minStock: 200, maxStock: 3000 },
  { name: "کنسرو ماهی ۱۸۰ گرمی", unit: "قوطی", purchasePrice: 92000, salePrice: 125000, minStock: 80, maxStock: 1500 },
  { name: "شکر بسته ۹۰۰ گرمی", unit: "کیسه", purchasePrice: 68000, salePrice: 89000, minStock: 150, maxStock: 2500 },
  { name: "حوله دستی پنبه‌ای", unit: "عدد", purchasePrice: 145000, salePrice: 210000, minStock: 30, maxStock: 400 },
  { name: "دستمال کاغذی ۳۰۰ برگ", unit: "بسته", purchasePrice: 52000, salePrice: 72000, minStock: 100, maxStock: 1200 },
  { name: "مایع ظرفشویی ۳.۵ لیتری", unit: "گالن", purchasePrice: 185000, salePrice: 245000, minStock: 40, maxStock: 600 },
];

async function main() {
  console.log("== creating parties ==");
  const partyIds = [];
  for (const p of parties) {
    const r = await api("/api/parties", p);
    if (r.status === 200 || r.status === 201) {
      partyIds.push(r.j?.data?.id || r.j?.id);
      console.log("ok", p.name);
    } else {
      console.log("SKIP", p.name, r.status, JSON.stringify(r.j).slice(0, 120));
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log("== creating products ==");
  const productIds = [];
  for (const p of products) {
    const r = await api("/api/products", p);
    if (r.status === 200 || r.status === 201) {
      productIds.push(r.j?.data?.id || r.j?.id);
      console.log("ok", p.name.slice(0, 30));
    } else {
      console.log("SKIP", p.name.slice(0, 30), r.status, JSON.stringify(r.j).slice(0, 120));
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log("== creating invoices ==");
  const invSpecs = [
    { party: 0, daysAgo: 1, items: [[0, 12, 1780000], [1, 25, 780000]], desc: "سفارش هفتگی رستوران" },
    { party: 1, daysAgo: 2, items: [[4, 300, 42000], [3, 80, 315000]], desc: "پخش منطقه‌ای" },
    { party: 3, daysAgo: 3, items: [[0, 45, 1715000], [1, 120, 762000], [6, 200, 89000]], desc: "سفارش زنجیره‌ای" },
    { party: 4, daysAgo: 4, items: [[5, 60, 125000], [2, 90, 118000]], desc: "تأمین داروخانه" },
    { party: 2, daysAgo: 5, items: [[8, 150, 72000], [9, 40, 245000]], desc: "اقلام بهداشتی" },
    { party: 0, daysAgo: 6, items: [[1, 15, 780000]], desc: "سفارش تکمیلی" },
    { party: 1, daysAgo: 7, items: [[7, 25, 210000], [8, 80, 72000]], desc: "پارچه و ملزومات" },
    { party: 3, daysAgo: 8, items: [[0, 20, 1780000], [4, 500, 41000], [6, 300, 89000]], desc: "سبد خرید ماهانه" },
  ];
  let ok = 0;
  for (const s of invSpecs) {
    const pid = partyIds[s.party];
    if (!pid) { console.log("skip (no party)"); continue; }
    const items = s.items
      .map(([pi, qty, price]) => ({ productId: productIds[pi] || undefined, quantity: qty, unitPrice: price, discount: 0, taxRate: 0.1, description: products[pi]?.name }))
      .filter((it) => it.productId);
    const d = new Date(Date.now() - s.daysAgo * 86400000);
    const r = await api("/api/accounting/invoices", {
      type: "SALE",
      partyId: pid,
      date: d.toISOString().slice(0, 10),
      description: s.desc,
      items,
    });
    if (r.status === 200 || r.status === 201) { ok++; console.log("ok invoice", s.desc); }
    else console.log("ERR invoice", r.status, JSON.stringify(r.j).slice(0, 140));
    await new Promise((r2) => setTimeout(r2, 300));
  }
  console.log(`done: ${ok}/${invSpecs.length} invoices, parties=${partyIds.length}, products=${productIds.length}`);
}
main();
