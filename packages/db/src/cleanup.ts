import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const slugs = ['brand-one', 'brand-two', 'brand-three', 'brand-four', 'brand-five']

  // Get brand IDs first
  const brands = await prisma.brand.findMany({ where: { slug: { in: slugs } }, select: { id: true } })
  const ids = brands.map(b => b.id)

  if (ids.length === 0) {
    console.log('No placeholder brands found — already clean!')
    return
  }

  // Delete related records first (FK constraints)
  await prisma.automationRule.deleteMany({ where: { brandId: { in: ids } } })
  await prisma.messageTemplate.deleteMany({ where: { brandId: { in: ids } } })
  await prisma.knowledgeChunk.deleteMany({ where: { brandId: { in: ids } } })
  await prisma.escalationRule.deleteMany({ where: { brandId: { in: ids } } })
  await prisma.contact.deleteMany({ where: { brandId: { in: ids } } })

  const deleted = await prisma.brand.deleteMany({ where: { id: { in: ids } } })
  console.log(`✓ Deleted ${deleted.count} placeholder brand(s)`)

  const remaining = await prisma.brand.findMany({ select: { name: true, slug: true } })
  console.log('\nRemaining brands:')
  remaining.forEach(b => console.log(` - ${b.name} (${b.slug})`))
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
