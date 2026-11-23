# QC Inspect — 12-week delivery plan

**Goal:** every QC inspection in our Bangladesh factories is recorded on a phone, works without
internet, and produces a buyer-ready report the same day, replacing paper and Excel forms.

**How we'll know it worked (measured during the pilot, weeks 8–9):**

| KPI | Today (to confirm in week 1) | Target |
|---|---|---|
| Time from end of inspection to report at the buyer | 1–2 days | **same day** |
| Inspector time per final inspection | baseline | **−20 %** |
| Inspections with photo evidence of every defect | partial | **100 %** |
| Inspection data lost (dead phone, no signal) | unknown | **0** |
| Reports needing re-work after manager review | baseline | **−50 %** |

The working prototype (this repository) de-risks the hard technical parts up front: offline sync,
AQL logic, photos, the PDF report, sharing permissions and Google Drive export. The plan therefore
spends its time on **people, real data and rollout**, not on re-inventing the engine.

## Timeline

| Week | Phase | What happens | Deliverable (shown in the weekly update) |
|---|---|---|---|
| 1 | **Discover** | Shadow inspectors at 2 garment + 1 hard-goods factory. Collect paper forms, Excel sheets and each buyer's QA manual. Note the phones inspectors use and the signal on each floor. | Current-process map, baseline KPIs, list of buyers' requirements |
| 2 | Discover | Workshop with QA management: defect lists, AQL rules, report layout and roles. Prototype walkthrough with 3 inspectors. | Signed-off requirements (2 pages), template list, prioritised backlog |
| 3 | **Foundation** | Production Supabase project (Pro), staging environment, backups, CI/CD. Roles and accounts for all inspectors and managers. | Staging URL; everyone can sign in |
| 4 | Foundation | Templates move from code into the database, with an admin screen for managers. Import master data (factories, buyers, POs) from Google Sheets / ERP export. | Managers edit templates themselves; real factory and PO lists in the app |
| 5 | **Build MVP** | Harden the inspection flow on real templates. Photo annotation (circle the defect). Bangla reviewed by inspectors. | MVP on staging, tested on the inspectors' own phones |
| 6 | Build MVP | Report layout approved by management and 1–2 buyers. Google Drive / Sheets export live for the company account. Manager dashboard. | Approved report; reports appearing in Drive automatically |
| 7 | Build MVP | Field test of offline behaviour on the lowest-end phone, in the worst-signal area. Fix-list from tests. Training material in Bangla. | Test report, user guide (EN/BN), 1-page quick card |
| 8 | **Pilot** | 3 inspectors, 2 factories, about 30 real inspections, run **in parallel with paper**. Daily check-in, fixes released every 2–3 days. | Pilot dashboard: KPIs vs. baseline |
| 9 | Pilot | Second pilot week. Collect buyer feedback on received reports. Go / no-go meeting with management. | Pilot results + go/no-go decision |
| 10 | **Roll out** | All inspectors onboarded in small groups, with 1-hour training in Bangla. Paper stops for trained inspectors. | Adoption: % of inspections in the app |
| 11 | Roll out | Support and quick fixes. Managers use the Team view and Insights in their weekly QA meeting. | Weekly quality report produced from the app |
| 12 | **Handover** | Technical documentation, runbook (backups, adding users, editing templates), knowledge-transfer session, retrospective. | Handover pack + year-1 roadmap |

**Ways of working:** weekly written update every Friday (template below) and a 30-minute demo
every two weeks. All work is tracked on one board (GitHub Projects) that management can see. A
release goes to staging first, then to production after a smoke test.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Inspectors keep using paper | Medium | Involve them from week 1; pilot in parallel; make the app faster than paper (auto AQL, one-tap defects); champions per factory |
| Phones too old or full | Medium | Survey in week 1; app is light (PWA, about 400 KB start-up, photos compressed); a budget phone list if needed |
| No signal on factory floors | High | Offline-first by design; uploads resume automatically; tested in week 7 in the worst area |
| Each buyer wants a different report | High | Templates and buyer profiles are data; report layout agreed once with management |
| Data privacy (buyer data, photos) | Low | Server-enforced permissions (row-level security), sign-in for every shared report, revocable links, daily backups |
| Key-person dependency (one developer) | Medium | Documentation from day one, runbook, tests (90+), knowledge transfer in week 12 |

## Running costs (production)

| Item | Plan | Cost / month | Notes |
|---|---|---|---|
| Backend (database, login, file storage) | Supabase **Pro** | **$25** | 8 GB database per project, 100 K monthly users, 250 GB bandwidth included; extra disk $0.125/GB. The Free plan is fine for the pilot only: it **pauses projects after 1 week without activity**. |
| Web hosting | Vercel **Pro** ($20/user) **or** a free static host | $0–20 | Vercel's free Hobby plan is for **non-commercial use only**. The app is static files, so Cloudflare Pages or Netlify are alternatives (check their terms). |
| Google Drive / Sheets export | Apps Script in the existing Google Workspace | $0 | Uses the company's Drive storage |
| Domain (e.g. qc.company.com) | — | about $1 | optional |
| **Total** | | **about $25–50 / month** | |

**Storage estimate:** 10 inspectors × 2 inspections/day × 15 photos × 300 KB is about 90 MB/day,
or about 22 GB/year. That fits comfortably in Pro; archive photos older than 2 years if needed.
Inspection data itself is about 10 KB per report, which is negligible.

Prices checked November 2026: [Supabase pricing](https://supabase.com/pricing),
[Supabase billing FAQ](https://supabase.com/docs/guides/platform/billing-faq),
[Vercel Hobby plan](https://vercel.com/docs/plans/hobby), [Vercel pricing](https://vercel.com/pricing).

---

## Weekly update — template

> **QC Inspect — week N update** (date)
>
> **Status:** 🟢 on track / 🟡 at risk / 🔴 blocked
>
> **Done this week**
> - …
>
> **Next week**
> - …
>
> **KPIs** (from the pilot onwards): inspections in the app · same-day reports · sync failures
>
> **Risks / decisions needed from management**
> - …

## Weekly update — example (week 5)

*Illustrative example of the format. The names, phones and numbers are invented, not real pilot data.*

> **QC Inspect — week 5 update** (Fri 2 Jan)
>
> **Status:** 🟢 on track
>
> **Done this week**
> - Real templates live on staging: apparel tops/bottoms, towels, ceramics (from the QA manuals of Nordic Home and Maison Lumière).
> - Inspectors Rahim and Sumi tested on their own phones (Redmi 9A, Samsung A12). Both completed a full inspection offline in under 25 minutes.
> - Fixed: the camera opened the front lens on Samsung phones; photos now always use the back camera.
> - Bangla review: 139 strings checked by Sumi. 23 changed to the floor terms inspectors actually use (e.g. "স্টিচ" instead of "সেলাই").
>
> **Next week**
> - Report layout review with management (Tuesday), then send 2 sample reports to Nordic Home for feedback.
> - Turn on Google Drive export for the company account.
>
> **Risks / decisions needed**
> - **Decision:** should factories also get read-only access to their own reports? (Affects roles, about 2 days of work.)
> - Risk: Cumilla factory has no Wi-Fi and weak 3G. Offline mode covers it; the field test is planned for week 7.
