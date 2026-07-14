alter table patients add column if not exists global_patient_key text;
alter table patients add column if not exists access_password_hash text;
alter table patients add column if not exists access_password_salt text;
alter table patients add column if not exists access_password_set_at timestamptz;
alter table patients add column if not exists access_failed_attempts int not null default 0;
alter table patients add column if not exists access_locked_until timestamptz;

create index if not exists patients_global_patient_key_idx on patients(global_patient_key);
create index if not exists patients_access_lookup_idx on patients(patient_code, cnic);
