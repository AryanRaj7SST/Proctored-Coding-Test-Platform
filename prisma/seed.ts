import { PrismaClient, QuestionType, Role } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.allowedEmail.upsert({
    where: { email: "admin@example.com" },
    update: { role: Role.ADMIN },
    create: { email: "admin@example.com", role: Role.ADMIN },
  });

  await prisma.question.upsert({
    where: { id: "sample-web-question" },
    update: {},
    create: {
      id: "sample-web-question",
      title: "Click the button to color a box",
      description: "Make the Add color button set the box background to tomato and Remove color restore it to white.",
      type: QuestionType.WEB,
      starterHtml: `<div id="box">Box</div>
<button onclick="showText()">Add color</button>
<button onclick="deleteText()">Remove color</button>`,
      starterCss: `#box { width: 160px; height: 100px; background: white; border: 1px solid #ccc; }`,
      starterJs: `function showText() {
  // TODO: Implement the expected behavior.
}

function deleteText() {
  // TODO: Implement the expected behavior.
}`,
      testSpec: `TODO: Store the trusted hidden test specification here. Expected behavior: Add color sets #box background to tomato; Remove color sets it to white.`,
      points: 10,
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
