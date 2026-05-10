-- wizard_scores のスコア制約を 0-9 から 1-5 に変更
alter table wizard_scores drop constraint if exists wizard_scores_score_check;
alter table wizard_scores add constraint wizard_scores_score_check check (score between 1 and 5);

-- 既存データを新スケールに変換（0→1, 1-3→2, 4-6→3, 7-9→4）
update wizard_scores set score = 1 where score = 0;
update wizard_scores set score = 2 where score between 1 and 3;
update wizard_scores set score = 3 where score between 4 and 6;
update wizard_scores set score = 4 where score between 7 and 9;
