# Performance Appraisal Research

Date: 2026-04-28

## Sources Reviewed

- HiBob Talent / Performance: https://www.hibob.com/features/performance/
- BambooHR Performance Management: https://www.bamboohr.com/platform/performance-management/
- BambooHR Performance Management overview: https://www.bamboohr.com/hr-software/performance-management
- BambooHR performance review guide: https://www.bamboohr.com/resources/hr-glossary/performance-review
- TechTarget performance review best practices: https://www.techtarget.com/searchhrsoftware/feature/Best-practices-in-performance-reviews

## Research Summary

Modern HRMS performance modules tend to combine three ideas:

- **Goals:** individual/team goals with due dates, progress tracking, and manager visibility.
- **Review cycles:** configurable periods where employees and managers complete structured appraisals.
- **Feedback:** manager review, optional self-review, sometimes peer or 360 feedback.

HiBob emphasizes configurable review cycles, goals connected to reviews, visual progress tracking, 360 reviews, and manager/employee dialogue. BambooHR similarly highlights simple review cycles, goals, one-on-ones, self assessment, manager assessment, 360 feedback, reminders, and progress reporting. Best-practice guidance warns against making performance a once-a-year surprise; reviews should summarize goals and feedback already discussed.

## KushHR MVP Recommendation

Keep v1 deliberately simple. Do not build 360 feedback, calibration grids, one-on-one scheduling, AI summaries, or compensation calibration.

Build:

- A manager/admin-created goal list for each employee.
- Goal status and progress percentage.
- Simple appraisal cycles, such as "2026 H1 Review" or "Probation 90-day Review".
- Manager appraisal form with a required 1-5 score and written strengths / improvement / next steps.
- Optional employee self-comment before manager submission.
- Employee acknowledgement after the manager submits the appraisal.
- Admin visibility across all appraisals; manager visibility for direct reports; employee visibility for own goals and submitted appraisals.

## Suggested Scoring

Use a 1-5 integer score:

- 1 - Needs significant improvement.
- 2 - Partially meets expectations.
- 3 - Meets expectations.
- 4 - Exceeds expectations.
- 5 - Outstanding.

Store the score as an integer with a database check constraint (`score between 1 and 5`). Do not store salary or compensation decisions in appraisal tables.

## Suggested Statuses

Goals:

- `not_started`
- `in_progress`
- `completed`
- `cancelled`

Review cycles:

- `draft`
- `active`
- `closed`

Reviews:

- `draft`
- `self_reviewed`
- `manager_submitted`
- `acknowledged`

## Audit Events

- `performance.goal_created`
- `performance.goal_updated`
- `performance.goal_closed`
- `performance.cycle_created`
- `performance.cycle_activated`
- `performance.review_self_submitted`
- `performance.review_manager_submitted`
- `performance.review_acknowledged`
- `auth.access_denied`

## Deferred

- Peer feedback / 360 reviews.
- Calibration and 9-box grids.
- Automated reminder schedules.
- Performance-to-compensation decisions.
- AI summaries or writing assistance.
- Company/team OKR hierarchy.
