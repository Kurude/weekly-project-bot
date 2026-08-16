// scripts/research.js
// Weekly job: scrape problems -> ask Claude to shortlist ONE -> create GitHub Issue for human approval

import { GoogleGenAI } from "@google/genai";
import { Octokit } from "@octokit/rest";
import fetch from "node-fetch";
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

const ai = new GoogleGenAI({ apiKey });
const octokit = new Octokit({ auth: githubToken });

// ---- 1. Fetch raw pain-point signal from a few free sources ----

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const contentType = res.headers.get("content-type") || "";
  if (!res.ok || !contentType.includes("application/json")) {
    throw new Error(
      `Request failed for ${url} (status ${res.status}, content type ${contentType || "unknown"})`
    );
  }
  return res.json();
}

async function fetchHackerNewsAskHN() {
  const data = await fetchJson(
    "https://hn.algolia.com/api/v1/search_by_date?tags=ask_hn&hitsPerPage=30"
  );
  return data.hits.map((h) => h.title).filter(Boolean);
}

async function fetchRedditPosts(subreddit) {
  const data = await fetchJson(
    `https://www.reddit.com/r/${subreddit}/top.json?t=week&limit=25`,
    { headers: { "User-Agent": "weekly-project-bot/1.0" } }
  );
  return data.data.children.map((c) => c.data.title).filter(Boolean);
}

async function gatherSignals() {
  const sources = [
    ["Hacker News", fetchHackerNewsAskHN()],
    ["r/SaaS", fetchRedditPosts("SaaS")],
    ["r/webdev", fetchRedditPosts("webdev")],
    ["r/Entrepreneur", fetchRedditPosts("Entrepreneur")],
  ];
  const results = await Promise.allSettled(sources.map(([, request]) => request));

  const titles = results.flatMap((result, index) => {
    if (result.status === "fulfilled") return result.value;
    console.warn(`Skipping ${sources[index][0]}: ${result.reason.message}`);
    return [];
  });

  if (titles.length === 0) {
    throw new Error("No research sources returned usable titles");
  }
  return titles;
}

// ---- 2. Ask Claude to extract + rank a single best problem ----

async function pickBestProblem(titles) {
  const prompt = `Neeche Reddit aur Hacker News se post titles ki ek list hai. Inme se recurring
real-world problems dhoondo jo log baar baar face kar rahe hain, aur jinko EK developer
1 hafte mein ek chhota MVP tool bana kar solve kar sakta hai.

Titles:
${titles.map((t) => `- ${t}`).join("\n")}

Sirf EK best problem choose karo (feasibility + frequency + "not already oversaturated"
ke basis par) aur STRICT JSON format mein jawab do, kuch aur text nahi:

{
  "problem": "1-2 line problem statement",
  "target_user": "kaun face karta hai yeh problem",
  "proposed_solution": "3-4 line mein MVP idea",
  "tech_stack": ["..."],
  "mvp_features": ["feature 1", "feature 2", "feature 3"],
  "repo_name": "kebab-case-suggested-repo-name"
}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });

  const text = response.text;
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ---- 3. Create a GitHub Issue for human approval ----

async function createApprovalIssue(spec) {
  const body = `## 🧠 Weekly Project Proposal

**Problem:** ${spec.problem}

**Target user:** ${spec.target_user}

**Proposed solution:** ${spec.proposed_solution}

**Tech stack:** ${spec.tech_stack.join(", ")}

**MVP features:**
${spec.mvp_features.map((f) => `- ${f}`).join("\n")}

**Suggested repo name:** \`${spec.repo_name}\`

---
### 👉 Approve karne ke liye is issue par \`approved\` label lagao.
### ❌ Reject karna ho toh issue close kar do ya comment karo.

<!-- SPEC_JSON
${JSON.stringify(spec)}
SPEC_JSON -->`;

  await octokit.issues.create({
    owner: OWNER,
    repo: REPO,
    title: `Proposal: ${spec.repo_name}`,
    body,
    labels: ["needs-approval"],
  });
}

async function verifyOrchestrationRepo() {
  try {
    await octokit.repos.get({ owner: OWNER, repo: REPO });
  } catch (error) {
    if (error.status === 404) {
      throw new Error(
        `Cannot access ${orchestrationRepo}. Create that GitHub repository first, or set ORCHESTRATION_REPO to an existing owner/repository that GH_PAT can access.`
      );
    }
    throw error;
  }
}

// ---- Main ----

async function main() {
  await verifyOrchestrationRepo();
  console.log("Fetching signals...");
  const titles = await gatherSignals();
  console.log(`Got ${titles.length} raw titles. Asking Claude to pick best problem...`);
  const spec = await pickBestProblem(titles);
  console.log("Selected:", spec.repo_name);
  await createApprovalIssue(spec);
  console.log("Approval issue created. Waiting for human review.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
