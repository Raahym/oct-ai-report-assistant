alter table patients
add column if not exists cnic text;

alter table patients
add column if not exists global_patient_key text;

alter table patients
add column if not exists access_password_hash text;

alter table patients
add column if not exists access_password_salt text;

alter table patients
add column if not exists access_password_set_at timestamptz;

alter table patients
add column if not exists access_failed_attempts int not null default 0;

alter table patients
add column if not exists access_locked_until timestamptz;

create unique index if not exists patients_cnic_unique
on patients (cnic)
where cnic is not null and cnic <> '';
