---
name: kskills:create-skill
description: Create a new agent skill in this repository following its layout contract. Use when the user asks to add a new skill, scaffold a skill, or turn a repeated workflow into a reusable skill.
---

# Create Skill

Scaffold a new skill in this repository (kaos-works/kskills) that is installable by
the open skills ecosystem (`npx skills add kaos-works/kskills`).

## Repository layout contract

This repo uses the flat-collection layout that the skills CLI discovers
without any manifest:

```
skills/<skill-name>/SKILL.md      ← each directory here is one installable unit
_template/                        ← scaffold source (*.tmpl), never discovered
```

## Steps

1. Copy `_template/SKILL.md.tmpl` → `skills/<kebab-name>/SKILL.md` and
   `_template/reference.md.tmpl` → `skills/<kebab-name>/reference.md`.
   Directory name = kebab-case of the frontmatter `name`.
2. Fill the frontmatter. Both fields are required and must be strings:
   - `name`: lowercase, hyphens, matches the directory name
   - `description`: what it does + when to use it, in trigger language the
     agent can match ("Use when..."). This is the routing signal; the body is
     only opened after the skill is selected.
3. Replace every placeholder (`{{...}}`) in the body. Sections: "When to use"
   (positive triggers and one explicit exclusion), "Steps" (imperative,
   ending with a verification step), "Notes" (edge cases).
4. Optional supporting files:
   - `reference.md` — long-form detail the agent opens on demand
   - `scripts/` — executable helpers the body may instruct the agent to run
   - `templates/` — snippets/files to copy into target projects
   Excluded from install automatically: `metadata.json`, `.git/`,
   `__pycache__/`. Keep SKILL.md under ~500 lines.
5. Verify before committing, in this order — the farm engine first, the open
   ecosystem second:

```sh
kskills catalog --emit .          # 1) kskills 엔진 발견 — 이 리포의 실제 소비자(팜 설치)가 읽는 목록.
                                   #    신규 스킬이 이름으로 나와야 한다.
npx skills add . --list           # 2) 오픈 생태계 호환성(`npx skills add kaos-works/kskills`) — 경고 0 확인.
```

The new skill must appear by its frontmatter name in **both** outputs, and no
warnings may be printed. If it does not appear, check frontmatter syntax
(YAML only — no `---js`), missing fields, or wrong directory depth.

6. Add a row to the catalog table in `README.md` (skill name → one-line purpose).
7. Commit with `skill: add <name>`.

## Notes

- One directory = one skill. Never nest a SKILL.md inside another skill's
  directory; discovery stops descending once it finds one (shadowing rule).
- Internal/WIP skills: add `metadata: { internal: true }` to hide from
  discovery. Installable only with explicit `-s` selection.
- Do not create a root `SKILL.md` in this repo — a root SKILL.md makes the
  whole repo resolve as a single skill and shadows the collection.
- Never name a template file `SKILL.md` outside `skills/<name>/` — even
  invalid YAML placeholders produce noisy parse warnings on every `--list`.
