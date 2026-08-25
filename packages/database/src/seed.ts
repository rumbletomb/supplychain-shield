import { prisma } from "./index.js";

async function seed() {
  const organization = await prisma.organization.upsert({
    where: { githubLogin: "shield-demo" },
    update: {},
    create: { githubLogin: "shield-demo", displayName: "SupplyChain Shield Demo" },
  });

  const repository = await prisma.repository.upsert({
    where: { fullName: "shield-demo/vulnerable-node" },
    update: {},
    create: {
      githubId: -1,
      owner: "shield-demo",
      name: "vulnerable-node",
      fullName: "shield-demo/vulnerable-node",
      organizationId: organization.id,
    },
  });

  await prisma.policy.upsert({
    where: { repositoryId: repository.id },
    update: {},
    create: { repositoryId: repository.id, deniedLicenses: [], ignoredRules: [] },
  });

  console.log(`Seeded demo repository ${repository.fullName}`);
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
