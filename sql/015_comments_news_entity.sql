-- Migration 015: Allow 'news_article' entity_type for comments on news articles.

ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_entity_type_check;
ALTER TABLE comments
  ADD CONSTRAINT comments_entity_type_check
  CHECK (entity_type IN ('post','lesson_reading','lesson_listening','exam_unit','page','news_article'));
