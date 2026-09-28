ALTER TABLE feedback_reports
  ADD COLUMN category text NOT NULL DEFAULT 'feedback',
  ADD COLUMN marketing_use_allowed boolean NOT NULL DEFAULT false,
  ADD COLUMN ai_training_use_allowed boolean NOT NULL DEFAULT false;

ALTER TABLE feedback_reports
  ADD CONSTRAINT feedback_reports_category_check
    CHECK (category IN ('feedback', 'problem')),
  ADD CONSTRAINT feedback_reports_marketing_use_check
    CHECK (marketing_use_allowed = false),
  ADD CONSTRAINT feedback_reports_ai_training_use_check
    CHECK (ai_training_use_allowed = false);
