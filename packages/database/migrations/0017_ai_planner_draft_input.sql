ALTER TABLE ai_planner_drafts
  ADD COLUMN input_text text NOT NULL DEFAULT '',
  ADD COLUMN image_asset_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[];

ALTER TABLE ai_planner_drafts
  ADD CONSTRAINT ai_planner_drafts_input_text_length_check
    CHECK (char_length(input_text) <= 2000),
  ADD CONSTRAINT ai_planner_drafts_image_count_check
    CHECK (cardinality(image_asset_ids) <= 3);
