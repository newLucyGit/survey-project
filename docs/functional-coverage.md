# Functional Coverage — 360-feedback branch

Last updated: 2025-08-31

This document outlines the end-to-end functional coverage of the FeedbackTool application as implemented in the 360-feedback branch, including seeded (dummy) data used for demo and testing.

## Scope overview

- 360° feedback workflow using a single public survey URL gated by email + auth code.
- Flat participant model by role: self, manager, peer, reportee.
- Mixed question types (MCQ and Text) across categories; survey copies a subset from a question bank.
- Survey lifecycle (draft → active → ended/completed) with guards.
- Admin UI for creating, assigning participants, starting/ending surveys, and viewing responses with summary metrics.
- Seeded demo data: companies, employees with hierarchy and auth codes, one fully-populated 360 survey, participants across roles, and pre-filled responses.

## Key user journeys

1) Public survey taking (single URL)
- A public URL token identifies the active survey.
- Participant enters company email and personal auth code; allowed roles are returned based on assignments.
- Participant chooses a role and answers the role-specific questions (mix of MCQ and Text).
- Submission is validated against assignments; duplicate submissions are prevented per participant per role.

2) Survey authoring and lifecycle
- Create surveys from the admin UI (draft by default).
- Start survey generates a single URL token and sets status to active.
- End survey blocks participant edits (assignments lock) and marks as ended/completed.

3) Participants assignment
- Admin assigns employees across roles: self, manager, peer, reportee.
- Rule: Any non-self role assignment implies/requires a self assignment for that employee.
- Employees list is filtered to the survey’s company.
- Edits are blocked after the survey is ended.

4) Responses review
- Admin can view responses for a survey, grouped by employee and feedback role.
- View Survey includes a participants list and summary counts (total participants, total submissions, per-role counts).

## Data model essentials (high level)

- companies: id, name
- employees: id, company_id, name, email, manager_id, auth_code
- categories: id, name
- questions: id, category_id, text, type (MCQ/Text)
- options: id, question_id, text (for MCQ)
- surveys: id, company_id, name, status, url_token, start/end timestamps
- survey_feedback_types: survey_id, feedback_type (self/manager/peer/reportee)
- survey_questions: survey_id, question_id, feedback_type (copy from bank)
- survey_question_options: survey_id, question_id, option_id (for MCQ copy)
- survey_participants: survey_id, employee_id, feedback_type (flat roles)
- survey_responses: survey_id, employee_id, feedback_type, answers payload

Note: The subject_employee_id column exists but is not used in the flat model for this branch’s public flow.

## API surface (selected)

- GET /api/validate-survey-token/:token — Validate & fetch survey basics for public access.
- POST /api/authenticate-survey-participant — Email + auth code → allowed roles and role-specific questions.
- POST /api/survey-responses — Submit answers; validates assignment; prevents duplicates.
- GET /api/surveys/:id/participants — List assigned participants grouped by role.
- PUT /api/surveys/:id/participants — Replace assignments by role; disallowed after end.
- POST /api/surveys/:id/start — Generate url_token and set survey active.
- PUT /api/surveys/:id/status — Update lifecycle status (e.g., end/complete).
- GET /api/surveys/:id/urls — Return single public URL.
- GET /api/surveys/:id/responses — List responses joined to survey questions, grouped and filterable by role.

## Frontend capabilities (React)

- SurveyCreator
  - Create/edit surveys (draft), start, end, view response summaries.
  - Assign Participants modal: single grid with four role checkboxes per employee; filtered by company; one Save.
  - View Survey modal: participants list and summary badges (total participants, total submissions, per-role totals); questions grouped by role.
  - View Responses modal: group by employee + feedback role; filter by role; display question category and type.
- SurveyTaking (public)
  - Token-based access; email + auth code gate.
  - Role selection based on allowed roles; render mixed MCQ/Text questions; submit with validation and duplicate prevention.

## Validation and guardrails

- Assignment validation: Only assigned participants can submit for a role.
- Duplicate prevention: One submission per participant per role.
- Lifecycle guard: Participant edits blocked once survey is ended.
- Company scoping: Assignments UI only shows employees from the survey’s company.
- SPA routing: Frontend served via nginx with fallback for client-side routes.

## Seeded (dummy) data

- Companies and employees
  - Multiple companies with a manager hierarchy per company.
  - Employee auth codes auto-generated for login to the public survey flow.
- Question bank
  - Categories include: Purpose, Personal Development, Presence, People Skills, Practicalities, Principles.
  - Mixed question types (MCQ and Text) across categories with MCQ options stored.
- Demo survey
  - Name: "Demo 360 Survey (Self/Manager/Peer)" for company 1.
  - Status: active with generated url_token and single public URL.
  - Feedback types enabled: self, manager, peer, reportee.
  - Survey questions: for each feedback type, a small set copied from the bank (e.g., 2 MCQ + 1 Text) with options replicated for MCQs.
- Participants
  - At least one participant per role; any manager/peer/reportee assignment automatically includes self.
- Responses
  - Pre-seeded responses for all assigned participants and roles.
  - MCQ answers typically select the first option; Text answers use placeholder content sufficient for demo.

How to demo
- From admin UI: open a survey card → View Survey to see participants list and summary counts; View Responses to inspect grouped answers.
- From public side: use the single survey URL, enter a seeded employee email and their auth code; pick an allowed role; submit.

## Non-functional and deployment

- Dockerized frontend (CRA + nginx SPA fallback) and backend (Express + SQLite).
- Environment variables include FRONTEND_BASE_URL and CORS origins for public flow.
- Fresh no-cache builds verified; containers start with seeders/migrations.

## Known limitations in this branch

- Flat participant model (no subject+rater selection) by design for the single-URL flow.
- Minimal duplicate handling beyond one-per-role constraint; no edit-after-submit.
- Limited analytics beyond summary counts; no exports beyond existing scripts.

## Traceability to requested outcomes

- Mixed question types per category: Implemented and seeded.
- One survey with all four roles defined: Implemented and seeded.
- Participants across roles with self-required rule: Implemented and enforced.
- Seeded responses visible in View Responses: Implemented.
- View Survey includes participants list and summary counts: Implemented.
- Fresh rebuild completed to surface updates: Done.

---
This document intends to capture what works functionally in 360-feedback so QA, demo, and further development can proceed confidently.
