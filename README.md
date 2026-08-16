# Weekly Project Bot

Har hafte automatically: problem research -> spec proposal -> (tumhari approval) -> code generate -> test -> naya GitHub repo push.

## Kaise Setup Karein

### 1. Is folder ko naye GitHub repo mein daalo
```bash
cd weekly-project-bot
git init
git add .
git commit -m "init weekly-project-bot"
gh repo create weekly-project-bot --private --source=. --push
```
Isi repo mein Issues create honge har hafte (proposal ke liye).

### 2. Gemini API key banao (FREE, no card required)
- [aistudio.google.com](https://aistudio.google.com) pe jao, Google account se login karo
- "Get API key" > "Create API key" click karo
- Free tier: `gemini-2.5-flash` model, roughly 10-15 requests/minute, koi card nahi chahiye

### 3. GitHub Personal Access Token (PAT) banao
- GitHub > Settings > Developer settings > Personal access tokens > Fine-grained (ya classic)
- Scopes: `repo` (full), aur agar org mein banate ho toh `admin:org` bhi
- **Important:** default `GITHUB_TOKEN` se naya repo account mein create nahi ho sakta, isliye PAT zaroori hai

### 4. Repo Secrets set karo
`weekly-project-bot` repo > Settings > Secrets and variables > Actions:
- `GEMINI_API_KEY` — Step 2 wali key
- `GH_PAT` — Step 3 wala token

`Settings > Secrets and variables > Actions > Variables` tab mein:
- `GITHUB_USERNAME` — tumhara GitHub username

### 5. Workflow permissions on karo
Repo > Settings > Actions > General > Workflow permissions:
- "Read and write permissions" select karo (Issues create karne ke liye zaroori)

### 6. Label banao
Repo > Issues > Labels > New label:
- `needs-approval`
- `approved`

## Kaise Chalega

1. Har **Monday** `weekly-research.yml` khud chalega (ya "Actions" tab se manually "Run workflow" click karo test karne ke liye)
2. Ek naya **Issue** banega proposal ke saath — problem, solution, tech stack, MVP features
3. Tum issue padho. Approve karna ho toh us par **`approved` label lagao**
4. Label lagते hi `build-on-approval.yml` khud trigger hoga:
   - Claude se poora code generate hoga
   - Tests run honge
   - Naya public repo banega tumhare account mein
   - Issue par comment aayega repo link ke saath

## Local Testing (optional)

```bash
npm install
Copy-Item .env.example .env   # values fill karo (PowerShell)
node scripts/research.js   # ek proposal issue banayega
```

## Notes / Limitations

- Ek hafte mein sirf ek MVP-level skeleton banega — production-ready nahi hoga, review zaroor karna
- Reddit/HN se scraping public JSON endpoints use karti hai (no auth) — agar rate-limited ho jaye toh thoda delay add karna padega
- Test failures pe abhi bhi push ho jayega (with a warning) — chaho toh `build-on-approval.yml` mein wo step strict bana sakte ho (`npm test` fail hone par pura job fail kar do)
- **Gemini free tier limits:** `gemini-2.5-flash` par roughly 10-15 requests/minute, per-day request cap bhi hai. Weekly use ke liye ye kaafi zyada hai, koi dikkat nahi aani chahiye
- Baad mein agar quality upgrade karni ho toh Claude API pe switch kar sakte ho — bas `scripts/research.js` aur `scripts/build.js` mein SDK call wapas Anthropic SDK se replace karna hoga
