-- Custom SQL migration file, put your code below! --
-- Reproduire dans les entrées le partage quotidien qui était auparavant
-- calculé uniquement au moment de l'export des semaines déjà fermées.
WITH ranked_entries AS (
  SELECT
    entry.id,
    day.billed_minutes,
    entry.duration_minutes,
    coalesce(
      sum(entry.duration_minutes) OVER (
        PARTITION BY closure.user_id, closure.client_id, entry.work_date
        ORDER BY entry.created_at, entry.id
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ),
      0
    ) AS prior_actual_minutes,
    row_number() OVER (
      PARTITION BY closure.user_id, closure.client_id, entry.work_date
      ORDER BY entry.created_at DESC, entry.id DESC
    ) AS reverse_position
  FROM hour_bank_days day
  JOIN hour_bank_closures closure ON closure.id = day.closure_id
  JOIN projects project ON project.client_id = closure.client_id
  JOIN work_entries entry
    ON entry.project_id = project.id
    AND entry.user_id = closure.user_id
    AND entry.work_date = day.work_date
    AND entry.is_deleted = false
),
allocated AS (
  SELECT
    id,
    CASE
      WHEN reverse_position = 1
        THEN greatest(billed_minutes - prior_actual_minutes, 0)
      ELSE greatest(
        least(duration_minutes, billed_minutes - prior_actual_minutes),
        0
      )
    END AS client_minutes
  FROM ranked_entries
)
UPDATE work_entries entry
SET client_minutes = allocated.client_minutes
FROM allocated
WHERE entry.id = allocated.id;
