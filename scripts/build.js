// scripts/build.js
// Triggered after human approval. Reads spec from the issue, asks Claude to generate
// a working MVP codebase, writes it to ./generated-project (workflow pushes it after this).

import { GoogleGenAI } from "@google/genai";
import { Octokit } from "@octokit/rest";
import fs from "fs";
import path from "path";
import "dotenv/config";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const apiKey = requiredEnv("GEMINI_API_KEY");
const githubToken = requiredEnv("GH_PAT");
const orchestrationRepo = requiredEnv("ORCHESTRATION_REPO");
const [OWNER, REPO] = orchestrationRepo.split("/");
if (!OWNER || !REPO) {
  throw new Error("ORCHESTRATION_REPO must use the format owner/repository");
}
const ISSUE_NUMBER = requiredEnv("ISSUE_NUMBER"); // passed by the workflow

const ai = new GoogleGenAI({ apiKey });
const octokit = new Octokit({ auth: githubToken });

const OUT_DIR = path.resolve("generated-project");

// ---- 1. Pull spec JSON back out of the approved issue body ----

async function getSpecFromIssue() {
  const { data: issue } = await octokit.issues.get({
    owner: OWNER,
    repo: REPO,
    issue_number: ISSUE_NUMBER,
  });
  const match = issue.body.match(/SPEC_JSON\n([\s\S]*?)\nSPEC_JSON/);
  if (!match) throw new Error("Could not find spec JSON in issue body");
  return JSON.parse(match[1]);
}

// ---- 2. Ask Claude to generate the full project as a JSON file map ----

async function generateProject(spec) {
  const prompt = `Tumhe ek MVP project banana hai is spec ke basis par:

${JSON.stringify(spec, null, 2)}

Requirements:
- Simple, working, runnable MVP (over-engineering mat karo)
- Include a README.md explaining the problem, solution, aur setup/run instructions
- Include at least one basic test file
- Use the suggested tech_stack
- Keep the entire JSON response under 6,000 characters: use at most 5 small files and no large assets.
- Prefer browser-native APIs or Node built-ins over dependencies, and implement only the essential MVP flow.

STRICT JSON format mein jawab do (kuch aur text nahi, koi markdown fences nahi), is shape mein:
{
  "files": [
    { "path": "README.md", "content": "..." },
    { "path": "package.json", "content": "..." },
    { "path": "src/index.js", "content": "..." },
    { "path": "tests/basic.test.js", "content": "..." }
  ]
}

Content strings mein actual file content ho, properly escaped.`;

  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `${prompt}\nThis is attempt ${attempt}; return a complete, valid JSON object only.`,
      config: {
        maxOutputTokens: 12000,
        responseMimeType: "application/json",
      },
    });

    try {
      const clean = response.text.replace(/```json|```/g, "").trim();
      return JSON.parse(clean);
    } catch (error) {
      lastError = error;
      console.warn(`Gemini returned invalid project JSON (attempt ${attempt}/2); retrying...`);
    }
  }
  throw lastError;
}

// ---- 3. Write files to disk ----

function writeFiles(project) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const file of project.files) {
    const fullPath = path.join(OUT_DIR, file.path);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, file.content);
    console.log("Wrote", file.path);
  }
}

// ---- Main ----

async function main() {
  const spec = await getSpecFromIssue();
  console.log("Building:", spec.repo_name);

  const project = await generateProject(spec);
  writeFiles(project);

  // Save repo_name for the workflow step that does `gh repo create`
  fs.writeFileSync(
    path.resolve("repo-name.txt"),
    spec.repo_name.trim()
  );

  console.log("Project generated at ./generated-project");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
