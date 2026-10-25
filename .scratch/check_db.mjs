import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const latestTurns = await prisma.qaTurn.findMany({
    orderBy: { createdAt: 'desc' },
    take: 3,
    include: { conversation: true }
  });
  
  for (const t of latestTurns) {
    console.log('==============================');
    console.log('TURN ID:', t.id);
    console.log('CREATED AT:', t.createdAt);
    console.log('CONVERSATION ID:', t.conversationId);
    console.log('CONVERSATION KNOWLEDGE MODE:', t.conversation?.knowledgeMode);
    console.log('QUESTION:', t.question);
    console.log('RESPONSE STATUS:', t.response?.status);
    console.log('RESPONSE KNOWLEDGE MODE:', t.response?.knowledgeMode);
    console.log('PROVENANCE:', JSON.stringify(t.provenance, null, 2));
    console.log('CITATIONS:', JSON.stringify(t.response?.citations, null, 2));
  }
}

main().catch(err => console.error(err)).finally(() => prisma.$disconnect());
