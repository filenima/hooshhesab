import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const rows = await db.blogPost.findMany({ where: { status: 'PUBLISHED' }, select: { slug: true, title: true, category: true }, orderBy: { publishedAt: 'asc' } });
for (const r of rows) console.log(r.slug + ' | ' + r.title + ' | ' + r.category);
await db.$disconnect();
