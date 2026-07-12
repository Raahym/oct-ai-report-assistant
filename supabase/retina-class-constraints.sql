-- Allow Retina DR severity classes in saved AI results and editable report templates.
-- Safe to run repeatedly in Supabase SQL editor.

alter table ai_results drop constraint if exists ai_results_predicted_class_check;
alter table ai_results add constraint ai_results_predicted_class_check
check (predicted_class in (
  'CNV',
  'DME',
  'DRUSEN',
  'NORMAL',
  'KCN',
  'SUSPECT',
  'NO_DR',
  'MILD_DR',
  'MODERATE_DR',
  'SEVERE_DR',
  'PROLIFERATIVE_DR'
));

alter table if exists report_templates drop constraint if exists report_templates_disease_class_check;
alter table if exists report_templates add constraint report_templates_disease_class_check
check (disease_class in (
  'CNV',
  'DME',
  'DRUSEN',
  'NORMAL',
  'KCN',
  'SUSPECT',
  'NO_DR',
  'MILD_DR',
  'MODERATE_DR',
  'SEVERE_DR',
  'PROLIFERATIVE_DR'
));
