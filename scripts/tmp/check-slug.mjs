import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const rows = await db.blogPost.findMany({ where: { slug: 'cash-flow-statement-guide' }, select: { slug: true, status: true, publishedAt: true, title: true } });
console.log(JSON.stringify(rows, null, 1));
await db.$disconnect();
