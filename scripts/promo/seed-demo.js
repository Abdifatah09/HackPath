// Fills an empty database with a demo curriculum, a student part-way through it, rivals for the
// leaderboard and an admin, for recording the screenshots and videos. Run it from backend/ with the
// DB_* variables pointing at a throwaway database whose name contains "demo":
//
//   node ../scripts/promo/seed-demo.js           # fill an empty database
//   node ../scripts/promo/seed-demo.js --reset   # drop every table first, then fill it
//
// Logins: demo@hackpath.dev / admin@hackpath.dev, password Demo1234!
const path = require("path");
const { execFileSync } = require("child_process");
const bcrypt = require(path.resolve("node_modules/bcrypt"));
const {
  sequelize, User, Profile, Subject, Difficulty, Section, Challenge, ChallengeAttempt,
  UserSubscription, UserStats, Badge, UserBadge, Achievement, UserAchievement,
} = require(path.resolve("models"));
const { applyLevelUps } = require(path.resolve("utils/gamification"));
const { getRankFromXp } = require(path.resolve("utils/rank"));

const JS = 102, JAVA = 91;
const PASSWORD = "Demo1234!";

const js = (title, description, instructions, solution) =>
  ({ title, description, instructions, solution, starterCode: "// Your code here\n", languageId: JS });
const java = (title, description, instructions, body) => ({
  title, description, instructions, languageId: JAVA,
  starterCode: "public class Main {\n  public static void main(String[] args) {\n    // Your code here\n  }\n}\n",
  solution: `public class Main {\n  public static void main(String[] args) {\n    ${body}\n  }\n}\n`,
});

const CURRICULUM = [
  { name: "JavaScript", description: "The language of the web, from your first variable to closures.", levels: {
    Beginner: [
      { title: "Variables & Operators", description: "Store values and do maths with them.", challenges: [
        js("Add Two Numbers", "Add numbers and log the result.", "Create variables a = 10 and b = 5. Log their sum.", "let a = 10;\nlet b = 5;\nconsole.log(a + b);"),
        js("Subtract Two Numbers", "Subtract numbers and log the result.", "Create variables a = 20 and b = 7. Log a - b.", "let a = 20;\nlet b = 7;\nconsole.log(a - b);"),
        js("Multiply Two Numbers", "Multiply numbers and log the result.", "Create variables a = 6 and b = 4. Log a * b.", "let a = 6;\nlet b = 4;\nconsole.log(a * b);"),
        js("Remainder", "Use the % operator.", "Log the remainder when 17 is divided by 5.", "console.log(17 % 5);"),
      ] },
      { title: "Strings", description: "Join, measure and transform text.", challenges: [
        js("String Concatenation", "Combine two strings.", "Create firstName = 'Ada' and lastName = 'Lovelace'. Log the full name with a space between.", "let firstName = 'Ada';\nlet lastName = 'Lovelace';\nconsole.log(firstName + ' ' + lastName);"),
        js("Template Literals", "Use backticks to build strings.", "Create name = 'HackPath'. Log: Hello, HackPath!", "let name = 'HackPath';\nconsole.log(`Hello, ${name}!`);"),
        js("String Length", "Get the length of a string.", "Create word = 'JavaScript'. Log its length.", "let word = 'JavaScript';\nconsole.log(word.length);"),
        js("Reverse a String", "Split, reverse and join.", "Log the string 'hackpath' reversed.", "console.log('hackpath'.split('').reverse().join(''));"),
      ] },
      { title: "Arrays & Loops", description: "Work through lists of values.", challenges: [
        js("Sum an Array", "Add up every number in an array.", "Given nums = [3, 8, 12, 5], log the total.", "const nums = [3, 8, 12, 5];\nlet total = 0;\nfor (const n of nums) total += n;\nconsole.log(total);"),
        js("FizzBuzz", "The classic.", "Print the numbers 1 to 15, one per line. For multiples of 3 print Fizz, for multiples of 5 print Buzz, and for multiples of both print FizzBuzz.", "for (let i = 1; i <= 15; i++) {\n  if (i % 15 === 0) console.log('FizzBuzz');\n  else if (i % 3 === 0) console.log('Fizz');\n  else if (i % 5 === 0) console.log('Buzz');\n  else console.log(i);\n}"),
        js("Largest Number", "Find the biggest value.", "Given nums = [4, 19, 7, 23, 11], log the largest number.", "console.log(Math.max(4, 19, 7, 23, 11));"),
        js("Count the Vowels", "Loop over characters.", "Log how many vowels are in the word 'programming'.", "console.log('programming'.split('').filter(c => 'aeiou'.includes(c)).length);"),
      ] },
    ],
    Intermediate: [
      { title: "Functions", description: "Write reusable pieces of logic.", challenges: [
        js("Arrow Functions", "Write a function with =>.", "Write an arrow function square(n) and log square(9).", "const square = n => n * n;\nconsole.log(square(9));"),
        js("Factorial", "Recursion in action.", "Write a recursive factorial(n) and log factorial(6).", "function factorial(n) { return n <= 1 ? 1 : n * factorial(n - 1); }\nconsole.log(factorial(6));"),
        js("Is It a Palindrome?", "Compare a string with its reverse.", "Write isPalindrome(s) and log isPalindrome('racecar') and isPalindrome('hackpath') on separate lines.", "const isPalindrome = s => s === s.split('').reverse().join('');\nconsole.log(isPalindrome('racecar'));\nconsole.log(isPalindrome('hackpath'));"),
      ] },
      { title: "Objects & Array Methods", description: "map, filter, reduce and friends.", challenges: [
        js("Double Every Number", "Use map.", "Given [1, 2, 3, 4], log the array with every number doubled.", "console.log([1, 2, 3, 4].map(n => n * 2));"),
        js("Only the Evens", "Use filter.", "Given [5, 8, 13, 22, 31, 40], log only the even numbers.", "console.log([5, 8, 13, 22, 31, 40].filter(n => n % 2 === 0));"),
        js("Average Score", "Use reduce.", "Given scores = [72, 88, 95, 64], log the average.", "const scores = [72, 88, 95, 64];\nconsole.log(scores.reduce((a, b) => a + b, 0) / scores.length);"),
      ] },
    ],
    Advanced: [
      { title: "Closures & Higher-Order Functions", description: "Functions that remember and return functions.", challenges: [
        js("Counter Factory", "A closure that counts.", "Write makeCounter() that returns a function counting up from 1. Call it three times, logging each result.", "function makeCounter() { let n = 0; return () => ++n; }\nconst next = makeCounter();\nconsole.log(next());\nconsole.log(next());\nconsole.log(next());"),
        js("Memoised Fibonacci", "Cache results to go fast.", "Log the 40th Fibonacci number using memoisation.", "const memo = {};\nconst fib = n => n < 2 ? n : memo[n] ?? (memo[n] = fib(n - 1) + fib(n - 2));\nconsole.log(fib(40));"),
      ] },
    ],
  } },
  { name: "Java", description: "Strongly typed, object oriented, and everywhere.", levels: {
    Beginner: [
      { title: "Hello, Java", description: "Your first Java programs.", challenges: [
        java("Hello World", "Print a line.", "Print Hello, World!", 'System.out.println("Hello, World!");'),
        java("Integer Maths", "Work with ints.", "Declare int a = 12 and int b = 5. Print a * b.", "int a = 12;\n    int b = 5;\n    System.out.println(a * b);"),
        java("Loop to Ten", "A for loop.", "Print the numbers 1 to 10 on one line, separated by spaces.", 'StringBuilder sb = new StringBuilder();\n    for (int i = 1; i <= 10; i++) sb.append(i).append(i < 10 ? " " : "");\n    System.out.println(sb);'),
      ] },
    ],
    Intermediate: [
      { title: "Classes & Objects", description: "Model things with classes.", challenges: [
        java("String Builder", "Build a string efficiently.", "Use a StringBuilder to print the alphabet a to e with no spaces.", 'StringBuilder sb = new StringBuilder();\n    for (char c = \'a\'; c <= \'e\'; c++) sb.append(c);\n    System.out.println(sb);'),
      ] },
    ],
  } },
];

// The student in the screenshots, and the people above and below them on the leaderboard.
const DEMO = { name: "Amina Yusuf", email: "demo@hackpath.dev", username: "amina.codes", gender: "female" };
const RIVALS = [
  ["Daniel Okafor", "dan.okafor", 2240, 21], ["Priya Sharma", "priyacodes", 1630, 14], ["Tom Becker", "tbecker", 980, 9],
  ["Leila Haddad", "leila.h", 610, 6], ["Marcus Lee", "mlee", 455, 4], ["Sofia Rossi", "sofia.r", 210, 3],
  ["Yusuf Ali", "yusuf.dev", 120, 2], ["Hannah Park", "hpark", 60, 1],
];

const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
const dateOnly = d => d.toISOString().slice(0, 10);

async function makeUser({ name, email, username, gender }, role, hash) {
  const user = await User.create({ name, email, passwordHash: hash, role });
  await Profile.create({ userId: user.id, username, gender });
  return user;
}

async function setStats(user, xp, streakCount) {
  const { level } = applyLevelUps({ xp, level: 1 });
  await UserStats.create({ userId: user.id, xp, level, streakCount, rank: getRankFromXp(xp).name, lastActiveDate: dateOnly(new Date()) });
}

async function run() {
  await sequelize.authenticate();
  if (!/demo/i.test(sequelize.getDatabaseName())) throw new Error(`Refusing to seed "${sequelize.getDatabaseName()}": use a database with "demo" in its name.`);
  if (process.argv.includes("--reset")) await sequelize.sync({ force: true });
  for (const f of ["seedBadges.js", "seedAchievements.js"]) execFileSync("node", [path.resolve("seeders", f)], { stdio: "ignore" });
  if (await Subject.count()) throw new Error("This database already has subjects; seed-demo.js only fills an empty one.");

  const levels = {};
  for (const s of CURRICULUM) {
    const subject = await Subject.create({ name: s.name, description: s.description });
    for (const [level, sections] of Object.entries(s.levels)) {
      const difficulty = await Difficulty.create({ name: level, subjectId: subject.id });
      const challenges = [];
      for (const [i, sec] of sections.entries()) {
        const section = await Section.create({ title: sec.title, description: sec.description, order: i + 1, difficultyId: difficulty.id });
        for (const [j, c] of sec.challenges.entries()) challenges.push(await Challenge.create({ ...c, order: j + 1, sectionId: section.id }));
      }
      levels[`${s.name} ${level}`] = { difficulty, challenges };
    }
  }

  const hash = await bcrypt.hash(PASSWORD, 10);
  await makeUser({ name: "HackPath Admin", email: "admin@hackpath.dev", username: "admin" }, "admin", hash);

  // Amina: most of JavaScript Beginner done over the past week, just started Intermediate. Four of her
  // solves were first time, so solving the next one first time unlocks Sharp Shooter in the videos.
  const amina = await makeUser(DEMO, "student", hash);
  await setStats(amina, 745, 7);
  const jsBeg = levels["JavaScript Beginner"], jsInt = levels["JavaScript Intermediate"];
  for (const d of [jsBeg, jsInt]) await UserSubscription.create({ userId: amina.id, difficultyId: d.difficulty.id });
  const solved = [...jsBeg.challenges.slice(0, 9), ...jsInt.challenges.slice(0, 2)];
  for (const [i, c] of solved.entries()) {
    const when = daysAgo(Math.max(0, 6 - Math.floor(i / 2)));
    if (i % 3 !== 0) await ChallengeAttempt.create({ userId: amina.id, challengeId: c.id, languageId: c.languageId,
      submittedCode: "// first try", isCorrect: false, feedback: "Incorrect ❌", createdAt: when, updatedAt: when });
    await ChallengeAttempt.create({ userId: amina.id, challengeId: c.id, languageId: c.languageId,
      submittedCode: c.solution, isCorrect: true, feedback: "Correct ✅", createdAt: when, updatedAt: when });
  }
  for (const key of ["first_win", "first_perfect", "five_completed"]) {
    const badge = await Badge.findOne({ where: { key } });
    if (badge) await UserBadge.create({ userId: amina.id, badgeId: badge.id, earnedAt: daysAgo(3) });
  }
  for (const key of ["ten_wins", "streak_7", "level_10"]) {
    const ach = await Achievement.findOne({ where: { key } });
    if (ach) await UserAchievement.create({ userId: amina.id, achievementId: ach.id, earnedAt: daysAgo(1) });
  }

  // Everyone else: enough activity for the leaderboard and the admin analytics.
  const all = Object.values(levels).flatMap(l => l.challenges);
  for (const [i, [name, username, xp, streak]] of RIVALS.entries()) {
    const u = await makeUser({ name, email: `${username.replace(/\W/g, "")}@example.com`, username }, "student", hash);
    await setStats(u, xp, streak);
    await UserSubscription.create({ userId: u.id, difficultyId: jsBeg.difficulty.id });
    for (const [j, c] of all.slice(0, Math.min(all.length, Math.round(xp / 90))).entries()) {
      const when = daysAgo((i + j) % 14);
      await ChallengeAttempt.create({ userId: u.id, challengeId: c.id, languageId: c.languageId, submittedCode: c.solution,
        isCorrect: (i + j) % 5 !== 0, feedback: "", createdAt: when, updatedAt: when });
    }
  }

  console.log(`Demo data ready. Log in as ${DEMO.email} or admin@hackpath.dev with ${PASSWORD}`);
  await sequelize.close();
}

run().catch(e => { console.error("seed-demo failed:", e); process.exit(1); });
